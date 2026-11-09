#!/usr/bin/env python3
"""Validates the items proposed by the agent and appends the good ones to the published list.

usage: merge.py PUBLISHED ANSWER NOW OUT --langs es,en --domains allowed-domains.txt

PUBLISHED  current updates.json (rewritten in place with the new items)
ANSWER     the agent's raw answer; only the JSON list between <items> and </items> is read
OUT        receives the list of accepted items (empty list when nothing is new)

An item is accepted only if it has text in every language, a short source name, an https URL on
an allowed domain, no markup characters, reasonable lengths, and is not a repeat. Existing items
are never changed or removed (the list keeps the last MAX_ITEMS).
"""
import argparse, json, re, sys, urllib.parse

MAX_ITEMS, MAX_TEXT, MAX_NEW, MAX_SOURCE = 25, 220, 5, 40
TIME_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)")


def load_domains(path):
    out = set()
    for line in open(path, encoding="utf-8"):
        line = line.split("#", 1)[0].strip().lower()
        if line: out.add(line)
    return out


def allowed(url, domains):
    u = urllib.parse.urlparse(url)
    host = (u.hostname or "").lower()
    return u.scheme == "https" and any(host == d or host.endswith("." + d) for d in domains)


def merge(published, answer, now, langs, domains):
    items = published["items"]
    main = langs[0]
    seen_text = {(i.get(main) or "").strip().lower() for i in items}
    m = re.search(r"<items>\s*(\[.*?\])\s*</items>", answer, re.S)
    proposed, new = [], []
    if m:
        try: proposed = json.loads(m.group(1))
        except Exception as e: print("bad json from agent:", e, file=sys.stderr)
    for c in proposed if isinstance(proposed, list) else []:
        if not isinstance(c, dict): continue
        texts = {l: str(c.get(l) or "").strip() for l in langs}
        src, url, t = (str(c.get(k) or "").strip() for k in ("source", "url", "time"))
        if not all(texts.values()) or not src or not url: continue
        if any(ch in v for v in [*texts.values(), src] for ch in "<>&{}[]"): continue
        if any(len(v) > MAX_TEXT for v in texts.values()) or len(src) > MAX_SOURCE: continue
        if not allowed(url, domains): continue
        if not TIME_RE.fullmatch(t): t = now
        key = texts[main].lower()
        if key in seen_text: continue
        if any(i.get("url") == url and (i.get(main) or "").lower()[:40] == key[:40] for i in items): continue
        new.append({"time": t, **texts, "source": src, "url": url})
        seen_text.add(key)
        if len(new) >= MAX_NEW: break
    published["items"] = (items + new)[-MAX_ITEMS:]
    published["updated"] = now
    return published, new, len(proposed) if isinstance(proposed, list) else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("published"); ap.add_argument("answer"); ap.add_argument("now"); ap.add_argument("out")
    ap.add_argument("--langs", required=True); ap.add_argument("--domains", required=True)
    a = ap.parse_args()
    published = json.load(open(a.published, encoding="utf-8"))
    if not isinstance(published.get("items"), list): sys.exit("published file has no items list")
    answer = open(a.answer, encoding="utf-8", errors="replace").read()
    published, new, n = merge(published, answer, a.now, a.langs.split(","), load_domains(a.domains))
    json.dump(published, open(a.published, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(new, open(a.out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"agent proposed {n}, accepted {len(new)}")


if __name__ == "__main__":
    main()
