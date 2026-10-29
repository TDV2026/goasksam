#!/bin/bash
# The launch warm against a PINNED deployment address (Sam, Oct 28 2026). Usage: WARM_BASE=<deployment address of the build> bash scripts/launchWarm.sh
# Find the address with: vercel inspect <deployment>. The address does not change when main is pushed, so pushes may go while this runs.
# Keys are read from the Keychain per run and never printed.
set -o pipefail
[ -n "$WARM_BASE" ] || { echo "launchWarm: set WARM_BASE to the deployment address to warm"; exit 2; }
export WARM_BASE PROBE_KEY=$(security find-generic-password -s goasksam-probe -a goasksam -w) BYPASS_SECRET=$(security find-generic-password -s goasksam-bypass -a goasksam -w)
cd "$(dirname "$0")/.."
ops() { curl -s -m "${2:-290}" -H "x-ops-key: $PROBE_KEY" -H "x-vercel-protection-bypass: $BYPASS_SECRET" "$WARM_BASE/api/usageDashboard?view=ops&task=$1"; }
stale() { ops stalecount 120 | python3 -c 'import sys,json;d=json.load(sys.stdin);print("stalecount first page: core",d.get("core"),"marked",d.get("marked"))' 2>/dev/null || echo "stalecount read failed"; }
T0=$(date +%s)
( while sleep 900; do echo "[pace] $(( ($(date +%s) - T0) / 60 )) min in: $(stale)"; done ) & PACE=$!
trap 'kill $PACE 2>/dev/null' EXIT
echo "== stale before"; stale
echo "== named, crosscheck, golden, top, crossrest"; node scripts/warmNamed.mjs --part all 2>&1 | tail -40
echo "named+golden pass seconds: $(( $(date +%s) - T0 ))"
echo "== demo cars (warmDemo default list)"
for i in 1 2; do ops "warmDemo&budget=270000" | python3 -c "import sys,json;d=json.load(sys.stdin);print('warmDemo listed',d.get('listed'),'warmed',d.get('warmed'),'failed',d.get('failed'),'notReached',d.get('notReached'))"; done
echo "== union warm, sliced"; node scripts/warmUnion.mjs 2>&1 | tail -40
echo "== nameplates and golden pages"; node scripts/postDeployWarm.mjs 2>&1 | tail -40
echo "== stale after the union"; stale
echo "== named, crosscheck, crossrest again, no warm"
for p in named crosscheck crossrest; do node scripts/warmNamed.mjs --part $p --no-warm 2>&1 | tail -14; done
echo "== warmDay"; ops "warmDay&day=2026-10-29" 200 | python3 -c "import sys,json;d=json.load(sys.stdin);print(json.dumps({'engine':d.get('engineVersion'),'mc':d['marketCheck'],'buyAndTasks':d['buyAndTasks']})[:900])"
echo "== epoch match (live, read only)"; node scripts/epochMatchCheck.mjs --live 2>&1 | tail -6
echo "elapsed seconds: $(( $(date +%s) - T0 ))"
