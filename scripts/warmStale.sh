#!/bin/bash
# Warm the cars the read only task staletexts names (Lane B, e101), against a PINNED address, in parallel chains (Sam, Oct 29 2026).
# Usage: WARM_BASE=<deployment address> bash scripts/warmStale.sh <mc|core|scopedout> [chains=3]
# Keys come from the Keychain per run, never printed. Texts go to a scratch file, warmNamed warms them (chain k of n each), then a confirming read without warming.
set -o pipefail
[ -n "$WARM_BASE" ] || { echo "warmStale: set WARM_BASE to the deployment address to warm"; exit 2; }
KIND="${1:-mc}"; N="${2:-3}"
export WARM_BASE PROBE_KEY=$(security find-generic-password -s goasksam-probe -a goasksam -w) BYPASS_SECRET=$(security find-generic-password -s goasksam-bypass -a goasksam -w)
cd "$(dirname "$0")/.."
OUT="${TMPDIR:-/tmp}/warmStale-$KIND-$$.json"
python3 - "$KIND" "$OUT" <<'PY'
import sys,os,json,urllib.request,urllib.parse
kind,out=sys.argv[1],sys.argv[2]; base=os.environ["WARM_BASE"].rstrip("/")
H={"x-ops-key":os.environ["PROBE_KEY"],"x-vercel-protection-bypass":os.environ["BYPASS_SECRET"]}
def get(**q):
    r=urllib.request.Request(base+"/api/usageDashboard?"+urllib.parse.urlencode({"view":"ops","task":"staletexts",**q}),headers=H)
    return json.load(urllib.request.urlopen(r,timeout=290))
texts=[];seen=set();after="";offset=0
for _ in range(80):
    d=get(kind=kind,**({"after":after} if after else {}),**({"offset":offset} if kind=="scopedout" else {}))
    for t in d.get("texts",[]):
        if t.lower() not in seen: seen.add(t.lower()); texts.append(t)
    if kind=="scopedout":
        if not d.get("read"): break
        offset+=d["read"]
        if offset>=d.get("outOfScopeLive",0): break
    else:
        after=d.get("next") or ""
        if not after: break
json.dump({"kind":kind,"texts":texts},open(out,"w"))
print(f"staletexts kind={kind}: {len(texts)} car texts")
PY
T0=$(date +%s)
for ((k=0;k<N;k++)); do node scripts/warmNamed.mjs --list "$OUT" --part list --chain $k/$N 2>&1 | grep -E "warmNamed:|warm pass" | tail -3 | sed "s/^/chain $k: /" & done; wait
echo "warm seconds: $(( $(date +%s) - T0 ))"
