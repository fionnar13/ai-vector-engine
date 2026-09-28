#!/usr/bin/env bash
# PHASE 3.18 Checkpoint G — spec §69 architecture scans over the UPDATED module
# (src-js/semantic-correction.js, now carrying regression + rollback +
# convergence + the loop-bridge agenda) plus the G-specific scans.
# Every scan must be ZERO-HIT.
set -u
MOD=src-js/semantic-correction.js
fail=0
scan() { # name, pattern (grep -nE), file
  local name="$1" pat="$2" file="$3"
  local hits
  hits=$(grep -nE "$pat" "$file" 2>/dev/null | grep -v 'phase3.18-g-scans' || true)
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

echo "== Checkpoint G-specific scans (spec §50/§51) =="
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
# direct store writes anywhere in the NEW G code (region from the section-12 marker)
GMARK=$(grep -n '^// ---- 12. Checkpoint G' "$MOD" | head -1 | cut -d: -f1)
GBODY=$(node -e '
const fs = require("fs");
const src = fs.readFileSync("src-js/semantic-correction.js", "utf-8");
const mark = src.indexOf("// ---- 12. Checkpoint G");
const body = src.slice(mark).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
process.stdout.write(body);
')
echo "(G region starts at line $GMARK)"
scanf() {
  local name="$1" pat="$2"
  local hits
  hits=$(printf '%s' "$GBODY" | grep -nE "$pat" || true)
  if [ -z "$hits" ]; then
    echo "SCAN OK   (0 hits): $name (G region, stripped)"
  else
    echo "SCAN FAIL: $name (G region, stripped)"
    echo "$hits"
    fail=1
  fi
}
scanf "G region: no role-write tokens" 'setSemantic|forceRole|overrideRole|semanticStore|SemanticStore'
scanf "G region: no store-write calls" '\.set\(|\.update\(|\.create\(|\.delete\('
scanf "G region: no RNG / wall clock" 'Math\s*\.\s*random|Date\s*\.\s*now'
# informational presence checks (non-failing)
if printf '%s' "$BODY" | grep -q 'transactionManager.undo()'; then
  echo "SCAN OK   (present): rollback goes through the substrate's OWN undo (transactionManager.undo())"
else
  echo "SCAN FAIL: the substrate undo path is missing"
  fail=1
fi
if printf '%s' "$BODY" | grep -q 'historyManager.getTransactionToUndo()'; then
  echo "SCAN OK   (present): the top-of-history guard reads through the transactionManager (disclosure 32)"
else
  echo "SCAN FAIL: the top-of-history reader is missing"
  fail=1
fi

echo "== export surface =="
grep -n '^export' "$MOD"
echo "== line count =="
wc -l "$MOD"

if [ "$fail" -eq 0 ]; then echo "ALL §69 + G SCANS ZERO-HIT"; else echo "SCAN FAILURES PRESENT"; exit 1; fi
