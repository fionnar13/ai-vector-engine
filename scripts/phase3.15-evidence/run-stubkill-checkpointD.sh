#!/usr/bin/env bash
# PHASE 3.15 — CHECKPOINT D stub-kill battery (execution, acceptance policy,
# rollback). Discipline: pristine copy captured AFTER GREEN verification; every
# kill is injected into src-js/correction.js, the correction file runs
# STANDALONE, the failing set is diffed against the EXACT prediction, and the
# pristine bytes are restored with sha256 verification. Post-restore the file
# must be green.
#
# Predictions (see tests/correction.test.mjs header; sets OVERLAP where the
# integrated tests deliberately span kill sites — the B rationale):
#   KILL-D1 execution neutered (no preflight, no transaction built or executed;
#           a fabricated deterministic EXECUTED projection returned)
#                                              -> exactly {D-4, D-5, D-6, D-7,
#                                              D-8, D-9, D-10, D-12, D-18, D-19, D-20} (11)
#   KILL-D2 acceptance policy neutered (verdict always ACCEPTED, every
#           criterion forced met)              -> exactly {D-13, D-14, D-15, D-19} (4)
#   KILL-D3 rollback neutered (substrate undo skipped; ROLLED_BACK reported
#           anyway)                            -> exactly {D-8, D-9, D-19} (3)

set -u
cd "$(dirname "$0")/../.."

MODULE=src-js/correction.js
TESTFILE=tests/correction.test.mjs
PRISTINE=scripts/phase3.15-evidence/correction.js.checkpointD.pristine
OUTDIR=scripts/phase3.15-evidence

pristine_sha=$(sha256sum "$PRISTINE" | cut -d' ' -f1)
current_sha=$(sha256sum "$MODULE" | cut -d' ' -f1)
if [ "$pristine_sha" != "$current_sha" ]; then
  echo "FATAL: $MODULE does not match the pristine snapshot before any kill"; exit 1
fi
echo "pre-battery pristine match: $pristine_sha"

restore() {
  cp "$PRISTINE" "$MODULE"
  local sha=$(sha256sum "$MODULE" | cut -d' ' -f1)
  if [ "$sha" != "$pristine_sha" ]; then echo "FATAL: restore mismatch ($sha)"; exit 1; fi
}

run_and_check() {  # $1=kill-name $2=prediction-file $3=output-file
  node "$TESTFILE" > "$OUTDIR/$3" 2>&1
  local rc=$?
  grep -E '^✗' "$OUTDIR/$3" | sed -E 's/^✗ (D-[0-9]+|C-[0-9]+|B-[0-9]+|A-[0-9]+):.*/\1/' | sort > /tmp/failed-d.txt
  sort "$2" > /tmp/predicted-d.txt
  if diff -u /tmp/predicted-d.txt /tmp/failed-d.txt > /tmp/diff-d.txt; then
    echo "KILL-OK $1: failed set == prediction ($(wc -l < /tmp/failed-d.txt) tests), exit=$rc"
  else
    echo "KILL-MISMATCH $1:"; cat /tmp/diff-d.txt; FAILURES=$((FAILURES+1))
  fi
  restore
}

FAILURES=0

# ---- KILL-D1: execution neutered (fabricated EXECUTED, no preflight) ----------
python3 - "$MODULE" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
old = """  // 1. Pre-flight against the LIVE registry (disclosure 27).
  const refusal = executionPreflightRefusal(plan, substrate);"""
new = """  // KILL-D1: execution neutered — no preflight, no transaction built or
  // executed; a fabricated deterministic EXECUTED projection.
  const killTxId = contentId('atx-', { sessionId: plan.sessionId, planId: plan.id, targetId: target.id, iteration });
  return deepFreeze({ status: 'EXECUTED', attempt: createCorrectionAttempt({ iteration, target, plan, transactionId: killTxId, beforeEvaluation, status: 'EXECUTED' }), transaction: deepFreeze({ id: killTxId, status: 'committed', inverseKind: 'commands', commandCount: plan.commands.length, diffCounts: deepFreeze({ added: 0, removed: 0, modified: 0 }) }) });
  // 1. Pre-flight against the LIVE registry (disclosure 27).
  const refusal = executionPreflightRefusal(plan, substrate);"""
assert old in src, "KILL-D1 anchor not found"
open(p, 'w').write(src.replace(old, new))
PYEOF
printf 'D-4\nD-5\nD-6\nD-7\nD-8\nD-9\nD-10\nD-12\nD-18\nD-19\nD-20\n' > /tmp/pred-kd1.txt
run_and_check "KILL-D1 (execution fabricated)" /tmp/pred-kd1.txt 3.15-D-stubkill-run1.txt

# ---- KILL-D2: acceptance policy neutered (always ACCEPTED) --------------------
python3 - "$MODULE" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
old = """  const reasons = [];
  if (metricInvalid) reasons.push('METRIC_INVALID');
  else if (!improvementMet && !regression.metricRegressed) reasons.push('NO_IMPROVEMENT');
  if (regression.criticalRegression) reasons.push('CRITICAL_REGRESSION');
  if (newStructureIds.length > 0) reasons.push('STRUCTURAL_DAMAGE');
  const status = reasons.length === 0 ? 'ACCEPTED' : 'REJECTED';"""
new = """  // KILL-D2: acceptance policy neutered — the verdict is always ACCEPTED,
  // every criterion forced met.
  const reasons = [];
  const status = 'ACCEPTED';"""
assert old in src, "KILL-D2 anchor not found"
open(p, 'w').write(src.replace(old, new))
PYEOF
printf 'D-13\nD-14\nD-15\nD-19\n' > /tmp/pred-kd2.txt
run_and_check "KILL-D2 (acceptance always ACCEPTED)" /tmp/pred-kd2.txt 3.15-D-stubkill-run2.txt

# ---- KILL-D3: rollback neutered (undo skipped, ROLLED_BACK reported) ----------
python3 - "$MODULE" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
old = """  const inverseKind = toUndo.inverse && toUndo.inverse.type ? toUndo.inverse.type : null;
  let undone = null, failure = null;"""
new = """  const inverseKind = toUndo.inverse && toUndo.inverse.type ? toUndo.inverse.type : null;
  // KILL-D3: rollback neutered — the substrate undo is skipped, ROLLED_BACK
  // is reported anyway.
  return deepFreeze({ status: 'ROLLED_BACK', attempt: createCorrectionAttempt({ iteration: attempt.iteration, target: attempt.target, plan: attempt.plan, transactionId: attempt.transactionId, beforeEvaluation: attempt.beforeEvaluation, status: 'ROLLED_BACK' }), transaction: deepFreeze({ id: attempt.transactionId + '-undo', parentId: attempt.transactionId, inverseKind }) });
  let undone = null, failure = null;"""
assert old in src, "KILL-D3 anchor not found"
open(p, 'w').write(src.replace(old, new))
PYEOF
printf 'D-8\nD-9\nD-19\n' > /tmp/pred-kd3.txt
run_and_check "KILL-D3 (rollback reports without undoing)" /tmp/pred-kd3.txt 3.15-D-stubkill-run3.txt

# ---- post-battery: pristine restored + file green ----------------------------
node "$TESTFILE" > "$OUTDIR/3.15-D-post-restore-green.txt" 2>&1
rc=$?
tail -1 "$OUTDIR/3.15-D-post-restore-green.txt" | grep -q "97 total, 97 passed, 0 failed" || { echo "FATAL: post-restore file not green"; FAILURES=$((FAILURES+1)); }
final_sha=$(sha256sum "$MODULE" | cut -d' ' -f1)
[ "$final_sha" = "$pristine_sha" ] || { echo "FATAL: final sha mismatch"; FAILURES=$((FAILURES+1)); }
echo "post-restore: exit=$rc, sha=$final_sha (pristine match verified)"

if [ "$FAILURES" -eq 0 ]; then
  echo "STUBKILL PROOF: PASS"
else
  echo "STUBKILL PROOF: FAIL ($FAILURES mismatches)"
  exit 1
fi
