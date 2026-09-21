#!/usr/bin/env bash
# ============================================================================
# PHASE 3.13 — CHECKPOINT E stub-kill proof (spec §28.7/§29 discipline).
# ONE neuter run (the E.4 mandate: "neuter the $doc: resolution, prove the
# corresponding tests fail"), followed by a sha256-verified restore + green
# re-run:
#   KILL 1 — the '$doc:' resolution predicate inside analyzeReferences
#            (src-js/dsl.js isDocRef -> return false; [STUBKILL-E] anchor).
#            PREDICTED: exactly the 9 designed RED failures reproduce —
#            E-1, E-2, E-4 (with-context arms), E-7, E-8, and the four E-H
#            round trips (validateDSL(parsed.program, ctx) rejects doc targets
#            again). The 6 pins stay green AS PREDICTED: E-3/E-5/E-6 assert
#            gate-CLOSED behavior (the kill only ever closes it further),
#            E-9/E-10 and the A-D round trip never touch doc resolution.
#            Symmetry claim: stub-kill failure set == RED-phase failure set.
# Restore is byte-verified against the pre-kill sha256. No commit, no push.
# ============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
SRC="src-js/dsl.js"
TMP="${SRC}.stubkill.bak"

hash_of(){ sha256sum "$SRC" | cut -d' ' -f1; }

echo "== pre-kill hash =="; BEFORE=$(hash_of); echo "$BEFORE"
cp "$SRC" "$TMP"

restore(){
  cp "$TMP" "$SRC"
  AFTER=$(hash_of)
  if [ "$AFTER" = "$BEFORE" ]; then echo "RESTORE OK ($AFTER)"; else echo "RESTORE MISMATCH"; exit 99; fi
}

# ---- KILL 1: $doc: resolution predicate --------------------------------------
sed -i 's|return id.length>0 && Object.prototype.hasOwnProperty.call(docObjects, id);|return false; // [STUBKILL-E] docref resolution neutered for the Checkpoint E stub-kill proof (spec 28/29)|' "$SRC"
echo "== KILL 1 run =="
node tests/ai.test.mjs 2>&1 | tee "scripts/phase3.13-evidence/3.13-E-stubkill-run1.txt" | grep -E "^✗|^Tests:"
RC1=${PIPESTATUS[0]}
echo "kill1 exit: $RC1 (expect 1)"
restore

# ---- post-restore green --------------------------------------------------------
echo "== post-restore run =="
node tests/ai.test.mjs 2>&1 | tee "scripts/phase3.13-evidence/3.13-E-stubkill-restore.txt" | tail -2
RC2=${PIPESTATUS[0]}
echo "post-restore exit: $RC2 (expect 0)"
rm -f "$TMP"
[ "$RC1" -ne 0 ] && [ "$RC2" -eq 0 ] && echo "STUBKILL PROOF: PASS" || { echo "STUBKILL PROOF: FAIL"; exit 1; }
