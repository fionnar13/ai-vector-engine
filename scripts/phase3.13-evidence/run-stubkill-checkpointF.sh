#!/usr/bin/env bash
# ============================================================================
# PHASE 3.13 — CHECKPOINT F stub-kill proof (spec §28.7/§29 discipline).
# The §41-F mandate: "Stub-kill: neuter a step (e.g., skip the transaction)
# and prove the final-state assertions fail." TWO neuter runs over
# tests/ai.test.mjs (the only file Checkpoint F touches), each followed by a
# sha256-verified restore:
#
#   KILL 1 — [CHECKPOINT-F-SUBSTRATE]: the document context's transactionManager
#            is neutered to null. tools.js:1044 gate then routes every mutation
#            through the LEGACY direct-store fallback: the canonical stores end
#            in the SAME final state, but no Command/Transaction/Commit exists.
#            PREDICTED failures:
#              F-S3: history delta 0 !== 3; committedEvents [] !== 3;
#                    outputs carry NO transactionId (two id-equality arms and
#                    the every-transactionId arm fail).
#              F-S4: spatialInvalidations 0 !== 3; spatial index never re-synced
#                    (entries 0, bbox null); RenderTree tracker never invalidated.
#              PREDICTED GREEN (disclosed): F-S1/F-S2 (planning read-only proof
#                    is independent of the execution substrate); F-S4's store-
#                    state arms (legacy branch writes identical canonical state)
#                    and rebuiltTreeHasObject (the rebuild is harness-driven).
#
#   KILL 2 — [CHECKPOINT-F-EXEC]: the executor receives only the FIRST IR node
#            (ir.ir.slice(0,1)) — plan steps 2-3 (T07 fill, T08 align) are
#            neutered. PREDICTED failures:
#              F-S3: history delta 1 !== 3; committedEvents 1 !== 3 (the id-
#                    equality arms stay green: 1 event == 1 output == 1 history).
#              F-S4: the fill arm fails (stack has no fill item — T07 never ran);
#                    spatialInvalidations 1 !== 3.
#              PREDICTED GREEN (disclosed): F-S1/F-S2; geometry/bbox arms (T01
#                    ran); spatial re-sync + render arms (one real commit still
#                    fired the event).
#
# Restores are byte-verified against the pre-kill sha256. No commit, no push.
# ============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
SRC="tests/ai.test.mjs"
TMP="${SRC}.stubkill.bak"

hash_of(){ sha256sum "$SRC" | cut -d' ' -f1; }

echo "== pre-kill hash =="; BEFORE=$(hash_of); echo "$BEFORE"
cp "$SRC" "$TMP"

restore(){
  cp "$TMP" "$SRC"
  AFTER=$(hash_of)
  if [ "$AFTER" = "$BEFORE" ]; then echo "RESTORE OK ($AFTER)"; else echo "RESTORE MISMATCH"; exit 99; fi
}

# ---- KILL 1: skip the transaction (transactionManager -> null) ----------------
sed -i 's|transactionManager: transactionExecutor /\* \[CHECKPOINT-F-SUBSTRATE\] \*/|transactionManager: null /* [CHECKPOINT-F-SUBSTRATE] KILL1: transaction layer skipped */|' "$SRC"
if grep -q 'KILL1: transaction layer skipped' "$SRC"; then echo "== KILL 1 applied =="; else echo "KILL 1 SED MISSED"; exit 98; fi
echo "== KILL 1 run =="
node tests/ai.test.mjs 2>&1 | tee "scripts/phase3.13-evidence/3.13-F-stubkill-run1.txt" | grep -E "^✗|^Tests:"
RC1=${PIPESTATUS[0]}
echo "kill1 exit: $RC1 (expect 1)"
restore

# ---- KILL 2: skip plan steps 2-3 (execute only the first IR node) -------------
sed -i 's|execute(ir.ir, {toolRegistry, documentContext: docContext})|execute(ir.ir.slice(0, 1), {toolRegistry, documentContext: docContext}) /* [CHECKPOINT-F-EXEC] KILL2: steps 2-3 skipped */|' "$SRC"
if grep -q 'KILL2: steps 2-3 skipped' "$SRC"; then echo "== KILL 2 applied =="; else echo "KILL 2 SED MISSED"; exit 98; fi
echo "== KILL 2 run =="
node tests/ai.test.mjs 2>&1 | tee "scripts/phase3.13-evidence/3.13-F-stubkill-run2.txt" | grep -E "^✗|^Tests:"
RC2=${PIPESTATUS[0]}
echo "kill2 exit: $RC2 (expect 1)"
restore

# ---- post-restore green --------------------------------------------------------
echo "== post-restore run =="
node tests/ai.test.mjs 2>&1 | tee "scripts/phase3.13-evidence/3.13-F-stubkill-restore.txt" | tail -2
RC3=${PIPESTATUS[0]}
echo "post-restore exit: $RC3 (expect 0)"
rm -f "$TMP"
if [ "$RC1" -ne 0 ] && [ "$RC2" -ne 0 ] && [ "$RC3" -eq 0 ]; then echo "STUBKILL PROOF: PASS"; else echo "STUBKILL PROOF: FAIL"; exit 1; fi
