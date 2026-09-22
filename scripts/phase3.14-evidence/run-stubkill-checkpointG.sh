#!/usr/bin/env bash
# PHASE 3.14 — CHECKPOINT G stub-kill battery (spec §52/§60).
# Injects a runtime-inert architecture violation into each scan target,
# proves EXACTLY the predicted test set fails, restores via sha256.
#   KILL-1  src-js/evaluation.js  : static import form   -> predicted {A-29, B-30, G-1, G-2, G-8}
#   KILL-2  src-js/critic.js      : ALIAS-FORM eval/Function + mutation-method probe
#                                                        -> predicted {C-3, F-3, G-5, G-6}
#   KILL-3  src-js/evaluation.js  : mutation-method probe -> predicted {A-31, G-3}
#   KILL-4  package.json          : dependencies field    -> predicted {G-8}  (file level;
#                                     ai.test.mjs G-5 would also flip at full-suite level — documented, not run)
# src/core is NEVER injected (frozen; G-9 sensitivity is proven in-test on synthetic input).
set -u
cd "$(dirname "$0")/../.."
EV=scripts/phase3.14-evidence
TESTFILE=tests/evaluation-critic.test.mjs
SUMMARY="$EV/3.14-G-stubkill.txt"

pristine_hash() { sha256sum "$1" | cut -d' ' -f1; }

RUN_LINE=''; RUN_RC=0
run_file() { # $1 = output file -> sets RUN_LINE and RUN_RC
  RUN_RC=0
  node "$TESTFILE" > "$1" 2>&1 || RUN_RC=$?
  RUN_LINE=$(grep -E '^Tests:' "$1" | tail -1)
}

failed_ids() { grep -E '^✗' "$1" | sed -E 's/^✗ ([A-Za-z]+-[0-9]+):.*/\1/' | sort | tr '\n' ' '; }

check_kill() { # $1=kill-name $2=predicted-ids(space-sep,sorted) $3=observed-ids $4=rc
  local pred="$2" obs="$3" rc="$4" verdict="FAIL"
  if [ "$pred" = "$obs" ] && [ "$rc" -ne 0 ]; then verdict="EXACT-MATCH"; fi
  printf '%s: rc=%s\n  predicted: %s\n  observed : %s\n  verdict  : %s\n' "$1" "$rc" "$pred" "$obs" "$verdict" | tee -a "$SUMMARY"
  [ "$verdict" = "EXACT-MATCH" ] || { echo "STUBKILL MISMATCH — ABORT" | tee -a "$SUMMARY"; exit 1; }
}

restore() { # $1=target $2=pristine-copy
  cp "$2" "$1"
  local p t
  p=$(pristine_hash "$2")
  t=$(pristine_hash "$1")
  if [ -n "$p" ] && [ "$t" = "$p" ]; then
    echo "  restore: sha256 OK ($t)" | tee -a "$SUMMARY"
  else
    echo "  restore: SHA256 MISMATCH (target=$t pristine=$p) — ABORT" | tee -a "$SUMMARY"; exit 1
  fi
}

: > "$SUMMARY"
echo "=== PHASE 3.14 Checkpoint G stub-kill battery $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$SUMMARY"

# ---------------- KILL-1: evaluation.js static import form ----------------
echo "--- KILL-1: evaluation.js += import fs from 'node:fs' (static import form) ---" | tee -a "$SUMMARY"
T=src-js/evaluation.js
python3 - "$T" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
anchor = "import { transform as bboxTransform, center as bboxCenter } from './bbox.js';"
assert s.count(anchor) == 1, 'anchor not unique'
s = s.replace(anchor, anchor + "\nimport fs from 'node:fs'; // [3.14-G KILL-1] injected violation (runtime-inert) — removed after the run", 1)
open(p, 'w').write(s)
PY
run_file "$EV/3.14-G-stubkill-run1.txt"
echo "  $RUN_LINE" | tee -a "$SUMMARY"
check_kill "KILL-1" "A-29 B-30 G-1 G-2 G-8 " "$(failed_ids "$EV/3.14-G-stubkill-run1.txt")" "$RUN_RC"
restore "$T" "$EV/evaluation.js.checkpointG.pristine"

# ---------------- KILL-2: critic.js ALIAS-FORM + mutation probe ----------------
echo "--- KILL-2: critic.js += alias-form eval/Function references + no-op mutation-method calls (never invoked) ---" | tee -a "$SUMMARY"
T=src-js/critic.js
cat >> "$T" <<'JS'

// [3.14-G KILL-2] injected violation (never invoked) — removed after the run
function __g14KillProbeCritic(){
  const evalAlias = eval; const fnAlias = Function;
  void evalAlias; void fnAlias;
  const probe = { write(){}, set(){}, delete(){}, execute(){}, commit(){} };
  probe.write(0); probe.set(0); probe.delete(0); probe.execute(0); probe.commit(0);
}
JS
run_file "$EV/3.14-G-stubkill-run2.txt"
echo "  $RUN_LINE" | tee -a "$SUMMARY"
check_kill "KILL-2" "C-3 F-3 G-5 G-6 " "$(failed_ids "$EV/3.14-G-stubkill-run2.txt")" "$RUN_RC"
restore "$T" "$EV/critic.js.checkpointG.pristine"

# ---------------- KILL-3: evaluation.js mutation-method probe ----------------
echo "--- KILL-3: evaluation.js += no-op mutation-method calls write/set/delete (never invoked) ---" | tee -a "$SUMMARY"
T=src-js/evaluation.js
cat >> "$T" <<'JS'

// [3.14-G KILL-3] injected violation (never invoked) — removed after the run
function __g14KillProbeEval(){
  const probe = { write(){}, set(){}, delete(){} };
  probe.write(0); probe.set(0); probe.delete(0);
}
JS
run_file "$EV/3.14-G-stubkill-run3.txt"
echo "  $RUN_LINE" | tee -a "$SUMMARY"
check_kill "KILL-3" "A-31 G-3 " "$(failed_ids "$EV/3.14-G-stubkill-run3.txt")" "$RUN_RC"
restore "$T" "$EV/evaluation.js.checkpointG.pristine"

# ---------------- KILL-4: package.json dependencies field ----------------
echo "--- KILL-4: package.json += dependencies field (file-level run; ai.test.mjs G-5 would also flip at suite level — documented) ---" | tee -a "$SUMMARY"
T=package.json
python3 - "$T" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
anchor = '"type": "module",'
assert s.count(anchor) == 1, 'anchor not unique'
# VALID-JSON injection (package.json forbids comments; an invalid file would
# crash Node at startup instead of failing the G-8 scan).
s = s.replace(anchor, anchor + '\n  "dependencies": { "left-pad": "1.3.0" },', 1)
open(p, 'w').write(s)
PY
run_file "$EV/3.14-G-stubkill-run4.txt"
echo "  $RUN_LINE" | tee -a "$SUMMARY"
check_kill "KILL-4" "G-8 " "$(failed_ids "$EV/3.14-G-stubkill-run4.txt")" "$RUN_RC"
restore "$T" "$EV/package.json.checkpointG.pristine"

# ---------------- post-restore verification ----------------
echo "--- post-restore green run ---" | tee -a "$SUMMARY"
run_file "$EV/3.14-G-post-restore-green.txt"
echo "  $RUN_LINE (rc=$RUN_RC)" | tee -a "$SUMMARY"
[ "$RUN_RC" -eq 0 ] || { echo "POST-RESTORE NOT GREEN — ABORT" | tee -a "$SUMMARY"; exit 1; }
echo "STUBKILL PROOF: PASS (4 kills, exact predicted sets, sha256-verified restores)" | tee -a "$SUMMARY"
