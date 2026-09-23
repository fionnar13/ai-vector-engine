#!/usr/bin/env bash
# PHASE 3.15 — CHECKPOINT B stub-kill battery (diagnosis mapping + strategy ranking).
# Discipline: pristine copy captured AFTER GREEN verification; every kill is
# injected into src-js/correction.js, the correction file runs STANDALONE, the
# failing set is diffed against the EXACT prediction, and the pristine bytes
# are restored with sha256 verification. Post-restore the file must be green.
#
# Predictions (see tests/correction.test.mjs header; sets overlap by design —
# B-16/B-23 exercise the integrated resolve->rank->explain flow):
#   KILL-B1 category->rootCause mapping neutered (resolver returns UNKNOWN;
#           every resolution becomes NO_CAPABILITY)
#                                              -> exactly {B-4, B-5, B-6, B-7, B-8, B-11, B-16, B-21, B-22, B-23, B-25}
#   KILL-B2 §19 priority formula neutered (constant 1)
#                                              -> exactly {B-16, B-17, B-19, B-23}

set -u
cd "$(dirname "$0")/../.."

MODULE=src-js/correction.js
TESTFILE=tests/correction.test.mjs
PRISTINE=scripts/phase3.15-evidence/correction.js.checkpointB.pristine
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
  grep -E '^✗' "$OUTDIR/$3" | sed -E 's/^✗ (B-[0-9]+):.*/\1/' | sort > /tmp/failed-b.txt
  sort "$2" > /tmp/predicted-b.txt
  if diff -u /tmp/predicted-b.txt /tmp/failed-b.txt > /tmp/diff-b.txt; then
    echo "KILL-OK $1: failed set == prediction ($(wc -l < /tmp/failed-b.txt) tests), exit=$rc"
  else
    echo "KILL-MISMATCH $1:"; cat /tmp/diff-b.txt; FAILURES=$((FAILURES+1))
  fi
  restore
}

FAILURES=0

# ---- KILL-B1: category->rootCause mapping neutered ---------------------------
python3 - "$MODULE" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
old = """  const cause = CATEGORY_TO_ROOT_CAUSE[target.category];"""
new = """  const cause = 'UNKNOWN'; // KILL-B1: category->rootCause mapping neutered"""
assert old in src, "KILL-B1 anchor not found"
open(p, 'w').write(src.replace(old, new))
PYEOF
printf 'B-4\nB-5\nB-6\nB-7\nB-8\nB-11\nB-16\nB-21\nB-22\nB-23\nB-25\n' > /tmp/pred-kb1.txt
run_and_check "KILL-B1 (mapping returns UNKNOWN)" /tmp/pred-kb1.txt 3.15-B-stubkill-run1.txt

# ---- KILL-B2: §19 priority formula neutered (constant 1) ---------------------
python3 - "$MODULE" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
old = """    const priority = sevW * s.confidence * impW * corrW;"""
new = """    const priority = 1; // KILL-B2: §19 priority formula neutered"""
assert old in src, "KILL-B2 anchor not found"
open(p, 'w').write(src.replace(old, new))
PYEOF
printf 'B-16\nB-17\nB-19\nB-23\n' > /tmp/pred-kb2.txt
run_and_check "KILL-B2 (priority constant 1)" /tmp/pred-kb2.txt 3.15-B-stubkill-run2.txt

# ---- post-battery: pristine restored + file green ----------------------------
node "$TESTFILE" > "$OUTDIR/3.15-B-post-restore-green.txt" 2>&1
rc=$?
tail -1 "$OUTDIR/3.15-B-post-restore-green.txt" | grep -q "57 total, 57 passed, 0 failed" || { echo "FATAL: post-restore file not green"; FAILURES=$((FAILURES+1)); }
final_sha=$(sha256sum "$MODULE" | cut -d' ' -f1)
[ "$final_sha" = "$pristine_sha" ] || { echo "FATAL: final sha mismatch"; FAILURES=$((FAILURES+1)); }
echo "post-restore: exit=$rc, sha=$final_sha (pristine match verified)"

if [ "$FAILURES" -eq 0 ]; then
  echo "STUBKILL PROOF: PASS"
else
  echo "STUBKILL PROOF: FAIL ($FAILURES mismatches)"
  exit 1
fi
