#!/usr/bin/env bash
# PHASE 3.15 — CHECKPOINT C stub-kill battery (planning + hard-constraint rejection).
# Discipline: pristine copy captured AFTER GREEN verification; every kill is
# injected into src-js/correction.js, the correction file runs STANDALONE, the
# failing set is diffed against the EXACT prediction, and the pristine bytes
# are restored with sha256 verification. Post-restore the file must be green.
#
# Predictions (see tests/correction.test.mjs header; sets are DISJOINT by
# design — gate/generator tests that assert rejection or trade-off evidence
# use hand-built CARRIED strategies with explicit deltas, so they stay
# independent of the deriver):
#   KILL-C1 derivation engine neutered (deriver returns the strategy input
#           as-is — CARRIED always; never derives, never refuses)
#                                              -> exactly {C-1, C-2, C-3, C-4, C-10, C-13, C-18, C-19}
#   KILL-C2 hard-constraint rejection removed (hard conflicts classified as
#           soft trade-offs; gate never REJECTS)
#                                              -> exactly {C-8, C-12}

set -u
cd "$(dirname "$0")/../.."

MODULE=src-js/correction.js
TESTFILE=tests/correction.test.mjs
PRISTINE=scripts/phase3.15-evidence/correction.js.checkpointC.pristine
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
  grep -E '^✗' "$OUTDIR/$3" | sed -E 's/^✗ (C-[0-9]+):.*/\1/' | sort > /tmp/failed-c.txt
  sort "$2" > /tmp/predicted-c.txt
  if diff -u /tmp/predicted-c.txt /tmp/failed-c.txt > /tmp/diff-c.txt; then
    echo "KILL-OK $1: failed set == prediction ($(wc -l < /tmp/failed-c.txt) tests), exit=$rc"
  else
    echo "KILL-MISMATCH $1:"; cat /tmp/diff-c.txt; FAILURES=$((FAILURES+1))
  fi
  restore
}

FAILURES=0

# ---- KILL-C1: derivation engine neutered (carry-as-is) ------------------------
python3 - "$MODULE" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
old = """'deriveCorrectionCommands requires a valid CorrectionStrategy (§9)', sCheck.errors);
  }
  const commands = [];"""
new = """'deriveCorrectionCommands requires a valid CorrectionStrategy (§9)', sCheck.errors);
  }
  // KILL-C1: derivation engine neutered — carry the strategy input as-is,
  // never derive, never refuse.
  return deepFreeze({ status: 'DERIVED', commands: deepFreeze(strategy.commands.map(cmd => ({ ...cmd, input: plainCopy(isPlainObject(cmd.input) ? cmd.input : {}) }))), derivation: deepFreeze(strategy.commands.map((cmd, i) => ({ commandIndex: i, toolId: cmd.toolId, source: 'CARRIED', derivedKeys: [] }))) });
  const commands = [];"""
assert old in src, "KILL-C1 anchor not found"
open(p, 'w').write(src.replace(old, new))
PYEOF
printf 'C-1\nC-2\nC-3\nC-4\nC-10\nC-13\nC-18\nC-19\n' > /tmp/pred-kc1.txt
run_and_check "KILL-C1 (derivation carry-as-is)" /tmp/pred-kc1.txt 3.15-C-stubkill-run1.txt

# ---- KILL-C2: hard-constraint rejection removed -------------------------------
python3 - "$MODULE" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p).read()
old = """    if (c.strength === 'required'){
      if (conflicts) violated.push(plainCopy(c));
      else preservedHard.push(c.id);
    } else if (conflicts){
      softTradeOffs.push({ constraintId: c.id, type: c.type, strength: c.strength });
    }"""
new = """    if (conflicts){
      // KILL-C2: hard conflicts classified as soft trade-offs — never REJECT.
      softTradeOffs.push({ constraintId: c.id, type: c.type, strength: c.strength });
    } else if (c.strength === 'required'){
      preservedHard.push(c.id);
    }"""
assert old in src, "KILL-C2 anchor not found"
open(p, 'w').write(src.replace(old, new))
PYEOF
printf 'C-8\nC-12\n' > /tmp/pred-kc2.txt
run_and_check "KILL-C2 (hard rejection removed)" /tmp/pred-kc2.txt 3.15-C-stubkill-run2.txt

# ---- post-battery: pristine restored + file green ----------------------------
node "$TESTFILE" > "$OUTDIR/3.15-C-post-restore-green.txt" 2>&1
rc=$?
tail -1 "$OUTDIR/3.15-C-post-restore-green.txt" | grep -q "77 total, 77 passed, 0 failed" || { echo "FATAL: post-restore file not green"; FAILURES=$((FAILURES+1)); }
final_sha=$(sha256sum "$MODULE" | cut -d' ' -f1)
[ "$final_sha" = "$pristine_sha" ] || { echo "FATAL: final sha mismatch"; FAILURES=$((FAILURES+1)); }
echo "post-restore: exit=$rc, sha=$final_sha (pristine match verified)"

if [ "$FAILURES" -eq 0 ]; then
  echo "STUBKILL PROOF: PASS"
else
  echo "STUBKILL PROOF: FAIL ($FAILURES mismatches)"
  exit 1
fi
