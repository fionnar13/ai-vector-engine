#!/usr/bin/env bash
# ============================================================================
# PHASE 3.13 — CHECKPOINT D stub-kill proof (spec §28.7/§29 discipline).
# TWO neuter runs, each followed by a sha256-verified restore + green re-run:
#   KILL 1 — resolution logic (the §41-D mandate):
#            (a) validatePlanStepTools neutered to a no-op verdict block
#                ([CHECKPOINT-D-RESOLUTION] anchor -> early return);
#            (b) createPlan post-condition neutered
#                ([CHECKPOINT-D-POSTCOND] anchor -> if(false)).
#            PREDICTED: every D test whose subject is the Planner's checking
#            logic fails (D-2 TOOL_NOT_FOUND, D-3 category, D-4 schema,
#            D-5/D-6/D-8 spy consultations drop to zero, D-9 diagnostics);
#            D-1/D-7 stay green as predicted (their subject is the real
#            registry content/projection, which the kill does not touch).
#   KILL 2 — declared-inputSchema validator only
#            ([CHECKPOINT-D-INPUTSCHEMA] anchor -> early return).
#            PREDICTED: exactly D-4 fails (schema checks gone); D-9 stays
#            green (its TOOL_REGISTRY_INVALID diagnostics live in the
#            definition check, not the input-schema validator).
# Restores are byte-verified against the pre-kill sha256. No commit, no push.
# ============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
SRC="src-js/ai.js"
TMP="${SRC}.stubkill.bak"

hash_of(){ sha256sum "$SRC" | cut -d' ' -f1; }

echo "== pre-kill hash =="; BEFORE=$(hash_of); echo "$BEFORE"
cp "$SRC" "$TMP"

restore(){
  cp "$TMP" "$SRC"
  AFTER=$(hash_of)
  if [ "$AFTER" = "$BEFORE" ]; then echo "RESTORE OK ($AFTER)"; else echo "RESTORE MISMATCH"; exit 99; fi
}

# ---- KILL 1: resolution logic ------------------------------------------------
sed -i 's|  // \[CHECKPOINT-D-RESOLUTION\] resolution + category + declared-inputSchema block (stub-kill anchor)|  return errors; // [STUBKILL-D-1] resolution block neutered|' "$SRC"
sed -i 's|  // \[CHECKPOINT-D-POSTCOND\] createPlan emitted-toolId resolution post-condition (stub-kill anchor)|  // [STUBKILL-D-1] post-condition neutered|' "$SRC"
sed -i 's|    if (!reg.has(steps\[i\].toolId)){|    if (false){|' "$SRC"
echo "== KILL 1 run =="
node tests/ai.test.mjs 2>&1 | tee "scripts/phase3.13-evidence/3.13-D-stubkill-run1.txt" | grep -E "^✗|^Tests:"
RC1=${PIPESTATUS[0]}
echo "kill1 exit: $RC1 (expect 1)"
restore

# ---- KILL 2: declared-inputSchema validator ----------------------------------
sed -i 's|  // \[CHECKPOINT-D-INPUTSCHEMA\] declared-inputSchema validation (stub-kill anchor)|  return errors; // [STUBKILL-D-2] input-schema validator neutered|' "$SRC"
echo "== KILL 2 run =="
node tests/ai.test.mjs 2>&1 | tee "scripts/phase3.13-evidence/3.13-D-stubkill-run2.txt" | grep -E "^✗|^Tests:"
RC2=${PIPESTATUS[0]}
echo "kill2 exit: $RC2 (expect 1)"
restore

# ---- post-restore green --------------------------------------------------------
echo "== post-restore run =="
node tests/ai.test.mjs 2>&1 | tee "scripts/phase3.13-evidence/3.13-D-stubkill-restore.txt" | tail -2
RC3=${PIPESTATUS[0]}
echo "post-restore exit: $RC3 (expect 0)"
rm -f "$TMP"
[ "$RC1" -ne 0 ] && [ "$RC2" -ne 0 ] && [ "$RC3" -eq 0 ] && echo "STUBKILL PROOF: PASS" || { echo "STUBKILL PROOF: FAIL"; exit 1; }
