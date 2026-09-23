#!/usr/bin/env bash
# PHASE 3.15 — CHECKPOINT A stub-kill battery (state machine).
# Discipline: pristine copies captured AFTER GREEN verification; every kill is
# injected into src-js/correction.js, the correction file runs STANDALONE, the
# failing set is diffed against the EXACT prediction, and the pristine bytes
# are restored with sha256 verification. Post-restore the file must be green.
#
# Predictions (see tests/correction.test.mjs header):
#   KILL-1 canTransition neutered (always true)  -> exactly {A-22, A-25, A-31}
#   KILL-2 visitedStates append removed          -> exactly {A-23, A-24, A-27}
#   KILL-3 termination reason discipline removed -> exactly {A-19, A-30}

set -u
cd "$(dirname "$0")/../.."

MODULE=src-js/correction.js
TESTFILE=tests/correction.test.mjs
PRISTINE=scripts/phase3.15-evidence/correction.js.checkpointA.pristine
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
  grep -E '^✗' "$OUTDIR/$3" | sed -E 's/^✗ (A-[0-9]+):.*/\1/' | sort > /tmp/failed.txt
  sort "$2" > /tmp/predicted.txt
  if diff -u /tmp/predicted.txt /tmp/failed.txt > /tmp/diff.txt; then
    echo "KILL-OK $1: failed set == prediction ($(wc -l < /tmp/failed.txt) tests), exit=$rc"
  else
    echo "KILL-MISMATCH $1:"; cat /tmp/diff.txt; FAILURES=$((FAILURES+1))
  fi
  restore
}

FAILURES=0

# ---- KILL-1: canTransition neutered (always true) ----------------------------
python3 - "$MODULE" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
old = """export function canTransition(from, to){
  const allowed = CORRECTION_LOOP_TRANSITIONS[from] || [];
  return allowed.includes(to);
}"""
new = """export function canTransition(from, to){
  return true; // KILL-1: transition legality neutered
}"""
assert old in src, "KILL-1 anchor not found"
open(p, 'w').write(src.replace(old, new))
PYEOF
printf 'A-22\nA-25\nA-31\n' > /tmp/pred-k1.txt
run_and_check "KILL-1 (canTransition always true)" /tmp/pred-k1.txt 3.15-A-stubkill-run1.txt

# ---- KILL-2: visitedStates append removed in transitionSession ---------------
python3 - "$MODULE" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
old = """  const nextTrail = Object.freeze([...session.visitedStates, to]);
  return deepFreeze({ ...session, state: to, visitedStates: [...nextTrail] });"""
new = """  const nextTrail = Object.freeze([...session.visitedStates]); // KILL-2: append removed
  return deepFreeze({ ...session, state: to, visitedStates: [...nextTrail] });"""
assert old in src, "KILL-2 anchor not found"
open(p, 'w').write(src.replace(old, new))
PYEOF
printf 'A-23\nA-24\nA-27\n' > /tmp/pred-k2.txt
run_and_check "KILL-2 (trail append removed)" /tmp/pred-k2.txt 3.15-A-stubkill-run2.txt

# ---- KILL-3: termination reason discipline removed ---------------------------
python3 - "$MODULE" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
# (a) terminateSession accepts ANY reason
old_a = """  if (!isNonEmptyString(reason) || !CORRECTION_TERMINATION_REASONS.includes(reason)){
    throw new CorrectionError(CorrectionErrorCodes.INVALID_TERMINATION, `terminateSession reason must be a §50 CorrectionTerminationReason, got ${JSON.stringify(reason)}`, { reason });
  }"""
new_a = """  if (false){ // KILL-3a: reason validation removed
  }"""
assert old_a in src, "KILL-3a anchor not found"
src = src.replace(old_a, new_a)
# (b) validator equivalence (both directions) removed
old_b = """  if (terminated && !hasReason){
    errors.push(createError(CorrectionErrorCodes.INVALID_SESSION, 'session.state TERMINATED requires a §50 terminationReason — terminate through terminateSession(session, reason)'));
  }
  if (!terminated && hasReason){
    errors.push(createError(CorrectionErrorCodes.INVALID_SESSION, 'session.terminationReason requires state TERMINATED (§4/§50)'));
  }"""
new_b = """  if (false){ // KILL-3b: TERMINATED<->reason equivalence removed
  }
  if (false){ // KILL-3b
  }"""
assert old_b in src, "KILL-3b anchor not found"
src = src.replace(old_b, new_b)
open(p, 'w').write(src)
PYEOF
printf 'A-19\nA-30\n' > /tmp/pred-k3.txt
run_and_check "KILL-3 (termination discipline removed)" /tmp/pred-k3.txt 3.15-A-stubkill-run3.txt

# ---- post-battery: pristine restored + file green ----------------------------
node "$TESTFILE" > "$OUTDIR/3.15-A-post-restore-green.txt" 2>&1
rc=$?
tail -1 "$OUTDIR/3.15-A-post-restore-green.txt" | grep -q "32 total, 32 passed, 0 failed" || { echo "FATAL: post-restore file not green"; FAILURES=$((FAILURES+1)); }
final_sha=$(sha256sum "$MODULE" | cut -d' ' -f1)
[ "$final_sha" = "$pristine_sha" ] || { echo "FATAL: final sha mismatch"; FAILURES=$((FAILURES+1)); }
echo "post-restore: exit=$rc, sha=$final_sha (pristine match verified)"

if [ "$FAILURES" -eq 0 ]; then
  echo "STUBKILL PROOF: PASS"
else
  echo "STUBKILL PROOF: FAIL ($FAILURES mismatches)"
  exit 1
fi
