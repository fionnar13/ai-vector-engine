#!/usr/bin/env bash
# Full-suite regression battery — npm test entry point (PHASE E item 1).
#
# Protocol identical to the PHASE A-D reconciliation runner:
#   counted: 15 node:test .mjs files (PHASE 3.13 adds tests/ai.test.mjs; run-js.js adds 22)
#   gates:   tests/geometry.test.js, tests/architecture.test.mjs,
#            tests/architecture-phase3.04.mjs, tests/run-js.js,
#            src-js/run.js (dsl vertical slice)
# Exit code 0 only when every counted test passes AND every gate passes.

cd "$(dirname "$0")/.."

TOTAL=0; PASSED=0; FAILED=0; RC=0

FILES="tests/ai.test.mjs tests/appearance-graph.test.mjs tests/appearance.test.mjs tests/constraints.test.mjs tests/correction.test.mjs tests/dsl.test.mjs tests/evaluation-critic.test.mjs tests/geometry.test.mjs tests/interaction-boundaries.test.mjs tests/interaction.test.mjs tests/renderer.test.mjs tests/scenegraph.test.mjs tests/semantic.test.mjs tests/spatial-index.test.mjs tests/stores.test.mjs tests/tools.test.mjs tests/transaction.test.mjs"

for f in $FILES; do
  raw=$(node "$f" 2>&1)
  out=$(echo "$raw" | grep -E "^Tests:" | tail -1)
  if [ -z "$out" ]; then
    printf '%-42s %s\n' "$f" "CRASHED (no summary line) [FAIL]"
    echo "$raw" | tail -10
    RC=1
    continue
  fi
  t=$(echo "$out" | sed -E 's/Tests: ([0-9]+) total.*/\1/')
  p=$(echo "$out" | sed -E 's/.*, ([0-9]+) passed.*/\1/')
  fl=$(echo "$out" | sed -E 's/.*, ([0-9]+) failed.*/\1/')
  TOTAL=$((TOTAL+t)); PASSED=$((PASSED+p)); FAILED=$((FAILED+fl))
  status="OK"; [ "$fl" != "0" ] && { status="FAIL"; RC=1; }
  printf '%-42s %s [%s]\n' "$f" "$out" "$status"
done
echo "COUNTED SUITE: $PASSED passed / $FAILED failed (of $TOTAL)"

echo "--- standalone gates ---"
gate() {
  gate_name="$1"; shift
  gate_out=$("$@" 2>&1); gate_rc=$?
  if [ "$gate_rc" -eq 0 ]; then
    echo "gate PASS: $gate_name"
  else
    echo "gate FAIL: $gate_name (exit $gate_rc)"
    echo "$gate_out" | tail -15
    RC=1
  fi
}
gate "tests/geometry.test.js"             node tests/geometry.test.js
gate "tests/architecture.test.mjs"        node tests/architecture.test.mjs
gate "tests/architecture-phase3.04.mjs"   node tests/architecture-phase3.04.mjs
gate "tests/run-js.js"                    node tests/run-js.js
gate "src-js/run.js (dsl vertical slice)" node src-js/run.js

exit $RC
