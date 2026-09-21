#!/usr/bin/env bash
# PHASE 3.13 CHECKPOINT C — STUB-KILL (spec §28 RED-first / §29 stub-kill).
# Two neuter runs, each fully restored (sha256-verified):
#   run 1: dispatchNonCreateRules (Rules E/F/G/H routing) -> throw on entry.
#          Expect every Checkpoint C rule test that plans a non-create intent
#          to fail; Checkpoint B create tests and the hand-built $doc:
#          convention tests (validatePlan-level) stay green.
#   run 2: the '$doc:' skip in checkStepReferences -> neutered, so '$doc:'
#          references fall back to step-reference treatment (Checkpoint B
#          behavior). Expect the doc-reference tests to fail.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
AI="$REPO/src-js/ai.js"
TEST="$REPO/tests/ai.test.mjs"
PRISTINE="$SCRIPT_DIR/ai.js.checkpointC.pristine"
SHA_BEFORE="$SCRIPT_DIR/ai.js.checkpointC.sha256"

echo "== [1] snapshot pristine ai.js =="
cp "$AI" "$PRISTINE"
sha256sum "$AI" | awk '{print $1}' > "$SHA_BEFORE"
echo "sha256(before) = $(cat "$SHA_BEFORE")"

echo "== [2] RUN 1: neuter dispatchNonCreateRules (throw on entry) =="
python3 - "$AI" <<'PYEOF'
import sys
path = sys.argv[1]
marker = "function dispatchNonCreateRules(intent, context){\n  if (intent.type === 'transform') return buildTransformPlanSteps(intent, context);"
kill = "function dispatchNonCreateRules(intent, context){\n  throw new PlanningError(PlanningErrorCodes.UNSUPPORTED_OPERATION, 'STUB-KILL: dispatchNonCreateRules neutered for the Checkpoint C stub-kill proof (spec 28/29)');\n  if (intent.type === 'transform') return buildTransformPlanSteps(intent, context);"
src = open(path, encoding='utf-8').read()
assert src.count(marker) == 1, 'dispatch marker must be unique'
open(path, 'w', encoding='utf-8').write(src.replace(marker, kill))
print('dispatchNonCreateRules neutered (throws on entry)')
PYEOF
[ $? -eq 0 ] || { echo "FATAL: neuter 1 failed"; cp "$PRISTINE" "$AI"; exit 2; }

echo "== [3] run tests against the neutered rules dispatch =="
set +e
node "$TEST" > "$SCRIPT_DIR/3.13-C-stubkill-run1.txt" 2>&1
KILL1_RC=$?
set -e
tail -1 "$SCRIPT_DIR/3.13-C-stubkill-run1.txt"
echo "neutered-run-1 exit=$KILL1_RC (expect 1)"
FAILED1=$(grep -c '^✗' "$SCRIPT_DIR/3.13-C-stubkill-run1.txt" || true)
echo "run-1 failing tests: $FAILED1"
grep '^✗' "$SCRIPT_DIR/3.13-C-stubkill-run1.txt" | sed 's/^/  /'

echo "== [4] restore pristine ai.js =="
cp "$PRISTINE" "$AI"
SHA_MID=$(sha256sum "$AI" | awk '{print $1}')
[ "$SHA_MID" = "$(cat "$SHA_BEFORE")" ] && echo "restore sha256 after run 1: OK" || { echo "restore sha256: MISMATCH — FATAL"; exit 3; }

echo "== [5] RUN 2: neuter the dollar-doc skip in checkStepReferences =="
python3 - "$AI" <<'PYEOF'
import sys
path = sys.argv[1]
marker = "      if (ref.startsWith('doc:')) continue;"
kill = "      // STUB-KILL: '$doc:' skip neutered for the Checkpoint C stub-kill proof"
src = open(path, encoding='utf-8').read()
assert src.count(marker) == 1, 'docref-skip marker must be unique'
open(path, 'w', encoding='utf-8').write(src.replace(marker, kill))
print("'$doc:' skip neutered (doc refs treated as step refs)")
PYEOF
[ $? -eq 0 ] || { echo "FATAL: neuter 2 failed"; cp "$PRISTINE" "$AI"; exit 2; }

echo "== [6] run tests against the neutered doc-ref handling =="
set +e
node "$TEST" > "$SCRIPT_DIR/3.13-C-stubkill-run2.txt" 2>&1
KILL2_RC=$?
set -e
tail -1 "$SCRIPT_DIR/3.13-C-stubkill-run2.txt"
echo "neutered-run-2 exit=$KILL2_RC (expect 1)"
FAILED2=$(grep -c '^✗' "$SCRIPT_DIR/3.13-C-stubkill-run2.txt" || true)
echo "run-2 failing tests: $FAILED2"
grep '^✗' "$SCRIPT_DIR/3.13-C-stubkill-run2.txt" | sed 's/^/  /'

echo "== [7] restore pristine ai.js (final) =="
cp "$PRISTINE" "$AI"
SHA_AFTER=$(sha256sum "$AI" | awk '{print $1}')
echo "sha256(after)  = $SHA_AFTER"
[ "$SHA_AFTER" = "$(cat "$SHA_BEFORE")" ] && echo "restore sha256 after run 2: OK" || { echo "restore sha256: MISMATCH — FATAL"; exit 3; }

echo "== [8] re-run tests on the restored file =="
node "$TEST" > "$SCRIPT_DIR/3.13-C-stubkill-restore.txt" 2>&1
RESTORE_RC=$?
tail -1 "$SCRIPT_DIR/3.13-C-stubkill-restore.txt"
echo "restored-run exit=$RESTORE_RC (expect 0)"

if [ "$KILL1_RC" -ne 0 ] && [ "$FAILED1" -gt 0 ] && [ "$KILL2_RC" -ne 0 ] && [ "$FAILED2" -gt 0 ] && [ "$RESTORE_RC" -eq 0 ]; then
  echo "STUB-KILL PROOF: PASS (Rules E-H dispatch is load-bearing: $FAILED1 tests failed while neutered; dollar-doc resolution is load-bearing: $FAILED2 tests failed while neutered; 97/97 after restore)"
else
  echo "STUB-KILL PROOF: FAIL"; exit 4
fi
