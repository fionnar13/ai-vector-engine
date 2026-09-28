#!/usr/bin/env bash
# PHASE 3.18 Checkpoint H — spec §69 architecture scans over the FINAL module
# (src-js/semantic-correction.js, now carrying the §50 plan builder
# buildSemanticCorrectionPlan as the twelfth export) plus the H-specific
# presence checks. Every scan must be ZERO-HIT.
set -u
MOD=src-js/semantic-correction.js
fail=0
scan() { # name, pattern (grep -nE), file
  local name="$1" pat="$2" file="$3"
  local hits
  hits=$(grep -nE "$pat" "$file" 2>/dev/null | grep -v 'phase3.18-h-scans' || true)
  if [ -z "$hits" ]; then
    echo "SCAN OK   (0 hits): $name — $file"
  else
    echo "SCAN FAIL: $name — $file"
    echo "$hits"
    fail=1
  fi
}

echo "== §69 scans over $MOD (whole file, comments included — the raw-token posture) =="
scan "role-write surface: setSemanticRole"      'setSemanticRole'                        "$MOD"
scan "role-write surface: setSemantic"          'setSemantic'                            "$MOD"
scan "role-write surface: forceRole"            'forceRole'                              "$MOD"
scan "role-write surface: overrideRole"         'overrideRole'                           "$MOD"
scan "semantic store write: semanticStore"      'semanticStore|SemanticStore'            "$MOD"
scan "network: fetch/axios/http/https"          'fetch|axios|http|https'                 "$MOD"
scan "filesystem: fs./writeFile"                'fs\.|writeFile'                         "$MOD"
scan "LLM: LLM/OpenAI/Anthropic"                'LLM|OpenAI|Anthropic'                   "$MOD"
scan "npm imports: require("                    'require\s*\('                           "$MOD"
scan "npm imports: import declaration"          '(^|\n)\s*import[\s{*'"'"'('             "$MOD"
scan "npm imports: dynamic import()"            'import\s*\('                            "$MOD"
scan "engine import: from './correction'"       "from\s+'\./correction"                  "$MOD"
scan "engine call: rollbackCorrectionAttempt("  'rollbackCorrectionAttempt\s*\('         "$MOD"

echo "== §69 scans over $MOD (STRIPPED code body — the A-14 posture) =="
BODY=$(node -e '
const fs = require("fs");
const src = fs.readFileSync("src-js/semantic-correction.js", "utf-8");
const body = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
process.stdout.write(body);
')
scanbody() {
  local name="$1" pat="$2"
  local hits
  hits=$(printf '%s' "$BODY" | grep -nE "$pat" || true)
  if [ -z "$hits" ]; then
    echo "SCAN OK   (0 hits): $name (stripped body)"
  else
    echo "SCAN FAIL: $name (stripped body)"
    echo "$hits"
    fail=1
  fi
}
scanbody "banned: \bfs\b"                '\bfs\b'
scanbody "banned: \bfetch\b"             '\bfetch\b'
scanbody "banned: \beval\b"              '\beval\b'
scanbody "banned: \bFunction\b"          '\bFunction\b'
scanbody "banned: \bprocess\b"           '\bprocess\b'
scanbody "banned: \bglobalThis\b"        '\bglobalThis\b'
scanbody "banned: Date.now"              'Date\s*\.\s*now'
scanbody "banned: Math.random"           'Math\s*\.\s*random'

echo "== Checkpoint H loop-state scans (spec §50/§51 — carried from G) =="
# The 11-state machine's state names must NOT appear as module vocabulary —
# raw AND stripped. (TERMINATED / VERIFIED are prompt-pinned CONVERGENCE
# VERDICTS in this module — outputs, not loop states; the in-suite J-4 scan
# pins the 9 non-shared names on the stripped body.)
for st in PLANNING EXECUTING EVALUATING DIAGNOSING CORRECTING RE_EXECUTING RE_EVALUATING ROLLING_BACK IDLE; do
  scan "loop-state vocabulary (raw): $st" "\b$st\b" "$MOD"
done
for st in PLANNING EXECUTING EVALUATING DIAGNOSING CORRECTING RE_EXECUTING RE_EVALUATING ROLLING_BACK IDLE; do
  scanbody "loop-state vocabulary (stripped): $st" "\b$st\b"
done
# RNG / wall clock (determinism posture)
scanbody "banned: Math.random"           'Math\s*\.\s*random'
scanbody "banned: Date.now"              'Date\s*\.\s*now'

echo "== Checkpoint H-specific scans (the NEW H region, stripped) =="
HMARK=$(grep -n '^// ---- 17. The plan builder' "$MOD" | head -1 | cut -d: -f1)
HBODY=$(node -e '
const fs = require("fs");
const src = fs.readFileSync("src-js/semantic-correction.js", "utf-8");
const mark = src.indexOf("// ---- 17. The plan builder");
const body = src.slice(mark).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
process.stdout.write(body);
')
echo "(H region starts at line $HMARK)"
scanf() {
  local name="$1" pat="$2"
  local hits
  hits=$(printf '%s' "$HBODY" | grep -nE "$pat" || true)
  if [ -z "$hits" ]; then
    echo "SCAN OK   (0 hits): $name (H region, stripped)"
  else
    echo "SCAN FAIL: $name (H region, stripped)"
    echo "$hits"
    fail=1
  fi
}
scanf "H region: no role-write tokens"   'setSemantic|forceRole|overrideRole|semanticStore|SemanticStore'
scanf "H region: no store-write calls"   '\.set\(|\.update\(|\.create\(|\.delete\('
scanf "H region: no RNG / wall clock"    'Math\s*\.\s*random|Date\s*\.\s*now'
scanf "H region: no engine contact"      "from\s+'\./correction|rollbackCorrectionAttempt|CATEGORY_TO_ROOT_CAUSE\s*=|CORRECTION_CAPABILITY_RECIPES\s*="
# informational presence checks (non-failing)
if printf '%s' "$BODY" | grep -q 'SEMANTIC_CORRECTION_CAPABILITIES.find'; then
  echo "SCAN OK   (present): the plan builder looks the capability up in the REGISTERED registry (step 2)"
else
  echo "SCAN FAIL: the registered-capability lookup is missing"
  fail=1
fi
if printf '%s' "$BODY" | grep -q 'buildSemanticCorrectionProposal(agenda.target, capability, objectFacts)'; then
  echo "SCAN OK   (present): the ONE agenda->proposal conversion goes through the E builder (step 3)"
else
  echo "SCAN FAIL: the E-builder conversion call is missing"
  fail=1
fi
if printf '%s' "$BODY" | grep -q 'agenda.isActionable !== true'; then
  echo "SCAN OK   (present): the NOT_ACTIONABLE gate (step 1)"
else
  echo "SCAN FAIL: the actionability gate is missing"
  fail=1
fi
if printf '%s' "$HBODY" | grep -q 'deepFreeze({'; then
  echo "SCAN OK   (present): the plan record is deep-frozen (step 4)"
else
  echo "SCAN FAIL: the frozen plan record is missing"
  fail=1
fi

echo "== export surface =="
grep -n '^export' "$MOD"
echo "== line count =="
wc -l "$MOD"

if [ "$fail" -eq 0 ]; then echo "ALL §69 + H SCANS ZERO-HIT"; else echo "SCAN FAILURES PRESENT"; exit 1; fi
