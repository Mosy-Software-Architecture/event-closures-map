#!/usr/bin/env python3
"""Validates the items proposed by the agent and appends the good ones to the published list.

usage: merge.py PUBLISHED ANSWER NOW OUT --langs es,en --domains allowed-domains.txt [--pending FILE]

PUBLISHED  current updates.json (rewritten in place with the new items)
ANSWER     the agent's raw answer; only the JSON list between <items> and </items> is read
OUT        receives the list of accepted items (empty list when nothing is new)

An item is accepted only if it has text in every language, a short source name, an https URL on
an allowed domain, no markup characters, reasonable lengths, and is not a repeat. Existing items
are never changed or removed (the list keeps the last MAX_ITEMS).

A domain listed with the word "review" after it ("diariosur.es review") is accepted but not
published: its items go to the --pending file for a person to approve.
"""
import argparse, json, re, sys, urllib.parse

MAX_ITEMS, MAX_TEXT, MAX_NEW, MAX_SOURCE = 25, 220, 5, 40
URL_RE = re.compile(r"https://[A-Za-z0-9.-]+(?:[/?#][^\s\\]*)?")  # no user, port or backslash
TIME_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)")


def load_domains(path):
    """{domain: needs_review}"""
    out = {}
    for line in open(path, encoding="utf-8"):
        parts = line.split("#", 1)[0].strip().lower().split()
        if parts: out[parts[0]] = len(parts) > 1 and parts[1] == "review"
    return out


def domain_of(url, domains):
    """The allowlisted domain the URL belongs to, or None."""
    if not URL_RE.fullmatch(url): return None
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    return next((d for d in domains if host == d or host.endswith("." + d)), None)


def merge(published, answer, now, langs, domains, pending=None):
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
        dom = domain_of(url, domains)
        if not dom: continue
        if not TIME_RE.fullmatch(t): t = now
        key = texts[main].lower()
        if key in seen_text: continue
        if any(i.get("url") == url and (i.get(main) or "").lower()[:40] == key[:40] for i in items): continue
        entry = {"time": t, **texts, "source": src, "url": url}
        seen_text.add(key)
        if domains[dom]:
            if pending is not None and not any(p.get(main) == entry[main] for p in pending): pending.append(entry)
            continue
        new.append(entry)
        if len(new) >= MAX_NEW: break
    published["items"] = (items + new)[-MAX_ITEMS:]
    published["updated"] = now
    return published, new, len(proposed) if isinstance(proposed, list) else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("published"); ap.add_argument("answer"); ap.add_argument("now"); ap.add_argument("out")
    ap.add_argument("--langs", required=True); ap.add_argument("--domains", required=True); ap.add_argument("--pending")
    a = ap.parse_args()
    published = json.load(open(a.published, encoding="utf-8"))
    if not isinstance(published.get("items"), list): sys.exit("published file has no items list")
    answer = open(a.answer, encoding="utf-8", errors="replace").read()
    queue = []
    if a.pending:
        try: queue = json.load(open(a.pending, encoding="utf-8"))
        except Exception: queue = []
    published, new, n = merge(published, answer, a.now, a.langs.split(","), load_domains(a.domains), queue)
    if a.pending: json.dump(queue[-50:], open(a.pending, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(published, open(a.published, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(new, open(a.out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"agent proposed {n}, accepted {len(new)}")


if __name__ == "__main__":
    main()
