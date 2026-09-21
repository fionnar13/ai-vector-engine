#!/usr/bin/env bash
# PHASE 3.13 CHECKPOINT B — STUB-KILL (spec §28 RED-first / §29 stub-kill).
# Neuters createPlan in src-js/ai.js, proves the corresponding tests fail,
# then restores the pristine file (sha256-verified) and re-proves 60/60.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
AI="$REPO/src-js/ai.js"
TEST="$REPO/tests/ai.test.mjs"
PRISTINE="$SCRIPT_DIR/ai.js.checkpointB.pristine"
SHA_BEFORE="$SCRIPT_DIR/ai.js.checkpointB.sha256"

echo "== [1] snapshot pristine ai.js =="
cp "$AI" "$PRISTINE"
sha256sum "$AI" | awk '{print $1}' > "$SHA_BEFORE"
echo "sha256(before) = $(cat "$SHA_BEFORE")"

echo "== [2] neuter createPlan (throw on entry) =="
MARKER='  const expectedState = createExpectedState(intent, context); // validates intent + §13 context contract'
if ! grep -qF "$MARKER" "$AI"; then
  echo "FATAL: createPlan marker line not found — aborting, restoring pristine"
  cp "$PRISTINE" "$AI"
  exit 2
fi
python3 - "$AI" <<'PYEOF'
import sys
path = sys.argv[1]
marker = '  const expectedState = createExpectedState(intent, context); // validates intent + §13 context contract'
kill = '  throw new PlanningError(PlanningErrorCodes.PLAN_INVALID, \'STUB-KILL: createPlan neutered for the Checkpoint B stub-kill proof (spec §28/§29)\');'
src = open(path, encoding='utf-8').read()
assert src.count(marker) == 1, 'marker must be unique'
open(path, 'w', encoding='utf-8').write(src.replace(marker, kill))
print('createPlan neutered (body throws on entry)')
PYEOF

echo "== [3] run tests against the neutered createPlan =="
set +e
node "$TEST" > "$SCRIPT_DIR/3.13-B-stubkill-run.txt" 2>&1
KILL_RC=$?
set -e
tail -1 "$SCRIPT_DIR/3.13-B-stubkill-run.txt"
echo "neutered-run exit=$KILL_RC (expect 1)"
FAILED=$(grep -c '^✗' "$SCRIPT_DIR/3.13-B-stubkill-run.txt" || true)
echo "failing tests: $FAILED"
grep '^✗' "$SCRIPT_DIR/3.13-B-stubkill-run.txt" | sed 's/^/  /'

echo "== [4] restore pristine ai.js =="
cp "$PRISTINE" "$AI"
SHA_AFTER=$(sha256sum "$AI" | awk '{print $1}')
echo "sha256(after)  = $SHA_AFTER"
[ "$SHA_AFTER" = "$(cat "$SHA_BEFORE")" ] && echo "restore sha256: OK" || { echo "restore sha256: MISMATCH — FATAL"; exit 3; }

echo "== [5] re-run tests on the restored file =="
node "$TEST" > "$SCRIPT_DIR/3.13-B-stubkill-restore.txt" 2>&1
RESTORE_RC=$?
tail -1 "$SCRIPT_DIR/3.13-B-stubkill-restore.txt"
echo "restored-run exit=$RESTORE_RC (expect 0)"
[ "$KILL_RC" -ne 0 ] && [ "$RESTORE_RC" -eq 0 ] && [ "$FAILED" -gt 0 ] && echo "STUB-KILL PROOF: PASS (createPlan is load-bearing: $FAILED tests failed while neutered; 60/60 after restore)" || { echo "STUB-KILL PROOF: FAIL"; exit 4; }
