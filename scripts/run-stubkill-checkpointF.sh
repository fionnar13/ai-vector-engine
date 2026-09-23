#!/usr/bin/env bash
# PHASE 3.15 — CHECKPOINT F stub-kill battery.
# Kills the two D-era sites the §59/§60 properties depend on, verifies the
# EXACT-MATCH failed sets against 3.15-F-stubkill-predictions.txt, restores
# from the pristine snapshot (sha-verified) after each kill.
set -u
cd "$(dirname "$0")/.."

PRISTINE=scripts/phase3.15-evidence/correction.js.checkpointF.pristine
TARGET=src-js/correction.js
OUTDIR=scripts/phase3.15-evidence
PRED_K1="D-8 D-9 D-19 E-16 E-17 F-10 F-11 F-2 F-5 F-6 F-7"
PRED_K2="D-13 D-14 D-15 D-19 E-7 E-8 E-9 E-16 F-2 F-3 F-5 F-6 F-7"

restore() {
  cp "$PRISTINE" "$TARGET"
  local now
  now=$(sha256sum "$TARGET" | cut -d' ' -f1)
  local want
  want=$(sha256sum "$PRISTINE" | cut -d' ' -f1)
  if [ "$now" != "$want" ]; then echo "RESTORE MISMATCH"; exit 9; fi
  echo "restore sha-verified: $now"
}

run_and_compare() {
  local label="$1"; shift
  local pred=("$@")
  node tests/correction.test.mjs > "$OUTDIR/3.15-F-stubkill-$label-run.txt" 2>&1
  local failed_list
  failed_list=$(grep -E '^✗' "$OUTDIR/3.15-F-stubkill-$label-run.txt" | sed -E 's/^✗ ([A-Z]+-[0-9]+).*/\1/' | sort)
  local pred_sorted
  pred_sorted=$(echo "${pred[*]}" | tr ' ' '\n' | sort)
  if [ "$failed_list" == "$pred_sorted" ]; then
    echo "KILL-$label: EXACT-MATCH ($(echo "$failed_list" | wc -l) tests)"
  else
    echo "KILL-$label: MISMATCH"
    echo "--- predicted ---"; echo "$pred_sorted"
    echo "--- observed ---"; echo "$failed_list"
    return 1
  fi
}

echo "=== KILL-F1: §32 rollback neutered (undo skipped, record fabricated) ==="
python3 - "$TARGET" <<'EOF'
import sys
p = sys.argv[1]
src = open(p).read()
old = """  let undone = null, failure = null;
  try { undone = substrate.transactionManager.undo(); }
  catch (e){ failure = e; }"""
new = """  let undone = { id: attempt.transactionId, parentId: null }, failure = null;
  try { /* KILL-F1: the substrate undo is SKIPPED — the record is fabricated */ }
  catch (e){ failure = e; }"""
assert src.count(old) == 1, "KILL-F1 anchor not unique: %d" % src.count(old)
open(p, 'w').write(src.replace(old, new))
print("KILL-F1 applied")
EOF
run_and_compare "F1" $PRED_K1 || { restore; exit 1; }
restore

echo "=== KILL-F2: §14 acceptance neutered (verdict forced ACCEPTED/IMPROVED) ==="
python3 - "$TARGET" <<'EOF'
import sys
p = sys.argv[1]
src = open(p).read()
old = """  const status = reasons.length === 0 ? 'ACCEPTED' : 'REJECTED';
  const stageStatus = status === 'ACCEPTED' ? 'IMPROVED' : (regression.criticalRegression ? 'REGRESSED' : 'NO_EFFECT');"""
new = """  const status = 'ACCEPTED'; /* KILL-F2: the verdict is FORCED */
  const stageStatus = 'IMPROVED'; /* KILL-F2 */"""
assert src.count(old) == 1, "KILL-F2 anchor not unique: %d" % src.count(old)
open(p, 'w').write(src.replace(old, new))
print("KILL-F2 applied")
EOF
run_and_compare "F2" $PRED_K2 || { restore; exit 1; }
restore

echo "=== post-restore green ==="
node tests/correction.test.mjs > "$OUTDIR/3.15-F-post-restore-green.txt" 2>&1
rc=$?
tail -1 "$OUTDIR/3.15-F-post-restore-green.txt"
[ $rc -eq 0 ] || { echo "POST-RESTORE NOT GREEN"; exit 1; }
echo "STUBKILL PROOF: PASS"
