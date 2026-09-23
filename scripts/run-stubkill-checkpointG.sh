#!/usr/bin/env bash
# PHASE 3.15 — CHECKPOINT G stub-kill battery (spec §52/§66).
# Injects a runtime-inert architecture violation into the scan target,
# proves EXACTLY the predicted test set fails, restores via sha256.
#   KILL-G1  src-js/correction.js : alias-form capability probe   -> predicted {G-2}
#   KILL-G2  src-js/correction.js : store/scene/history/renderer/wc mutation probe
#                                                                  -> predicted {G-3, G-4, G-5, G-6}
#   KILL-G3  src-js/correction.js : timers/async + dynamic import probe
#                                                                  -> predicted {G-1, G-7, G-10}
#   KILL-G4  src-js/correction.js : nesting/DAG + begin-receiver + construction probe
#                                                                  -> predicted {G-5, G-6, G-9}
#   KILL-G5  src-js/correction.js : unbounded-loop probe          -> predicted {G-8}
#   KILL-G6  package.json         : dependencies field            -> predicted {G-10}  (file level;
#                                     ai.test.mjs G-5 / evaluation-critic.test.mjs G-8 would also flip
#                                     at full-suite level — documented, not run)
# src/core is NEVER injected (frozen; G-11 sensitivity is proven in-test on synthetic input).
# Predictions: scripts/phase3.15-evidence/3.15-G-stubkill-predictions.txt (written first).
set -u
cd "$(dirname "$0")/.."
EV=scripts/phase3.15-evidence
TESTFILE=tests/correction.test.mjs
SUMMARY="$EV/3.15-G-stubkill.txt"

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
echo "=== PHASE 3.15 Checkpoint G stub-kill battery $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$SUMMARY"

# pre-battery pristine check
P=$(pristine_hash "$EV/correction.js.checkpointG.pristine")
T=$(pristine_hash src-js/correction.js)
if [ "$P" != "$T" ]; then echo "PRE-BATTERY PRISTINE MISMATCH — ABORT" | tee -a "$SUMMARY"; exit 1; fi
echo "pre-battery pristine match: $T" | tee -a "$SUMMARY"
cp package.json "$EV/package.json.checkpointG.pristine"
echo "package.json pre-battery snapshot: $(pristine_hash package.json)" | tee -a "$SUMMARY"

# ---------------- KILL-G1: alias-form capability probe ----------------
echo "--- KILL-G1: correction.js += alias-form eval/Function/fetch/window/document references (never invoked) ---" | tee -a "$SUMMARY"
T=src-js/correction.js
cat >> "$T" <<'JS'

// [3.15-G KILL-G1] injected violation (never invoked) — removed after the run
function __g15KillProbeCapability(){
  const evalAlias = eval; const fnAlias = Function; const fetchAlias = fetch;
  const winAlias = window; const docAlias = document;
  void evalAlias; void fnAlias; void fetchAlias; void winAlias; void docAlias;
}
JS
run_file "$EV/3.15-G-stubkill-G1-run.txt"
echo "  $RUN_LINE" | tee -a "$SUMMARY"
check_kill "KILL-G1" "G-2 " "$(failed_ids "$EV/3.15-G-stubkill-G1-run.txt")" "$RUN_RC"
restore "$T" "$EV/correction.js.checkpointG.pristine"

# ---------------- KILL-G2: store/scene/history/renderer/wc mutation probe ----------------
echo "--- KILL-G2: correction.js += direct store/scene/history/renderer/wc mutation calls (never invoked) ---" | tee -a "$SUMMARY"
T=src-js/correction.js
cat >> "$T" <<'JS'

// [3.15-G KILL-G2] injected violation (never invoked) — removed after the run
function __g15KillProbeMutation(substrate){
  const probe = { write(){}, set(){}, delete(){}, insert(){}, remove(){}, update(){} };
  probe.write(0); probe.set(0); probe.delete(0); probe.insert(0); probe.remove(0); probe.update(0);
  substrate.stores.objectStore.write(0);
  substrate.sceneGraph.addObject('x');
  substrate.historyManager.push('x');
  renderer.render(0);
  const wc = {}; wc.write(0); wc.commit(0);
}
JS
run_file "$EV/3.15-G-stubkill-G2-run.txt"
echo "  $RUN_LINE" | tee -a "$SUMMARY"
check_kill "KILL-G2" "G-3 G-4 G-5 G-6 " "$(failed_ids "$EV/3.15-G-stubkill-G2-run.txt")" "$RUN_RC"
restore "$T" "$EV/correction.js.checkpointG.pristine"

# ---------------- KILL-G3: timers/async + dynamic import probe ----------------
echo "--- KILL-G3: correction.js += autonomous/deferred execution forms + dynamic import (never invoked) ---" | tee -a "$SUMMARY"
T=src-js/correction.js
cat >> "$T" <<'JS'

// [3.15-G KILL-G3] injected violation (never invoked) — removed after the run
function __g15KillProbeAsync(f){
  setTimeout(f, 0); setInterval(f, 0); setImmediate(f); queueMicrotask(f);
  addEventListener('x', f); requestAnimationFrame(f);
  const p = new Promise((res) => res(1));
  const m = import('x');
  void p; void m;
}
JS
run_file "$EV/3.15-G-stubkill-G3-run.txt"
echo "  $RUN_LINE" | tee -a "$SUMMARY"
check_kill "KILL-G3" "G-1 G-10 G-7 " "$(failed_ids "$EV/3.15-G-stubkill-G3-run.txt")" "$RUN_RC"
restore "$T" "$EV/correction.js.checkpointG.pristine"

# ---------------- KILL-G4: nesting/DAG/begin-receiver/construction probe ----------------
echo "--- KILL-G4: correction.js += second begin-receiver + nest/DAG words + substrate construction (never invoked) ---" | tee -a "$SUMMARY"
T=src-js/correction.js
cat >> "$T" <<'JS'

// [3.15-G KILL-G4] injected violation (never invoked) — removed after the run
function __g15KillProbeNest(substrate){
  const nestedBuilder = substrate.transactionBuilder;
  const b = nestedBuilder.begin({});
  b.build();
  const nested = 1; const dag = 1;
  void nested; void dag;
  return b;
}
function __g15KillProbeConstruct(){
  return [new TransactionBuilder(), new HistoryManager()];
}
JS
run_file "$EV/3.15-G-stubkill-G4-run.txt"
echo "  $RUN_LINE" | tee -a "$SUMMARY"
check_kill "KILL-G4" "G-5 G-6 G-9 " "$(failed_ids "$EV/3.15-G-stubkill-G4-run.txt")" "$RUN_RC"
restore "$T" "$EV/correction.js.checkpointG.pristine"

# ---------------- KILL-G5: unbounded-loop probe ----------------
echo "--- KILL-G5: correction.js += while(true) probe (never invoked) ---" | tee -a "$SUMMARY"
T=src-js/correction.js
cat >> "$T" <<'JS'

// [3.15-G KILL-G5] injected violation (never invoked) — removed after the run
function __g15KillProbeLoop(){
  let i = 0;
  while (i < 10){ i++; }
  while (true){ break; }
  return i;
}
JS
run_file "$EV/3.15-G-stubkill-G5-run.txt"
echo "  $RUN_LINE" | tee -a "$SUMMARY"
check_kill "KILL-G5" "G-8 " "$(failed_ids "$EV/3.15-G-stubkill-G5-run.txt")" "$RUN_RC"
restore "$T" "$EV/correction.js.checkpointG.pristine"

# ---------------- KILL-G6: package.json dependencies field ----------------
echo "--- KILL-G6: package.json += dependencies field (file-level run; ai.test.mjs G-5 / evaluation-critic.test.mjs G-8 would also flip at suite level — documented) ---" | tee -a "$SUMMARY"
T=package.json
python3 - "$T" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
anchor = '"type": "module",'
assert s.count(anchor) == 1, 'anchor not unique'
# VALID-JSON injection (package.json forbids comments; an invalid file would
# crash Node at startup instead of failing the G-10 scan).
s = s.replace(anchor, anchor + '\n  "dependencies": { "left-pad": "1.3.0" },', 1)
open(p, 'w').write(s)
PY
run_file "$EV/3.15-G-stubkill-G6-run.txt"
echo "  $RUN_LINE" | tee -a "$SUMMARY"
check_kill "KILL-G6" "G-10 " "$(failed_ids "$EV/3.15-G-stubkill-G6-run.txt")" "$RUN_RC"
restore "$T" "$EV/package.json.checkpointG.pristine"

# ---------------- post-restore verification ----------------
echo "--- post-restore green run ---" | tee -a "$SUMMARY"
run_file "$EV/3.15-G-post-restore-green.txt"
echo "  $RUN_LINE (rc=$RUN_RC)" | tee -a "$SUMMARY"
[ "$RUN_RC" -eq 0 ] || { echo "POST-RESTORE NOT GREEN — ABORT" | tee -a "$SUMMARY"; exit 1; }
echo "STUBKILL PROOF: PASS (6 kills, exact predicted sets, sha256-verified restores)" | tee -a "$SUMMARY"
