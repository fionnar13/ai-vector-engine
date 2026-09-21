#!/usr/bin/env bash
# PHASE 3.13 — Checkpoint A stub-kill proof (spec §28 step 7 / §29).
# Neuters validateIntent (always-valid stub) inside src-js/ai.js, runs
# tests/ai.test.mjs, captures the failure count, restores the pristine file
# (sha256-verified) and re-runs to prove the suite is green again.
set -u
cd "$(dirname "$0")/../.." || exit 1

echo "== BEFORE: pristine hash =="
sha256sum src-js/ai.js

python3 - <<'EOF'
p='src-js/ai.js'
s=open(p).read()
old="""  const errors = [];
  if (intent.type === 'create') validateCreateIntent(intent, errors);
  else if (intent.type === 'transform') validateTransformIntent(intent, errors);
  else if (intent.type === 'appearance') validateAppearanceIntent(intent, errors);
  else if (intent.type === 'alignment') validateAlignmentIntent(intent, errors);
  else validateStructureIntent(intent, errors);
  return { valid: errors.length === 0, errors };"""
new="""  return { valid: true, errors: [] }; // STUB-KILL: validation disabled"""
assert old in s, 'anchor not found — ai.js changed, refusing to stub'
open(p,'w').write(s.replace(old,new))
print('== STUB APPLIED: validateIntent now always returns valid ==')
EOF

echo "== RUN WITH STUB =="
node tests/ai.test.mjs 2>&1
STUB_RC=$?
echo "(stub run exit code: $STUB_RC — nonzero expected)"

echo "== RESTORE =="
cp scripts/phase3.13-evidence/ai.js.checkpointA.pristine src-js/ai.js
sha256sum -c scripts/phase3.13-evidence/ai.js.checkpointA.sha256 || exit 1

echo "== AFTER: restored run =="
node tests/ai.test.mjs 2>&1 | tail -1
echo "== DONE =="
