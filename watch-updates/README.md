# watch-updates

An optional watcher that keeps the "latest updates" block current during the event, with no one
at the keyboard. Each run of `check-updates.sh`:

1. downloads the published updates file (and stops if it cannot: starting from an empty list
   would erase the history);
2. asks a headless agent for news from the last 24 hours, with `claude -p` restricted to
   `WebSearch` and `WebFetch` (`--tools`), without MCP servers or user settings, in an empty
   temporary folder and a clean environment;
3. validates every proposed item with `merge.py`: text in every language of the event, a short
   source name, a plain `https` link (no user, port or backslash) on an allowlisted domain, no
   markup, reasonable length, not a repeat. At most five new items per run; existing items are never
   changed or removed. Items from domains marked `review` go to `$STATE_DIR/pending.json` instead;
4. publishes only that file with `publish.py`, which talks to the Firebase Hosting REST API
   directly (no Node, no gcloud): it clones the live version, replaces one path and releases.

The agent never sees credentials or files, and its answer is treated as untrusted input. Pages it
reads may contain instructions; the prompt tells it to ignore them, and the validation does not
rely on it obeying.

## Requirements

- Linux with systemd (or any scheduler), `bash`, `curl`, `python3` (standard library only).
- [Claude Code](https://docs.claude.com/en/docs/claude-code) signed in on that machine, or another
  agent CLI with the same contract (prompt in, `<items>[...]</items>` out) set as `CLAUDE_BIN`.
- Google credentials allowed to deploy to the Firebase Hosting site:
  - a service account key, or
  - an `authorized_user` file from `gcloud auth application-default login`, if your organisation
    forbids service account keys. Those can expire with your organisation's session policy; if the
    publish step starts failing with `invalid_rapt`, issue it again (with an OAuth client exempted
    from that policy, if you have one) and copy it over.

## Setup

1. Copy `watch.env.example` to a private place, fill it in, `chmod 600` it.
2. Put the allowlist in `<data>/watch/allowed-domains.txt` (one domain per line; subdomains count).
   Add `review` after a domain to hold its items for a person: publish official bodies directly and
   send the press to review, since one manipulated article is enough to announce a false change.
   To approve a pending item, add it to the live file and publish it as in "To undo a bad item".
   Optionally write `<data>/watch/prompt.md` in the event's language; otherwise `prompt.md` here
   is used. Placeholders: `{{EVENT}} {{CITY}} {{DATE}} {{TIMEZONE}} {{NOW}} {{ISO}} {{LANGS}}
   {{SOURCES}} {{DOMAINS}} {{CURRENT}} {{EXAMPLE}}`.
3. Try one run without publishing: `DRY_RUN=1 ./check-updates.sh /path/watch.env`, then read
   `$STATE_DIR/new.json`.
4. Install the timer: edit the two templates in `systemd/` (paths, and the calendar around your
   event), copy them to `~/.config/systemd/user/`, then
   `systemctl --user daemon-reload && systemctl --user enable --now event-closures-watch.timer`.
   With `STOP_AFTER` and `TIMER_UNIT` set, the timer disables itself when the event is over.

Logs: `journalctl --user -u event-closures-watch`; the agent's stderr goes to `$STATE_DIR/agent.err`.

To undo a bad item: edit the live file (download it, remove the item, publish it with
`FIREBASE_ACCESS_TOKEN="$(gcloud auth print-access-token)" publish.py --site <site> updates.json=/<path>`).
