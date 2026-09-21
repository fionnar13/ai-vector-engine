#!/usr/bin/env bash
# ============================================================================
# PHASE 3.13 — CHECKPOINT G stub-kill proof (spec §28.7/§29 discipline).
# The §41-G mandate: "Stub-kill: inject a violation (e.g., a temporary `fs`
# reference in ai.js) and prove the corresponding test fails. Restore via
# sha256." THREE injection runs over src-js/ai.js (the SCAN TARGET — the G
# tests in tests/ai.test.mjs are never modified), each followed by a
# sha256-verified restore. All injections are runtime-inert (dead code /
# inert import) so the other 125 ai tests stay green and ONLY the
# corresponding G assertions flip red.
#
#   KILL 1 — [CHECKPOINT-G-KILL1] fs / Node escape hatch:
#            `import fs from 'node:fs';` inserted after the one substrate
#            import (ai.js:55) + a dead `if (false) { fs.readFileSync(...); }`
#            reference appended. PREDICTED failures (3):
#              G-1: specifier 'node:fs' is non-relative + the import set is
#                   no longer exactly ['./tools.js'];
#              G-3: \bfs\b fires on the code-position `fs` references;
#              G-5: src-js runtime scan — ai.js imports a non-relative
#                   specifier.
#            PREDICTED GREEN (disclosed): G-2, G-4, G-6; the A-era raw scan
#            (ai.test.mjs:227 — paren-based patterns) stays green: it has no
#            fs pattern, which is exactly why §41-G mandates the G-3 arm.
#
#   KILL 2 — [CHECKPOINT-G-KILL2] dynamic code execution + DOM globals,
#            ALIAS FORM (no call parens): dead block with
#            `const evalAlias = eval; const fnAlias = Function; void window;
#            void document;`. PREDICTED failures (2):
#              G-2: \bwindow\b + \bdocument\b fire on the bare identifiers;
#              G-3: \beval\b + \bFunction\b fire on the aliases.
#            PREDICTED GREEN (disclosed): G-1, G-4, G-5, G-6; the A-era raw
#            scan stays green — /\beval\s*\(/ and /\bnew\s+Function\b/ do NOT
#            match alias form, proving the G word-boundary scans catch
#            capability references the raw paren-based scan cannot see.
#
#   KILL 3 — [CHECKPOINT-G-KILL3] substrate mutation method calls: dead
#            block calling `probe.write(); probe.execute(); probe.commit();
#            probe.insert(); probe.render();`. PREDICTED failure (1):
#              G-4: the mutation-method denylist fires 5×.
#            PREDICTED GREEN (disclosed): G-1, G-2, G-3, G-5, G-6.
#
# Restores are byte-verified against the pre-kill sha256. No commit, no push.
# ============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
SRC="src-js/ai.js"
TMP="${SRC}.stubkill.bak"
TEST_OUT="tests/ai.test.mjs"

hash_of(){ sha256sum "$SRC" | cut -d' ' -f1; }

echo "== pre-kill hash =="; BEFORE=$(hash_of); echo "$BEFORE"
cp "$SRC" "$TMP"

restore(){
  cp "$TMP" "$SRC"
  AFTER=$(hash_of)
  if [ "$AFTER" = "$BEFORE" ]; then echo "RESTORE OK ($AFTER)"; else echo "RESTORE MISMATCH"; exit 99; fi
}

# ---- KILL 1: fs / Node escape hatch -------------------------------------------
sed -i "55a import fs from 'node:fs'; /* [CHECKPOINT-G-KILL1] */" "$SRC"
cat >> "$SRC" << 'EOF'

if (false) { fs.readFileSync('/dev/null'); } /* [CHECKPOINT-G-KILL1] dead reference */
EOF
if grep -q 'CHECKPOINT-G-KILL1' "$SRC"; then echo "== KILL 1 applied =="; else echo "KILL 1 SED MISSED"; exit 98; fi
echo "== KILL 1 run =="
node "$TEST_OUT" 2>&1 | tee "scripts/phase3.13-evidence/3.13-G-stubkill-run1.txt" | grep -E "^✗|^Tests:"
RC1=${PIPESTATUS[0]}
echo "kill1 exit: $RC1 (expect 1)"
restore

# ---- KILL 2: dynamic code execution + DOM globals (alias form) -----------------
cat >> "$SRC" << 'EOF'

if (false) { /* [CHECKPOINT-G-KILL2] dead block: eval/Function aliases + DOM globals */
  const evalAlias = eval;
  const fnAlias = Function;
  void window;
  void document;
}
EOF
if grep -q 'CHECKPOINT-G-KILL2' "$SRC"; then echo "== KILL 2 applied =="; else echo "KILL 2 SED MISSED"; exit 98; fi
echo "== KILL 2 run =="
node "$TEST_OUT" 2>&1 | tee "scripts/phase3.13-evidence/3.13-G-stubkill-run2.txt" | grep -E "^✗|^Tests:"
RC2=${PIPESTATUS[0]}
echo "kill2 exit: $RC2 (expect 1)"
restore

# ---- KILL 3: substrate mutation method calls -----------------------------------
cat >> "$SRC" << 'EOF'

if (false) { /* [CHECKPOINT-G-KILL3] dead block: substrate mutation method calls */
  const probe = { write(){}, execute(){}, commit(){}, insert(){}, render(){} };
  probe.write();
  probe.execute();
  probe.commit();
  probe.insert();
  probe.render();
}
EOF
if grep -q 'CHECKPOINT-G-KILL3' "$SRC"; then echo "== KILL 3 applied =="; else echo "KILL 3 SED MISSED"; exit 98; fi
echo "== KILL 3 run =="
node "$TEST_OUT" 2>&1 | tee "scripts/phase3.13-evidence/3.13-G-stubkill-run3.txt" | grep -E "^✗|^Tests:"
RC3=${PIPESTATUS[0]}
echo "kill3 exit: $RC3 (expect 1)"
restore

# ---- post-restore green --------------------------------------------------------
echo "== post-restore run =="
node "$TEST_OUT" 2>&1 | tee "scripts/phase3.13-evidence/3.13-G-stubkill-restore.txt" | tail -2
RC4=${PIPESTATUS[0]}
echo "post-restore exit: $RC4 (expect 0)"
rm -f "$TMP"
if [ "$RC1" -ne 0 ] && [ "$RC2" -ne 0 ] && [ "$RC3" -ne 0 ] && [ "$RC4" -eq 0 ]; then echo "STUBKILL PROOF: PASS"; else echo "STUBKILL PROOF: FAIL"; exit 1; fi
