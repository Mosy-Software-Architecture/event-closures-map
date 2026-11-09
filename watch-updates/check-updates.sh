#!/usr/bin/env bash
# One tick of the latest-updates watcher. Run it from a timer (systemd, cron) during the event.
#
#   check-updates.sh /path/to/watch.env
#
# 1. Downloads the published updates file (stops if it cannot: publishing from an empty list would
#    delete the history).
# 2. Asks a headless agent (`claude -p`, only WebSearch and WebFetch) for new items, as JSON.
# 3. merge.py validates every item (https URL on the allowed domains, every language, lengths, no
#    markup, no repeats) and appends the accepted ones.
# 4. Publishes only that file with publish.py (Firebase Hosting REST API: clones the live version
#    and replaces one path, so the rest of the site is untouched).
#
# The agent never sees credentials or the file system: it runs in an empty temp dir, with only
# WebSearch and WebFetch, no MCP servers, no user settings and a clean environment, and its answer
# is treated as untrusted data.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
conf="${1:-${WATCH_ENV:-$here/watch.env}}"
[[ -f "$conf" ]] || { echo "config not found: $conf (copy watch.env.example)"; exit 2; }
# sourced without exporting: the agent below must not inherit any of these values
. "$conf"
: "${DATA_DIR:?DATA_DIR (the event data folder) is required}" "${FIREBASE_SITE:?FIREBASE_SITE is required}" "${CREDENTIALS:?CREDENTIALS is required}"
ALLOWED_DOMAINS="${ALLOWED_DOMAINS:-$DATA_DIR/watch/allowed-domains.txt}"
PROMPT_FILE="${PROMPT_FILE:-$( [[ -f "$DATA_DIR/watch/prompt.md" ]] && echo "$DATA_DIR/watch/prompt.md" || echo "$here/prompt.md")}"
STATE_DIR="${STATE_DIR:-$HOME/.local/state/event-closures-map}"
CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
mkdir -p "$STATE_DIR"
log(){ echo "$(date '+%F %T') $*"; }

read -r site_url updates_path langs <<<"$(python3 - "$DATA_DIR/event.json" <<'PY'
import json, sys
e = json.load(open(sys.argv[1]))
print((e.get("site") or {}).get("url", ""), (e.get("updates") or {}).get("path", "data/updates.json"), ",".join(e.get("languages") or ["es", "en"]))
PY
)"
SITE_URL="${SITE_URL:-$site_url}"
[[ -n "$SITE_URL" ]] || { log "no SITE_URL and no event.site.url"; exit 2; }
[[ "$updates_path" =~ ^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*\.json$ ]] || { log "refusing updates path: $updates_path"; exit 2; }
url="${SITE_URL%/}/$updates_path"

# Optional end of the watch: after STOP_AFTER ("2027-04-25 16:00") the timer disables itself.
if [[ -n "${STOP_AFTER:-}" && "$(date +%s)" -gt "$(date -d "$STOP_AFTER" +%s)" ]]; then
  log "event over, disabling ${TIMER_UNIT:-the timer}"; [[ -n "${TIMER_UNIT:-}" ]] && systemctl --user disable --now "$TIMER_UNIT" || true; exit 0
fi

curl -fsS --max-time 20 "$url?ts=$(date +%s)" -o "$STATE_DIR/updates.json" || { log "cannot download $url"; exit 1; }
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert isinstance(d.get("items"), list)' "$STATE_DIR/updates.json"

now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
prompt="$(python3 - "$PROMPT_FILE" "$DATA_DIR" "$STATE_DIR/updates.json" "$now" "$langs" "$ALLOWED_DOMAINS" <<'PY'
import json, sys, datetime, locale
try: locale.setlocale(locale.LC_TIME, "")
except Exception: pass
tpl, data, published, now, langs, domains = sys.argv[1:7]
e = json.load(open(f"{data}/event.json"))
langs = langs.split(",")
name = e.get("name"); name = name.get(langs[0]) or next(iter(name.values())) if isinstance(name, dict) else name
try: sources = [s["url"] for s in json.load(open(f"{data}/sources.json"))["sources"]]
except Exception: sources = []
doms = [l.split("#")[0].strip() for l in open(domains) if l.split("#")[0].strip()]
current = [{"time": i.get("time"), langs[0]: i.get(langs[0]), "source": i.get("source"), "url": i.get("url")} for i in json.load(open(published))["items"]]
example = {"time": now, **{l: "..." for l in langs}, "source": "...", "url": "https://..."}
vals = {"EVENT": name, "CITY": e.get("city", ""), "DATE": e.get("date", ""), "TIMEZONE": e.get("timezone", ""),
        "NOW": datetime.datetime.now().strftime("%A %d %B %Y, %H:%M"), "ISO": now, "LANGS": ", ".join(langs),
        "SOURCES": "\n".join("- " + s for s in sources), "DOMAINS": ", ".join(doms),
        "CURRENT": json.dumps(current, ensure_ascii=False), "EXAMPLE": json.dumps([example], ensure_ascii=False)}
out = open(tpl, encoding="utf-8").read()
for k, v in vals.items(): out = out.replace("{{" + k + "}}", str(v))
print(out)
PY
)"
log "asking the agent"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
# --tools limits the agent to these two tools (allowedTools alone only skips the prompt for them);
# --strict-mcp-config and --setting-sources "" keep the user's MCP servers and allow rules out;
# env -i gives it a clean environment with no config values or credential paths.
( cd "$work" && env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" timeout 900 "$CLAUDE_BIN" -p "$prompt" \
    --tools "WebSearch,WebFetch" --allowedTools "WebSearch,WebFetch" --strict-mcp-config --setting-sources "" \
    > "$work/answer.txt" 2>>"$STATE_DIR/agent.err" ) || log "agent exited with $? (continuing with whatever it printed)"

python3 "$here/merge.py" "$STATE_DIR/updates.json" "$work/answer.txt" "$now" "$STATE_DIR/new.json" --langs "$langs" --domains "$ALLOWED_DOMAINS" --pending "$STATE_DIR/pending.json"
if [[ -s "$STATE_DIR/pending.json" && "$(cat "$STATE_DIR/pending.json")" != "[]" ]]; then log "items waiting for review in $STATE_DIR/pending.json"; fi

if [[ "$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$STATE_DIR/new.json")" == "0" ]]; then
  # nothing new: refresh the "last check" stamp at most once an hour
  last="$(cat "$STATE_DIR/last-publish" 2>/dev/null || echo 0)"
  if (( $(date +%s) - last < 3600 )); then log "no change"; exit 0; fi
fi
if [[ -n "${DRY_RUN:-}" ]]; then log "DRY_RUN: would publish $STATE_DIR/updates.json to /$updates_path on $FIREBASE_SITE"; exit 0; fi
[[ -f "$CREDENTIALS" ]] || { log "no credentials at $CREDENTIALS, cannot publish"; exit 1; }
case "$CREDENTIALS" in *adc*|*ADC*) cred=(--adc "$CREDENTIALS");; *) cred=(--key "$CREDENTIALS");; esac
GOOGLE_CLOUD_QUOTA_PROJECT="${GOOGLE_CLOUD_QUOTA_PROJECT:-}" python3 "$here/publish.py" --site "$FIREBASE_SITE" "${cred[@]}" "$STATE_DIR/updates.json=/$updates_path"
date +%s > "$STATE_DIR/last-publish"
log "published $(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["items"]))' "$STATE_DIR/updates.json") items"
