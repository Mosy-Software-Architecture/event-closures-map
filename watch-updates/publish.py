#!/usr/bin/env python3
"""Publish one or more files to a Firebase Hosting site without node or gcloud.

Clones the live version, replaces the given files, finalizes and releases. Needs only the
standard library plus `openssl` for signing the service-account JWT.

Usage: publish.py --site <firebase-site> --key /path/sa.json FILE[=served/path] ...
       publish.py --site <firebase-site> --adc ~/.config/event-closures-map/adc.json updates.json=/data/updates.json
       publish.py --site <firebase-site> --token "$(gcloud auth application-default print-access-token)" updates.json
"""
import argparse, base64, re, gzip, hashlib, json, os, subprocess, sys, time, urllib.request, urllib.error, urllib.parse

API = "https://firebasehosting.googleapis.com/v1beta1"


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def token_from_key(path):
    key = json.load(open(path))
    now = int(time.time())
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = b64url(json.dumps({
        "iss": key["client_email"], "scope": "https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform",
        "aud": key["token_uri"], "iat": now, "exp": now + 3600}).encode())
    signing_input = f"{header}.{claims}".encode()
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(signing_input); data_path = f.name
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(key["private_key"].encode()); key_path = f.name
    try:
        sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", key_path, data_path], capture_output=True, check=True).stdout
    finally:
        os.unlink(data_path); os.unlink(key_path)
    jwt = f"{header}.{claims}.{b64url(sig)}"
    body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": jwt}).encode()
    with urllib.request.urlopen(urllib.request.Request(key["token_uri"], data=body)) as r:
        return json.load(r)["access_token"]


QUOTA_PROJECT = os.environ.get("GOOGLE_CLOUD_QUOTA_PROJECT")  # billing project for user credentials, if your org needs one


def token_from_adc(path):
    """User credentials as written by `gcloud auth application-default login` (refresh token grant)."""
    adc = json.load(open(path))
    body = urllib.parse.urlencode({"grant_type": "refresh_token", "client_id": adc["client_id"], "client_secret": adc["client_secret"], "refresh_token": adc["refresh_token"]}).encode()
    with urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data=body)) as r:
        return json.load(r)["access_token"]


def call(token, method, url, body=None, raw=None, ctype="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method, headers={"Authorization": f"Bearer {token}", "Content-Type": ctype, **({"x-goog-user-project": QUOTA_PROJECT} if QUOTA_PROJECT else {})})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            txt = r.read()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {url} -> {e.code}: {e.read().decode()[:500]}")


def wait_op(token, name):
    for _ in range(120):
        op = call(token, "GET", f"{API}/{name}")
        if op.get("done"):
            if "error" in op: sys.exit(f"operation failed: {op['error']}")
            return op.get("response", {})
        time.sleep(2)
    sys.exit("operation timed out")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--key"); ap.add_argument("--adc"); ap.add_argument("--token")
    ap.add_argument("files", nargs="+", help="local path, optionally =served path (default /<basename>)")
    a = ap.parse_args()
    a.token = a.token or os.environ.get("FIREBASE_ACCESS_TOKEN")  # prefer the env var: arguments show up in ps
    token = a.token or (token_from_key(a.key) if a.key else token_from_adc(a.adc) if a.adc else sys.exit("--key, --adc or --token"))
    site = f"sites/{a.site}"

    files = {}
    for spec in a.files:
        local, _, served = spec.partition("=")
        served = served or "/" + os.path.basename(local)
        gz = gzip.compress(open(local, "rb").read(), mtime=0)
        files[served] = (hashlib.sha256(gz).hexdigest(), gz)

    rel = call(token, "GET", f"{API}/{site}/releases?pageSize=1")
    live = rel["releases"][0]["version"]["name"] if rel.get("releases") else None
    if not live and not os.environ.get("ALLOW_EMPTY_SITE"):
        sys.exit("no live release found: refusing to publish a site with only " + ", ".join(files))
    if live:
        op = call(token, "POST", f"{API}/{site}/versions:clone", {"sourceVersion": live, "finalize": False,
                   "exclude": {"regexes": ["^" + re.escape(p) + "$" for p in files]}})
        version = wait_op(token, op["name"])["name"]
    else:
        version = call(token, "POST", f"{API}/{site}/versions", {})["name"]

    if live:
        listed = call(token, "GET", f"{API}/{version}/files?pageSize=1000").get("files", [])
        if not any(f.get("path") == "/index.html" for f in listed):
            sys.exit("cloned version has no /index.html, refusing to publish")
    pop = call(token, "POST", f"{API}/{version}:populateFiles", {"files": {p: h for p, (h, _) in files.items()}})
    for h in pop.get("uploadRequiredHashes", []):
        gz = next(g for (hh, g) in files.values() if hh == h)
        call(token, "POST", f"{pop['uploadUrl']}/{h}", raw=gz, ctype="application/octet-stream")
    call(token, "PATCH", f"{API}/{version}?updateMask=status", {"status": "FINALIZED"})
    r = call(token, "POST", f"{API}/{site}/releases?versionName={version}", {})
    print("released", r.get("name"), "files:", ", ".join(files))


if __name__ == "__main__":
    main()
