#!/usr/bin/env bash
# PHASE 3.18 Checkpoint F — spec §69 architecture scans over the UPDATED module
# (src-js/semantic-correction.js, now carrying the verification path + provider).
# Every scan must be ZERO-HIT. Mirrors the D/E scan battery verbatim.
set -u
MOD=src-js/semantic-correction.js
fail=0
scan() { # name, pattern (grep -nE), file
  local name="$1" pat="$2" file="$3"
  local hits
  hits=$(grep -nE "$pat" "$file" 2>/dev/null | grep -v 'phase3.18-f-scans' || true)
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

echo "== §69 scans over $MOD (STRIPPED code body — the A-14 posture) =="
# strip comments with node (house stripComments verbatim), then scan the body
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

echo "== Checkpoint F additional scans =="
scanbody "F: no RNG (Math.random)"       'Math\s*\.\s*random'
scanbody "F: direct store writes .set("  '\.set\('
scanbody "F: direct store writes .update(" '\.update\('
scanbody "F: direct store writes .create(" '\.create\('
scanbody "F: direct store writes .delete(" '\.delete\('
# NOTE: the working-copy facade set* names (substrateWorkingCopyView) are the
# E-APPROVED execution path (verbatim correction.js:2388-2412) — the store-write
# NAME scan is scoped to the Checkpoint F REGION (the E-11 in-suite predicate),
# where the F code must be read-only.
FMARK=$(grep -n '^// ---- 9. Checkpoint F' "$MOD" | head -1 | cut -d: -f1)
FBODY=$(node -e '
const fs = require("fs");
const src = fs.readFileSync("src-js/semantic-correction.js", "utf-8");
const mark = src.indexOf("// ---- 9. Checkpoint F");
const body = src.slice(mark).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
process.stdout.write(body);
')
echo "(F region starts at line $FMARK)"
scanf() {
  local name="$1" pat="$2"
  local hits
  hits=$(printf '%s' "$FBODY" | grep -nE "$pat" || true)
  if [ -z "$hits" ]; then
    echo "SCAN OK   (0 hits): $name (F region, stripped)"
  else
    echo "SCAN FAIL: $name (F region, stripped)"
    echo "$hits"
    fail=1
  fi
}
scanf "F region: no role-write tokens" 'setSemantic|forceRole|overrideRole|semanticStore|SemanticStore'
scanf "F region: no store-write names" 'setObject|setGeometry|setAppearance|setNode'
scanf "F region: no direct store writes" '\.set\(|\.update\(|\.create\(|\.delete\('
echo "== export surface =="
grep -n '^export' "$MOD"
echo "== line count =="
wc -l "$MOD"

# the F-region registry assertion is informational (presence, not absence):
# re-check it without the fail flag
if printf '%s' "$FBODY" | grep -qE 'registry\.get\(' && printf '%s' "$FBODY" | grep -qE 'registry\.has\('; then
  echo "SCAN OK   (present): F region reaches T20 only via registry.get/registry.has"
else
  echo "SCAN FAIL: F region does not reach T20 through the registry"
  fail=1
fi

if [ "$fail" -eq 0 ]; then echo "ALL §69 SCANS ZERO-HIT"; else echo "SCAN FAILURES PRESENT"; exit 1; fi
