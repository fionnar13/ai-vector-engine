// ============================================================================
// PHASE 3.18 — SEMANTIC CORRECTION DIAGNOSIS TESTS
// (tests/semantic-correction.test.mjs — Checkpoint D, Category A, spec §109)
// ============================================================================
// Harness protocol: identical to tests/semantic-inference.test.mjs (house
// runner, final "Tests: N total, M passed, F failed" line, exit 1 on failure).
//
// RED-FIRST DISCIPLINE (spec §109): this file was written BEFORE
// src-js/semantic-correction.js existed. The RED run (ERR_MODULE_NOT_FOUND —
// zero tests loadable) is captured verbatim in
// scripts/phase3.18-evidence/3.18-D-red.txt. The implementation was written
// SECOND; this file then went GREEN byte-for-byte unchanged (the 3.17
// N-category precedent, tests/semantic-inference.test.mjs:294).
//
// SCOPE (Checkpoint D — DIAGNOSIS ONLY): the C-approved data model (Checkpoint
// C report scripts/phase3.18-evidence/3.18-C-DATA-MODEL.md C1-C4, typedefs
// copied VERBATIM into the module), the frozen ONE-entry capability registry
// (C2), and the pure static selector diagnoseSemanticDeviation. NOT under test
// here: the proposal builder (Checkpoint E), the execution path (Checkpoint E),
// the verification path (Checkpoint F), any transaction interaction.
//
// CATEGORY A (16 tests, Checkpoint D):
//   A-1  module exports — diagnoseSemanticDeviation and
//        SEMANTIC_CORRECTION_CAPABILITIES exist
//   A-2  capability registry shape — exactly ONE entry, id
//        'cap-shape-background', frozen, C8 preconditions encoding
//   A-3  happy path — shape->background, rect, area 20000, childCount 0
//        -> CORRECTABLE + capabilityId
//   A-4  happy path reverse — background->shape, rect, area 200000,
//        childCount 0 -> CORRECTABLE
//   A-5  rect-gate violation — shape->background with ellipse
//        -> UNSUPPORTED_TRANSITION / GEOMETRY_TYPE_NOT_ELIGIBLE
//   A-6  container-override violation — background->shape with rect +
//        childCount 3 -> UNSUPPORTED_TRANSITION / CONTAINER_OVERRIDE_WOULD_INTERCEPT
//   A-7  role pair unsupported — text->heading
//        -> UNSUPPORTED_TRANSITION / ROLE_PAIR_UNSUPPORTED
//   A-8  role pair unsupported — icon->shape
//        -> UNSUPPORTED_TRANSITION / ROLE_PAIR_UNSUPPORTED
//   A-9  determinism — same input twice -> byte-identical diagnosis record
//   A-10 content-derived targetId — 'sct-' + exactly 8 hex chars (on verdict
//        AND refusal records)
//   A-11 no store mutation — zero imports (static scan: no store module
//        reference anywhere) + frozen inputs survive the call byte-identical
//   A-12 input validation — invalid deviation shape -> throws
//        SemanticCorrectionError with code INVALID_DEVIATION
//   A-13 input validation — invalid objectFacts -> throws
//        SemanticCorrectionError with code INVALID_OBJECT_FACTS
//   A-14 architecture scan — no fs, no fetch, no eval, no Function, no
//        process, no globalThis, no Date.now, no Math.random in the STRIPPED
//        code body (comments removed first)
//   A-15 frozen output — every returned diagnosis is deep-frozen (all verdicts)
//   A-16 golden scenario chain — dev id 'dev-8305da82' + the C6
//        worked-example facts -> targetId 'sct-86f52be0' (the Checkpoint C
//        computed anchor, scripts/phase3.18-c-hashes.mjs)
// ============================================================================

// --- the module under test (RED until src-js/semantic-correction.js exists) ---
import {
  diagnoseSemanticDeviation,
  SEMANTIC_CORRECTION_CAPABILITIES,
  SemanticCorrectionError
} from '../src-js/semantic-correction.js';

// --- static-scan support (A-11/A-14 read the module source directly) ---------
import { readFileSync } from 'node:fs';

// --- house runner (verbatim 3.16/3.17 pattern) -------------------------------
let total=0, passed=0, failed=0;
const pending=[];
function test(name, fn){ total++; try{ const r=fn(); if(r&&typeof r.then==='function'){ pending.push(r.then(()=>{passed++; console.log(`✓ ${name}`);}, e=>{failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);})); } else { passed++; console.log(`✓ ${name}`);} }catch(e){ failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }
function eq(a,b,msg){ if(a!==b) throw new Error(`${msg||'eq failed'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function deepEq(a,b,msg){ const x=JSON.stringify(a), y=JSON.stringify(b); if(x!==y) throw new Error(`${msg||'deepEq failed'}: ${x} !== ${y}`); }
function deepFrozen(value, path){
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value), `deep-frozen violated at ${path||'(root)'}`);
  for (const k of Object.keys(value)) deepFrozen(value[k], `${path||'(root)'}.${k}`);
}

// --- fixtures ----------------------------------------------------------------
// The 11-key §13 semantic deviation archetype: the createDeviation output
// shape (evaluation.js:459-479) as the semantic arm builds it (:1314-1325).
// Fixture ids/message text are STAND-INS (the house fixture-factory posture,
// semantic-inference.test.mjs makeProposal) — the engine's real content-derived
// ids appear only in A-16's golden record.
function makeDeviation(overrides = {}){
  return {
    id: 'dev-1a2b3c4d',
    category: 'semantic',
    property: 'role',
    expected: 'background',
    actual: 'shape',
    delta: null,
    tolerance: null,
    severity: 'error',
    objectId: 'obj-fix-1',
    targetRef: '$doc:obj-fix-1',
    message: "semantic role expectation violated: object 'obj-fix-1' expected role 'background', observed role 'shape'",
    ...overrides,
  };
}
// The caller-supplied object facts (the host reads them from the document
// BEFORE calling — the diagnosis function itself is pure and store-free).
function makeFacts(overrides = {}){
  return { geometryType: 'rect', childCount: 0, worldArea: 20000, ...overrides };
}
function makeShrinkDeviation(overrides = {}){
  return makeDeviation({
    expected: 'shape',
    actual: 'background',
    message: "semantic role expectation violated: object 'obj-fix-1' expected role 'shape', observed role 'background'",
    ...overrides,
  });
}
function stripComments(src){
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

// ---- A-1 --------------------------------------------------------------------
test('A-1: module exports — diagnoseSemanticDeviation and SEMANTIC_CORRECTION_CAPABILITIES exist (+ the SemanticCorrectionError surface)', ()=>{
  eq(typeof diagnoseSemanticDeviation, 'function', 'diagnoseSemanticDeviation is an exported function');
  eq(Array.isArray(SEMANTIC_CORRECTION_CAPABILITIES), true, 'SEMANTIC_CORRECTION_CAPABILITIES is an array');
  eq(typeof SemanticCorrectionError, 'function', 'SemanticCorrectionError is an exported constructor');
  expect(new SemanticCorrectionError('X', 'probe') instanceof Error, 'SemanticCorrectionError extends Error');
});

// ---- A-2 --------------------------------------------------------------------
test('A-2: capability registry shape — exactly ONE entry, id cap-shape-background, frozen, with the C8 preconditions encoding', ()=>{
  eq(SEMANTIC_CORRECTION_CAPABILITIES.length, 1, 'exactly ONE capability entry (the B-approved single real capability)');
  const cap = SEMANTIC_CORRECTION_CAPABILITIES[0];
  eq(cap.id, 'cap-shape-background', 'the frozen static literal id');
  deepEq(cap.sourceRoles, ['shape', 'background'], 'sourceRoles');
  deepEq(cap.targetRoles, ['background', 'shape'], 'targetRoles, positionally paired with sourceRoles');
  deepEq(cap.toolIds, ['T06'], 'toolIds — the ONE role-moving tool');
  deepEq(cap.evidenceKeys, ['size'], 'evidenceKeys — the ONLY role-bearing AND mutation-reachable key');
  eq(cap.scope, 'LOCAL', 'scope');
  eq(cap.risk, 'MEDIUM', 'risk');
  eq(cap.reversible, true, 'reversible');
  eq(cap.deterministic, true, 'deterministic');
  deepEq(cap.preconditions, {
    geometryTypes: ['rect'],
    areaGrowThreshold: 100000,
    areaShrinkThreshold: 5000,
    areaMargin: 0.05,
    maxChildCountForShrink: 2,
    matrixForm: 'UNIFORM_SCALE'
  }, 'preconditions carry the C8 encoding of constraints (a)-(d)');
  deepFrozen(SEMANTIC_CORRECTION_CAPABILITIES, 'registry');
});

// ---- A-3 --------------------------------------------------------------------
test('A-3: happy path — shape->background with rect + area 20000 + childCount 0 -> CORRECTABLE + capabilityId', ()=>{
  const d = diagnoseSemanticDeviation(makeDeviation(), makeFacts());
  eq(d.status, 'CORRECTABLE', 'verdict');
  eq(d.capabilityId, 'cap-shape-background', 'capabilityId set IFF CORRECTABLE');
  eq(d.reason, null, 'reason is null on CORRECTABLE (the C3 convention)');
  eq(d.targetId.length, 12, 'targetId present (sct- + 8 hex)');
  deepEq(d.affectedObjectIds, ['obj-fix-1'], 'affected = exactly the target object (scope LOCAL)');
});

// ---- A-4 --------------------------------------------------------------------
test('A-4: happy path reverse — background->shape with rect + area 200000 + childCount 0 -> CORRECTABLE', ()=>{
  const d = diagnoseSemanticDeviation(makeShrinkDeviation(), makeFacts({ worldArea: 200000 }));
  eq(d.status, 'CORRECTABLE', 'verdict');
  eq(d.capabilityId, 'cap-shape-background', 'same capability, opposite positional pair');
  eq(d.reason, null, 'reason is null on CORRECTABLE');
});

// ---- A-5 --------------------------------------------------------------------
test('A-5: rect-gate violation — shape->background with ellipse -> UNSUPPORTED_TRANSITION / GEOMETRY_TYPE_NOT_ELIGIBLE', ()=>{
  const d = diagnoseSemanticDeviation(makeDeviation(), makeFacts({ geometryType: 'ellipse' }));
  eq(d.status, 'UNSUPPORTED_TRANSITION', 'static selector verdict');
  eq(d.capabilityId, null, 'no capabilityId on a refusal (C3: construction breach otherwise)');
  eq(d.reason, 'GEOMETRY_TYPE_NOT_ELIGIBLE', 'constraint (a) refusal reason');
  deepEq(d.affectedObjectIds, ['obj-fix-1'], 'affected still names the object');
});

// ---- A-6 --------------------------------------------------------------------
test('A-6: container-override violation — background->shape with rect + childCount 3 -> UNSUPPORTED_TRANSITION / CONTAINER_OVERRIDE_WOULD_INTERCEPT', ()=>{
  const d = diagnoseSemanticDeviation(makeShrinkDeviation(), makeFacts({ childCount: 3 }));
  eq(d.status, 'UNSUPPORTED_TRANSITION', 'static selector verdict');
  eq(d.capabilityId, null, 'no capabilityId on a refusal');
  eq(d.reason, 'CONTAINER_OVERRIDE_WOULD_INTERCEPT', 'constraint (b) refusal reason');
});

// ---- A-7 --------------------------------------------------------------------
test('A-7: role pair unsupported — text->heading -> UNSUPPORTED_TRANSITION / ROLE_PAIR_UNSUPPORTED', ()=>{
  const d = diagnoseSemanticDeviation(
    makeDeviation({ expected: 'heading', actual: 'text', objectId: 'obj-text-1', targetRef: '$doc:obj-text-1' }),
    makeFacts()
  );
  eq(d.status, 'UNSUPPORTED_TRANSITION', 'static selector verdict');
  eq(d.capabilityId, null, 'no capabilityId on a refusal');
  eq(d.reason, 'ROLE_PAIR_UNSUPPORTED', 'generic pair refusal reason');
  deepEq(d.affectedObjectIds, ['obj-text-1'], 'affected = the deviation object');
});

// ---- A-8 --------------------------------------------------------------------
test('A-8: role pair unsupported — icon->shape -> UNSUPPORTED_TRANSITION / ROLE_PAIR_UNSUPPORTED', ()=>{
  const d = diagnoseSemanticDeviation(
    makeDeviation({ expected: 'shape', actual: 'icon', objectId: 'obj-icon-1', targetRef: '$doc:obj-icon-1' }),
    makeFacts()
  );
  eq(d.status, 'UNSUPPORTED_TRANSITION', 'static selector verdict');
  eq(d.capabilityId, null, 'no capabilityId on a refusal');
  eq(d.reason, 'ROLE_PAIR_UNSUPPORTED', 'generic pair refusal reason');
});

// ---- A-9 --------------------------------------------------------------------
test('A-9: determinism — same input twice -> byte-identical diagnosis record (no RNG, no wall clock)', ()=>{
  const dev = makeDeviation(), facts = makeFacts();
  const a = diagnoseSemanticDeviation(dev, facts);
  const b = diagnoseSemanticDeviation(dev, facts);
  eq(JSON.stringify(a), JSON.stringify(b), 'byte-identical verdict records');
  const r1 = diagnoseSemanticDeviation(makeShrinkDeviation(), makeFacts({ childCount: 3 }));
  const r2 = diagnoseSemanticDeviation(makeShrinkDeviation(), makeFacts({ childCount: 3 }));
  eq(JSON.stringify(r1), JSON.stringify(r2), 'byte-identical refusal records');
});

// ---- A-10 -------------------------------------------------------------------
test('A-10: content-derived targetId — starts with sct-, exactly 8 lowercase hex chars after the prefix', ()=>{
  const ok = diagnoseSemanticDeviation(makeDeviation(), makeFacts());
  expect(/^sct-[0-9a-f]{8}$/.test(ok.targetId), `CORRECTABLE targetId format: ${ok.targetId}`);
  const refused = diagnoseSemanticDeviation(makeDeviation(), makeFacts({ geometryType: 'ellipse' }));
  expect(/^sct-[0-9a-f]{8}$/.test(refused.targetId), `refusal targetId format: ${refused.targetId}`);
  const pairRefused = diagnoseSemanticDeviation(
    makeDeviation({ expected: 'heading', actual: 'text' }), makeFacts()
  );
  expect(/^sct-[0-9a-f]{8}$/.test(pairRefused.targetId), `pair-refusal targetId format: ${pairRefused.targetId}`);
});

// ---- A-11 -------------------------------------------------------------------
test('A-11: no store mutation — the module imports nothing (zero-import static scan, no store module reference) and frozen inputs survive the call untouched', ()=>{
  const src = readFileSync(new URL('../src-js/semantic-correction.js', import.meta.url), 'utf-8');
  expect(!/(^|\n)\s*import[\s{*'"(]/.test(src), 'no import declarations (the zero-import pin)');
  expect(!/require\s*\(/.test(src), 'no require() calls');
  expect(!/import\s*\(/.test(src), 'no dynamic import() calls');
  for (const token of ['ObjectStore', 'GeometryStore', 'AppearanceStore', 'SceneGraph', 'SemanticStore', 'semanticStore']){
    expect(!src.includes(token), `no ${token} reference anywhere in the module`);
  }
  // Behavioral: frozen inputs + strict module code — any write attempt would throw.
  const dev = Object.freeze(makeDeviation());
  const facts = Object.freeze(makeFacts());
  const before = JSON.stringify([dev, facts]);
  diagnoseSemanticDeviation(dev, facts);
  eq(JSON.stringify([dev, facts]), before, 'inputs byte-identical after the call');
});

// ---- A-12 -------------------------------------------------------------------
test('A-12: input validation — invalid deviation shape -> throws SemanticCorrectionError with code INVALID_DEVIATION and a deterministic message', ()=>{
  const missingExpected = makeDeviation(); delete missingExpected.expected;
  const missingId = makeDeviation(); delete missingId.id;
  const cases = [
    ['non-object record', null],
    ['array record', [makeDeviation()]],
    ['non-semantic category', makeDeviation({ category: 'layout' })],
    ['wrong property', makeDeviation({ property: 'position' })],
    ['missing key (expected)', missingExpected],
    ['missing key (id)', missingId],
    ['out-of-vocabulary currentRole', makeDeviation({ actual: 'widget' })],
    ['out-of-vocabulary targetRole', makeDeviation({ expected: 'widget' })],
    ['non-string id', makeDeviation({ id: 42 })],
    ['empty objectId', makeDeviation({ objectId: '' })],
  ];
  for (const [label, bad] of cases){
    let threw = null;
    try { diagnoseSemanticDeviation(bad, makeFacts()); } catch (e){ threw = e; }
    expect(threw, `${label}: threw`);
    expect(threw instanceof SemanticCorrectionError, `${label}: SemanticCorrectionError instance`);
    eq(threw.code, 'INVALID_DEVIATION', `${label}: code`);
    expect(threw.message.length > 0, `${label}: deterministic non-empty message`);
  }
});

// ---- A-13 -------------------------------------------------------------------
test('A-13: input validation — invalid objectFacts -> throws SemanticCorrectionError with code INVALID_OBJECT_FACTS', ()=>{
  const missingArea = makeFacts(); delete missingArea.worldArea;
  const missingCount = makeFacts(); delete missingCount.childCount;
  const cases = [
    ['null facts', null],
    ['array facts', [makeFacts()]],
    ['missing key (worldArea)', missingArea],
    ['missing key (childCount)', missingCount],
    ['missing key (geometryType)', (()=>{ const f = makeFacts(); delete f.geometryType; return f; })()],
    ['non-finite worldArea (NaN)', makeFacts({ worldArea: NaN })],
    ['non-finite worldArea (Infinity)', makeFacts({ worldArea: Infinity })],
    ['non-finite childCount (NaN)', makeFacts({ childCount: NaN })],
    ['non-number childCount', makeFacts({ childCount: '2' })],
    ['empty geometryType', makeFacts({ geometryType: '' })],
    ['non-string geometryType', makeFacts({ geometryType: 7 })],
  ];
  for (const [label, bad] of cases){
    let threw = null;
    try { diagnoseSemanticDeviation(makeDeviation(), bad); } catch (e){ threw = e; }
    expect(threw, `${label}: threw`);
    expect(threw instanceof SemanticCorrectionError, `${label}: SemanticCorrectionError instance`);
    eq(threw.code, 'INVALID_OBJECT_FACTS', `${label}: code`);
  }
  // null worldArea IS a valid fact (the typedef's number|null): it must NOT
  // throw on validation — it refuses downstream (STRICT_CROSSING_UNACHIEVABLE
  // on the grow direction, pinned in A-15).
  let nullAreaThrew = null;
  try { diagnoseSemanticDeviation(makeDeviation(), makeFacts({ worldArea: null })); } catch (e){ nullAreaThrew = e; }
  eq(nullAreaThrew, null, 'worldArea: null is a valid fact value, not a validation refusal');
});

// ---- A-14 -------------------------------------------------------------------
test('A-14: architecture scan — no fs, no fetch, no eval, no Function, no process, no globalThis, no Date.now, no Math.random in the STRIPPED code body', ()=>{
  const body = stripComments(readFileSync(new URL('../src-js/semantic-correction.js', import.meta.url), 'utf-8'));
  const banned = [
    [/\bfs\b/, 'fs'],
    [/\bfetch\b/, 'fetch'],
    [/\beval\b/, 'eval'],
    [/\bFunction\b/, 'Function'],
    [/\bprocess\b/, 'process'],
    [/\bglobalThis\b/, 'globalThis'],
    [/\bDate\s*\.\s*now\b/, 'Date.now'],
    [/\bMath\s*\.\s*random\b/, 'Math.random'],
  ];
  for (const [re, name] of banned){
    expect(!re.test(body), `banned token in stripped code body: ${name}`);
  }
  expect(body.length > 1000, 'the stripped module is a real implementation, not a stub');
});

// ---- A-15 -------------------------------------------------------------------
test('A-15: frozen output — every returned diagnosis is deep-frozen (CORRECTABLE and every refusal arm)', ()=>{
  deepFrozen(diagnoseSemanticDeviation(makeDeviation(), makeFacts()), 'CORRECTABLE');
  deepFrozen(diagnoseSemanticDeviation(makeDeviation(), makeFacts({ geometryType: 'ellipse' })), 'GEOMETRY_TYPE_NOT_ELIGIBLE');
  deepFrozen(diagnoseSemanticDeviation(makeShrinkDeviation(), makeFacts({ childCount: 3 })), 'CONTAINER_OVERRIDE_WOULD_INTERCEPT');
  deepFrozen(diagnoseSemanticDeviation(makeDeviation({ expected: 'heading', actual: 'text' }), makeFacts()), 'ROLE_PAIR_UNSUPPORTED');
  deepFrozen(diagnoseSemanticDeviation(makeDeviation(), makeFacts({ worldArea: null })), 'STRICT_CROSSING_UNACHIEVABLE (null area, grow)');
  deepFrozen(diagnoseSemanticDeviation(makeDeviation(), makeFacts({ worldArea: 0 })), 'STRICT_CROSSING_UNACHIEVABLE (zero area, grow)');
});

// ---- A-16 -------------------------------------------------------------------
test('A-16: golden scenario chain — dev-8305da82 + the C6 worked-example facts -> targetId sct-86f52be0 (Checkpoint C computed anchor)', ()=>{
  // The Checkpoint C §C6 worked example, VERBATIM: the createDeviation content
  // (evaluation.js:459-470, message template verbatim :1324) with the
  // computed id dev-8305da82, and the target id inputs
  // {objectId, currentRole:'shape', targetRole:'background', source:'dev-8305da82'}
  // -> sct-86f52be0 (computed by scripts/phase3.18-c-hashes.mjs implementing
  // the house hash verbatim). This test is the integration anchor between the
  // approved data model and this implementation.
  const GOLDEN_OBJECT_ID = '11111111-1111-4111-8111-111111111111';
  const goldenDeviation = {
    id: 'dev-8305da82',
    category: 'semantic',
    property: 'role',
    expected: 'background',
    actual: 'shape',
    delta: null,
    tolerance: null,
    severity: 'error',
    objectId: GOLDEN_OBJECT_ID,
    targetRef: '$doc:11111111-1111-4111-8111-111111111111',
    message: "semantic role expectation violated: object '11111111-1111-4111-8111-111111111111' expected role 'background', observed role 'shape'"
  };
  const d = diagnoseSemanticDeviation(
    goldenDeviation,
    { geometryType: 'rect', childCount: 0, worldArea: 20000 }
  );
  eq(d.targetId, 'sct-86f52be0', 'targetId = the C6 worked example, byte-for-byte');
  eq(d.status, 'CORRECTABLE', 'the golden verdict');
  eq(d.capabilityId, 'cap-shape-background', 'the golden capability');
  eq(d.reason, null, 'reason null on the golden CORRECTABLE');
  deepEq(d.affectedObjectIds, [GOLDEN_OBJECT_ID], 'affected = exactly the golden object');
  // The refusal mirror of C6 #7: same object facts, an unsupported pair keeps
  // the record shape with capabilityId null.
  const refused = diagnoseSemanticDeviation(
    makeDeviation({ expected: 'heading', actual: 'text', objectId: GOLDEN_OBJECT_ID, targetRef: '$doc:' + GOLDEN_OBJECT_ID }),
    { geometryType: 'rect', childCount: 0, worldArea: 20000 }
  );
  eq(refused.status, 'UNSUPPORTED_TRANSITION', 'C6 #7 refusal status');
  eq(refused.capabilityId, null, 'C6 #7 refusal capabilityId');
  eq(refused.reason, 'ROLE_PAIR_UNSUPPORTED', 'C6 #7 refusal reason');
});

// ============================================================================
// PHASE 3.18 CHECKPOINT E — PROPOSAL BUILDER + EXECUTION PATH (spec §109)
// ============================================================================
// Appended AFTER the A category per the Checkpoint E prompt ("ADD new test
// categories AFTER the existing A-tests (do NOT modify A-tests)"). The A test
// bodies above are byte-identical to the approved Checkpoint D file; this
// section adds its own import declarations (legal hoisted ESM — the module
// link fails RED until src-js/semantic-correction.js exports the two new
// names, which IS the honest RED for an extended module surface).
//
// CATEGORY B (12 tests) — buildSemanticCorrectionProposal:
//   B-1  frozen proposal with exactly the C4 keys
//   B-2  id 'scp-<8hex>' + the C6 golden value scp-f09b1135
//   B-3  mutation kind/toolId/uniform-scale form
//   B-4  mutation.input.objectIds === [target.objectId]
//   B-5  expectedSemanticEffect role from/toward + predictedWorldArea beyond
//        the threshold
//   B-6  grow margin 0.05 (shape -> background)
//   B-7  shrink direction (background -> shape) strictly below 5000
//   B-8  confidence copied from target, never synthesized (value AND null)
//   B-9  provenance source/deviationId (+ the smr- host-path mirror)
//   B-10 strict-crossing refusal PREDICTED_AREA_INSIDE_THRESHOLD
//   B-11 non-uniform foreign descriptor refusal NON_UNIFORM_SCALE_REJECTED
//        (defense in depth: T06's own validator accepts it)
//   B-12 determinism — same input twice -> byte-identical proposal
//
// CATEGORY C (10 tests) — executeSemanticCorrectionAttempt (real substrate):
//   C-1  EXACTLY ONE transaction   C-2  atx- content-derived id
//   C-3  T06 fetched from the substrate registry (spy)
//   C-4  store mutation committed (real geometry change, read surface)
//   C-5  registry miss -> FAILED/TOOLS_UNAVAILABLE, stores untouched
//   C-6  tool validation failure -> FAILED, stores untouched (atomic)
//   C-7  inverseKind 'snapshot'    C-8  history grows by exactly 1
//   C-9  TransactionCommitted fires AFTER commit (invariant 16)
//   C-10 determinism — same proposal + fresh substrate -> byte-identical
//
// CATEGORY D (4 tests) — golden end-to-end:
//   D-1  full chain: real document -> real T20 -> diagnose -> proposal ->
//        execute -> commit -> real T20 re-derivation flips the role
//   D-2  post-mutation verification: re-derived role === expected toward
//   D-3  rollback: snapshot inverse undo restores the stores
//   D-4  C6 golden chain byte-for-byte: dev-8305da82 -> sct-86f52be0 ->
//        scp-f09b1135, post-area === 105000
// ============================================================================

// --- the two new exports (RED until the module provides them) -----------------
import {
  buildSemanticCorrectionProposal,
  executeSemanticCorrectionAttempt
} from '../src-js/semantic-correction.js';

// --- the real substrate (the correction.test.mjs dSubstrate posture) ----------
import { TransactionBuilder, TransactionExecutor, HistoryManager, EventBus } from '../src-js/transaction.js';
import { ToolRegistry, registerCoreTools } from '../src-js/tools.js';
import { ObjectStore, GeometryStore, AppearanceStore } from '../src-js/stores.js';
import { SceneGraph } from '../src-js/scenegraph.js';

// --- E-local hash helpers (house algorithm verbatim, for C-2's independent
//     recomputation of the content-derived transaction id) ---------------------
function eStableStringify(value){
  if (Array.isArray(value)) return `[${value.map(eStableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object'){
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${eStableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function eFnv1a32(str){
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
function eContentId(prefix, content){ return prefix + eFnv1a32(eStableStringify(content)); }

// --- E fixtures ----------------------------------------------------------------
// The C6 golden-scenario rect: (100,100) 200x100 -> world area 20000, center
// (200,150). UUID ids: the REAL stores (stores.js) enforce UUID formats.
const GOLDEN_OID = '11111111-1111-4111-8111-111111111111';
const GOLDEN_GEOM_ID = '33333333-3333-4333-8333-333333333333';
const GOLDEN_APP_ID = '44444444-4444-4444-8444-444444444444';
const GOLDEN_RECT_PARAMS = { x: 100, y: 100, width: 200, height: 100, rx: 0, ry: 0 };

// The C6 golden SemanticCorrectionTarget stand-in (confidence/evidence are the
// C6 worked-example values — the D-approved A-16 anchor chain).
function makeGoldenTarget(overrides = {}){
  return {
    id: 'sct-86f52be0',
    objectId: GOLDEN_OID,
    currentRole: 'shape',
    targetRole: 'background',
    confidence: 0.696,
    evidence: [],
    source: 'dev-8305da82',
    ...overrides,
  };
}
// The caller-supplied facts, now WITH the host-provided world center (the
// Checkpoint E objectFacts extension: center is optional; absent -> the
// documented fixed fallback applies inside the builder).
function makeGoldenFacts(overrides = {}){
  return { geometryType: 'rect', childCount: 0, worldArea: 20000, center: { x: 200, y: 150 }, ...overrides };
}
function goldenCapability(){ return SEMANTIC_CORRECTION_CAPABILITIES[0]; }

function makeGoldenProposal(overrides = {}){
  return buildSemanticCorrectionProposal(
    overrides.target !== undefined ? overrides.target : makeGoldenTarget(),
    overrides.capability !== undefined ? overrides.capability : goldenCapability(),
    overrides.facts !== undefined ? overrides.facts : makeGoldenFacts()
  );
}

// A real-substrate fixture (the correction.test.mjs dSubstrate shape, with the
// REAL stores/SceneGraph/executor): one golden rect document, core tools
// registered, TransactionExecutor over {objectStore, geometryStore,
// appearanceStore, sceneGraph} + EventBus + HistoryManager.
function makeSubstrate(){
  const geometryStore = new GeometryStore();
  const appearanceStore = new AppearanceStore();
  const objectStore = new ObjectStore({ hasGeometry: id => geometryStore.has(id), hasAppearance: id => appearanceStore.has(id) });
  const sceneGraph = new SceneGraph();
  const eventBus = new EventBus();
  const historyManager = new HistoryManager();
  const transactionManager = new TransactionExecutor({ objectStore, geometryStore, appearanceStore, sceneGraph }, eventBus, historyManager);
  const registry = new ToolRegistry();
  registerCoreTools(registry);
  const transactionBuilder = new TransactionBuilder();
  geometryStore.create(GOLDEN_GEOM_ID, JSON.parse(JSON.stringify({ type: 'rect', params: GOLDEN_RECT_PARAMS })));
  appearanceStore.create({ id: GOLDEN_APP_ID, stack: [] });
  objectStore.create({ id: GOLDEN_OID, geometryRef: GOLDEN_GEOM_ID, appearanceRef: GOLDEN_APP_ID, meta: { name: 'golden-rect', locked: false, visible: true, selectable: true } });
  const root = sceneGraph.createRoot();
  sceneGraph.createNode(GOLDEN_OID, root.id);
  return {
    objectStore, geometryStore, appearanceStore, sceneGraph, eventBus, historyManager, transactionManager, registry, transactionBuilder,
    substrate: { registry, transactionManager, transactionBuilder, sceneGraph },
  };
}

// ---- B-1 --------------------------------------------------------------------
test('B-1: buildSemanticCorrectionProposal returns a frozen proposal with exactly the C4 keys', ()=>{
  const p = makeGoldenProposal();
  deepEq(Object.keys(p).sort(), ['capabilityId', 'confidence', 'expectedSemanticEffect', 'id', 'mutation', 'objectIds', 'provenance', 'targetId'], 'exactly the eight C4 keys');
  deepFrozen(p, 'proposal');
  eq(p.targetId, 'sct-86f52be0', 'targetId mirrored from the target');
  eq(p.capabilityId, 'cap-shape-background', 'capabilityId from the registry capability');
  eq(typeof p.mutation, 'object', 'mutation present');
  deepEq(Object.keys(p.mutation).sort(), ['input', 'kind', 'toolId'], 'mutation keys');
  deepEq(Object.keys(p.provenance).sort(), ['deviationId', 'evidence', 'expectationRecordId', 'source'], 'provenance keys');
  deepEq(Object.keys(p.expectedSemanticEffect).sort(), ['predictedWorldArea', 'role'], 'expectedSemanticEffect keys');
});

// ---- B-2 --------------------------------------------------------------------
test("B-2: id is 'scp-<8hex>' and matches the C6 golden value scp-f09b1135 for the golden input", ()=>{
  const p = makeGoldenProposal();
  expect(/^scp-[0-9a-f]{8}$/.test(p.id), `id format: ${p.id}`);
  eq(p.id, 'scp-f09b1135', 'the C6 golden chain anchor (dev-8305da82 -> sct-86f52be0 -> scp-f09b1135)');
});

// ---- B-3 --------------------------------------------------------------------
test("B-3: mutation.kind === 'transform', toolId === 'T06', uniform-scale form (b===0, c===0, a===d)", ()=>{
  const p = makeGoldenProposal();
  eq(p.mutation.kind, 'transform', 'kind');
  eq(p.mutation.toolId, 'T06', 'toolId');
  const t = p.mutation.input.transform;
  eq(t.b, 0, 'b is exactly 0 (no shear)');
  eq(t.c, 0, 'c is exactly 0 (no shear)');
  eq(t.a, t.d, 'a === d (uniform scale)');
  expect(Number.isFinite(t.a) && t.a > 0, `scale finite positive: ${t.a}`);
  deepEq(Object.keys(t).sort(), ['a', 'b', 'c', 'd', 'tx', 'ty'], 'all six matrix keys');
});

// ---- B-4 --------------------------------------------------------------------
test('B-4: mutation.input.objectIds === [target.objectId]', ()=>{
  const p = makeGoldenProposal();
  deepEq(p.mutation.input.objectIds, [GOLDEN_OID], 'exactly the target object');
  deepEq(p.objectIds, [GOLDEN_OID], 'proposal.objectIds agrees');
  eq(p.mutation.input.objectIds.length, 1, 'single-object mutation surface (scope LOCAL)');
});

// ---- B-5 --------------------------------------------------------------------
test("B-5: expectedSemanticEffect.role.from === 'shape', .toward === 'background', predictedWorldArea strictly beyond threshold", ()=>{
  const p = makeGoldenProposal();
  eq(p.expectedSemanticEffect.role.from, 'shape', 'from');
  eq(p.expectedSemanticEffect.role.toward, 'background', 'toward');
  eq(p.expectedSemanticEffect.predictedWorldArea, 105000, 'the C6 predicted area (exactly)');
  expect(p.expectedSemanticEffect.predictedWorldArea > 100000, 'strictly beyond areaGrowThreshold');
});

// ---- B-6 --------------------------------------------------------------------
test('B-6: predictedWorldArea > areaGrowThreshold with margin 0.05 (grow)', ()=>{
  const cap = goldenCapability();
  eq(cap.preconditions.areaMargin, 0.05, 'the C9 #5 margin constant');
  // The builder's own arithmetic: s = sqrt((threshold*(1+margin))/worldArea),
  // predicted = worldArea * s^2 — recomputed independently here.
  const s = Math.sqrt((cap.preconditions.areaGrowThreshold * (1 + cap.preconditions.areaMargin)) / 20000);
  eq(makeGoldenProposal().expectedSemanticEffect.predictedWorldArea, 20000 * (s * s), 'predicted == worldArea * (s * s) (the prompt step-5 formula, parentheses pinned)');
  expect(20000 * (s * s) > cap.preconditions.areaGrowThreshold, 'strictly beyond the 100000 threshold');
});

// ---- B-7 --------------------------------------------------------------------
test('B-7: shrink direction — predictedWorldArea < areaShrinkThreshold with margin (background -> shape)', ()=>{
  const p = makeGoldenProposal({
    target: makeGoldenTarget({ id: 'sct-1a2b3c4d', currentRole: 'background', targetRole: 'shape', source: 'smr-1a2b3c4d' }),
    facts: makeGoldenFacts({ worldArea: 200000 }),
  });
  eq(p.expectedSemanticEffect.role.from, 'background', 'from');
  eq(p.expectedSemanticEffect.role.toward, 'shape', 'toward');
  expect(p.expectedSemanticEffect.predictedWorldArea < 5000, `strictly below areaShrinkThreshold: ${p.expectedSemanticEffect.predictedWorldArea}`);
  eq(p.mutation.input.transform.a, p.mutation.input.transform.d, 'uniform downscale');
  expect(p.mutation.input.transform.a < 1, `s < 1 for shrink: ${p.mutation.input.transform.a}`);
});

// ---- B-8 --------------------------------------------------------------------
test('B-8: confidence copied from target, never synthesized', ()=>{
  eq(makeGoldenProposal().confidence, 0.696, 'verbatim numeric copy');
  eq(makeGoldenProposal({ target: makeGoldenTarget({ confidence: null }) }).confidence, null, 'verbatim null copy — never defaulted');
});

// ---- B-9 --------------------------------------------------------------------
test("B-9: provenance.source === 'semantic-correction', deviationId matches target.source (+ the smr- host-path mirror)", ()=>{
  const p = makeGoldenProposal();
  eq(p.provenance.source, 'semantic-correction', 'the constant source');
  eq(p.provenance.deviationId, 'dev-8305da82', "engine path: target.source prefixed 'dev-' lands in deviationId");
  eq(p.provenance.expectationRecordId, null, 'engine path: expectationRecordId null');
  deepEq(p.provenance.evidence, [], 'evidence frozen clone');
  const host = makeGoldenProposal({ target: makeGoldenTarget({ source: 'smr-4a4b4c4d' }) });
  eq(host.provenance.deviationId, null, 'host path: deviationId null');
  eq(host.provenance.expectationRecordId, 'smr-4a4b4c4d', 'host path: smr- source lands in expectationRecordId');
});

// ---- B-10 -------------------------------------------------------------------
test('B-10: strict-crossing refusal — a handed proposal whose prediction lands inside the threshold is refused with PREDICTED_AREA_INSIDE_THRESHOLD', ()=>{
  // C8 row (c): "If a constructed proposal's prediction does not strictly
  // cross: proposal-construction breach — the constructor refuses". The house
  // builder ANCHORS its own prediction at threshold*(1±margin) (5% buffer vs
  // ~1-ulp FP noise — unrepresentable by construction, C8 row (d) wording), so
  // the refusal is exercised through the layer that ACCEPTS handed proposals
  // (executeSemanticCorrectionAttempt validates the proposal record before any
  // transaction), mirroring B-11's defense-in-depth posture.
  const valid = makeGoldenProposal();
  eq(valid.expectedSemanticEffect.predictedWorldArea > 100000, true, 'control: the house proposal strictly crosses');
  const foreign = JSON.parse(JSON.stringify(valid));
  foreign.expectedSemanticEffect.predictedWorldArea = 99999; // < 100000, grow direction
  let threw = null;
  try { executeSemanticCorrectionAttempt(foreign, makeSubstrate().substrate); } catch (e){ threw = e; }
  expect(threw, 'refused');
  expect(threw instanceof SemanticCorrectionError, 'SemanticCorrectionError instance');
  eq(threw.code, 'PREDICTED_AREA_INSIDE_THRESHOLD', 'the C8 machine reason');
  const foreignShrink = JSON.parse(JSON.stringify(makeGoldenProposal({
    target: makeGoldenTarget({ currentRole: 'background', targetRole: 'shape', source: 'smr-1a2b3c4d' }),
    facts: makeGoldenFacts({ worldArea: 200000 }),
  })));
  foreignShrink.expectedSemanticEffect.predictedWorldArea = 5000; // NOT < 5000 (strict)
  let threwShrink = null;
  try { executeSemanticCorrectionAttempt(foreignShrink, makeSubstrate().substrate); } catch (e){ threwShrink = e; }
  expect(threwShrink, 'shrink direction refused too');
  eq(threwShrink.code, 'PREDICTED_AREA_INSIDE_THRESHOLD', 'shrink machine reason');
});

// ---- B-11 -------------------------------------------------------------------
test('B-11: non-uniform matrix refusal — a foreign descriptor with b!=0/c!=0/a!=d is refused with NON_UNIFORM_SCALE_REJECTED (T06 validator alone would accept it)', ()=>{
  const foreign = JSON.parse(JSON.stringify(makeGoldenProposal()));
  foreign.mutation.input.transform = { a: 2, b: 1, c: 0, d: 2, tx: 0, ty: 0 }; // shear, det 3
  // Defense-in-depth proof, C8 row (d): T06's own validator accepts ANY
  // |det| >= 1e-12 — shears included — so the 3.18 layer MUST refuse it.
  const t06check = makeSubstrate().registry.validate('T06', { objectIds: [GOLDEN_OID], transform: foreign.mutation.input.transform }, {});
  eq(t06check.valid, true, 'T06 validator alone would accept the shear (the C8 premise)');
  let threw = null;
  try { executeSemanticCorrectionAttempt(foreign, makeSubstrate().substrate); } catch (e){ threw = e; }
  expect(threw, 'refused');
  expect(threw instanceof SemanticCorrectionError, 'SemanticCorrectionError instance');
  eq(threw.code, 'NON_UNIFORM_SCALE_REJECTED', 'the C8 machine reason');
  for (const t of [{ a: 2, b: 0, c: 1, d: 2, tx: 0, ty: 0 }, { a: 2, b: 0, c: 0, d: 3, tx: 0, ty: 0 }] ){
    const f2 = JSON.parse(JSON.stringify(makeGoldenProposal()));
    f2.mutation.input.transform = t;
    let e2 = null;
    try { executeSemanticCorrectionAttempt(f2, makeSubstrate().substrate); } catch (e){ e2 = e; }
    expect(e2 && e2.code === 'NON_UNIFORM_SCALE_REJECTED', `c!=0 / a!=d refused: ${JSON.stringify(t)}`);
  }
});

// ---- B-12 -------------------------------------------------------------------
test('B-12: determinism — same input twice -> byte-identical proposal', ()=>{
  const a = makeGoldenProposal();
  const b = makeGoldenProposal({ facts: makeGoldenFacts() }); // fresh facts object, same content
  eq(JSON.stringify(a), JSON.stringify(b), 'byte-identical (fresh facts, no aliasing)');
  const c = makeGoldenProposal({ target: makeGoldenTarget() });
  eq(JSON.stringify(a), JSON.stringify(c), 'byte-identical (fresh target)');
  // Aliasing discipline: mutating the caller's facts afterwards must not move
  // the frozen proposal (center cloned, not aliased).
  const facts = makeGoldenFacts();
  const d = makeGoldenProposal({ facts });
  facts.center.x = 999999;
  eq(d.mutation.input.transform.tx, a.mutation.input.transform.tx, 'center cloned at construction (no alias)');
});

// ---- C-1 --------------------------------------------------------------------
test('C-1: executeSemanticCorrectionAttempt opens EXACTLY ONE transaction', ()=>{
  const fx = makeSubstrate();
  const calls = [];
  const realExecute = fx.transactionManager.execute.bind(fx.transactionManager);
  fx.substrate.transactionManager = { ...fx.transactionManager, execute: tx => { calls.push(tx.id); return realExecute(tx); } };
  const p = makeGoldenProposal();
  const r = executeSemanticCorrectionAttempt(p, fx.substrate);
  eq(r.status, 'EXECUTED', 'committed');
  eq(calls.length, 1, 'exactly one execute call — ONE transaction per attempt (spec §31)');
  const commits = fx.eventBus.getHistory().filter(e => e.type === 'TransactionCommitted');
  eq(commits.length, 1, 'exactly one TransactionCommitted event');
});

// ---- C-2 --------------------------------------------------------------------
test("C-2: transaction id starts with 'atx-' and is content-derived", ()=>{
  const fx = makeSubstrate();
  const p = makeGoldenProposal();
  const r = executeSemanticCorrectionAttempt(p, fx.substrate);
  expect(/^atx-[0-9a-f]{8}$/.test(r.transactionId), `atx- format: ${r.transactionId}`);
  // Independent recomputation over the pinned input set {proposalId,
  // capabilityId, iteration: 1} (the Checkpoint E prompt, Part 2 step 3).
  const expected = eContentId('atx-', { proposalId: p.id, capabilityId: p.capabilityId, iteration: 1 });
  eq(r.transactionId, expected, 'content-derived from the proposal identity (no RNG)');
});

// ---- C-3 --------------------------------------------------------------------
test("C-3: T06 is fetched from the substrate registry (spy on registry.get)", ()=>{
  const fx = makeSubstrate();
  const getCalls = [];
  // Explicit delegation (a spread of the class instance would drop prototype
  // methods); the spy counts while the REAL registry answers.
  fx.substrate.registry = {
    has: id => fx.registry.has(id),
    get: id => { getCalls.push(id); return fx.registry.get(id); },
    validate: (tid, input, ctx) => fx.registry.validate(tid, input, ctx),
  };
  const r = executeSemanticCorrectionAttempt(makeGoldenProposal(), fx.substrate);
  eq(r.status, 'EXECUTED', 'committed');
  deepEq(getCalls, ['T06'], 'exactly one registry.get, for T06 (the command binds the LIVE tool)');
});

// ---- C-4 --------------------------------------------------------------------
test('C-4: store mutation is committed (real geometry change verified via the read surface)', ()=>{
  const fx = makeSubstrate();
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width, 200, 'pre-state');
  const r = executeSemanticCorrectionAttempt(makeGoldenProposal(), fx.substrate);
  eq(r.status, 'EXECUTED', 'committed');
  const after = fx.geometryStore.get(GOLDEN_GEOM_ID).params;
  eq(after.width, 458.257569495584, 'width scaled by s (the C6 post rect)');
  eq(after.height, 229.128784747792, 'height scaled by s');
  eq(after.x, -29.128784747791997, 'x re-fit (center preserved)');
  eq(after.y, 35.435607626104, 'y re-fit (center preserved)');
  eq(after.width * after.height, 105000, 'post area (exactly)');
});

// ---- C-5 --------------------------------------------------------------------
test('C-5: on registry miss (T06 unregistered) -> FAILED with TOOLS_UNAVAILABLE; stores untouched', ()=>{
  const fx = makeSubstrate();
  const emptyRegistry = new ToolRegistry(); // no core tools at all
  fx.substrate.registry = emptyRegistry;
  const r = executeSemanticCorrectionAttempt(makeGoldenProposal(), fx.substrate);
  eq(r.status, 'FAILED', 'refused');
  eq(r.error.code, 'TOOLS_UNAVAILABLE', 'the prompt Part-2 preflight code');
  eq(r.transactionId, null, 'no transaction was ever built (preflight refusal)');
  eq(r.inverseKind, null, 'no inverse');
  eq(r.diffCounts, null, 'no diff');
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width, 200, 'stores untouched');
  eq(fx.historyManager.size(), 0, 'history untouched');
  eq(fx.eventBus.getHistory().filter(e => e.type === 'TransactionCommitted').length, 0, 'no commit event');
});

// ---- C-6 --------------------------------------------------------------------
test('C-6: on tool validation failure -> FAILED; stores untouched (atomic)', ()=>{
  const fx = makeSubstrate();
  const MISSING = '99999999-9999-4999-8999-999999999999';
  const p = makeGoldenProposal({ target: makeGoldenTarget({ objectId: MISSING, id: 'sct-9a9b9c9d', source: 'dev-9a9b9c9d' }) });
  const r = executeSemanticCorrectionAttempt(p, fx.substrate);
  eq(r.status, 'FAILED', 'the attempt failed honestly');
  eq(r.error.code, 'EXECUTION_ERROR', 'house failure envelope (correction.js:2553 pattern)');
  expect(r.error.message.includes('Object not found'), `T06's precondition error surfaced: ${r.error.message}`);
  expect(/^atx-[0-9a-f]{8}$/.test(r.transactionId), 'the attempt transaction id is still the derived one');
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width, 200, 'golden geometry untouched (atomic per substrate)');
  eq(fx.historyManager.size(), 0, 'nothing pushed (invariant 13)');
  eq(fx.eventBus.getHistory().filter(e => e.type === 'TransactionCommitted').length, 0, 'no commit event (invariant 16)');
});

// ---- C-7 --------------------------------------------------------------------
test("C-7: inverseKind === 'snapshot' (T06 has no command inverse)", ()=>{
  const fx = makeSubstrate();
  const r = executeSemanticCorrectionAttempt(makeGoldenProposal(), fx.substrate);
  eq(r.status, 'EXECUTED', 'committed');
  eq(r.inverseKind, 'snapshot', 'B8: the snapshot inverse path (no command inverse declared)');
});

// ---- C-8 --------------------------------------------------------------------
test('C-8: history grows by exactly 1 (linear, invariant 13)', ()=>{
  const fx = makeSubstrate();
  eq(fx.historyManager.size(), 0, 'empty before');
  const r = executeSemanticCorrectionAttempt(makeGoldenProposal(), fx.substrate);
  eq(r.status, 'EXECUTED', 'committed');
  eq(fx.historyManager.size(), 1, 'exactly one entry pushed');
  eq(fx.historyManager.current().id, r.transactionId, 'the committed transaction IS the history entry');
});

// ---- C-9 --------------------------------------------------------------------
test('C-9: TransactionCommitted fires AFTER commit (event order, invariant 16)', ()=>{
  const fx = makeSubstrate();
  let widthAtEventTime = null;
  let eventTxId = null;
  let eventSource = null;
  fx.eventBus.subscribe('TransactionCommitted', e => {
    widthAtEventTime = fx.geometryStore.get(GOLDEN_GEOM_ID).params.width; // the store read AT event time
    eventTxId = e.transactionId;
    eventSource = e.source;
  });
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width, 200, 'pre-state');
  const r = executeSemanticCorrectionAttempt(makeGoldenProposal(), fx.substrate);
  eq(r.status, 'EXECUTED', 'committed');
  eq(widthAtEventTime, 458.257569495584, 'at event-fire time the store ALREADY carries the committed value (publish after commit)');
  expect(widthAtEventTime !== 200, 'the event did not fire before the mutation');
  eq(eventTxId, r.transactionId, 'the event names the committed transaction');
  eq(eventSource, 'correction', "the attempt's source marker");
});

// ---- C-10 -------------------------------------------------------------------
test('C-10: determinism — same proposal + fresh substrate -> byte-identical result record (transactionId included)', ()=>{
  const p = makeGoldenProposal();
  const a = executeSemanticCorrectionAttempt(p, makeSubstrate().substrate);
  const b = executeSemanticCorrectionAttempt(p, makeSubstrate().substrate);
  eq(a.status, 'EXECUTED', 'first committed');
  eq(b.status, 'EXECUTED', 'second committed');
  eq(JSON.stringify(a), JSON.stringify(b), 'byte-identical result records — no RNG, no wall clock in the record');
  eq(a.transactionId, b.transactionId, 'the content-derived transaction id is stable across substrates');
  deepEq(a.diffCounts, b.diffCounts, 'same diff shape');
});

// ---- D-1 --------------------------------------------------------------------
test("D-1: full chain — real document -> real T20 -> diagnose CORRECTABLE -> proposal -> execute -> commit -> real T20 re-derivation flips role to 'background'", ()=>{
  const fx = makeSubstrate();
  // 1. real T20 over the real document (proposal category -> direct tool path)
  const t20 = fx.registry.execute('T20', { objectIds: [GOLDEN_OID] }, { objectStore: fx.objectStore, geometryStore: fx.geometryStore, appearanceStore: fx.appearanceStore, sceneGraph: fx.sceneGraph });
  eq(t20.success, true, 'T20 ran');
  const record = t20.output.proposals[0];
  eq(record.proposedRole, 'shape', 'pre-correction role (area 20000)');
  // 2. the §13 deviation (C6 content — engine path) + the D diagnosis
  const deviation = {
    id: eContentId('dev-', {
      category: 'semantic', property: 'role', expected: 'background', actual: 'shape',
      delta: null, tolerance: null, severity: 'error', objectId: GOLDEN_OID, targetRef: '$doc:' + GOLDEN_OID,
      message: `semantic role expectation violated: object '${GOLDEN_OID}' expected role 'background', observed role 'shape'`,
    }),
    category: 'semantic', property: 'role', expected: 'background', actual: 'shape',
    delta: null, tolerance: null, severity: 'error', objectId: GOLDEN_OID, targetRef: '$doc:' + GOLDEN_OID,
    message: `semantic role expectation violated: object '${GOLDEN_OID}' expected role 'background', observed role 'shape'`,
  };
  eq(deviation.id, 'dev-8305da82', 'the house dev- id (the C6 anchor)');
  const facts = {
    geometryType: fx.geometryStore.get(GOLDEN_GEOM_ID).type,
    childCount: fx.sceneGraph.findNodeByObjectId(GOLDEN_OID).children.length,
    worldArea: 200 * 100,
  };
  const diagnosis = diagnoseSemanticDeviation(deviation, facts);
  eq(diagnosis.status, 'CORRECTABLE', 'the D selector authorizes the correction');
  eq(diagnosis.targetId, 'sct-86f52be0', 'the golden target id');
  // 3. the target (confidence/evidence VERBATIM from the real T20 record)
  const target = {
    id: diagnosis.targetId,
    objectId: GOLDEN_OID,
    currentRole: 'shape',
    targetRole: 'background',
    confidence: record.confidence,
    evidence: record.evidence,
    source: deviation.id,
  };
  // 4. the proposal (host reads the world center from the document)
  const geom = fx.geometryStore.get(GOLDEN_GEOM_ID).params;
  const proposal = buildSemanticCorrectionProposal(target, goldenCapability(), {
    geometryType: facts.geometryType, childCount: facts.childCount, worldArea: facts.worldArea,
    center: { x: geom.x + geom.width / 2, y: geom.y + geom.height / 2 },
  });
  eq(proposal.confidence, record.confidence, 'confidence verbatim from the real record (never synthesized)');
  eq(proposal.capabilityId, 'cap-shape-background', 'grounded in the ONE capability');
  // 5. execute + commit
  const r = executeSemanticCorrectionAttempt(proposal, fx.substrate);
  eq(r.status, 'EXECUTED', 'committed');
  eq(r.inverseKind, 'snapshot', 'snapshot inverse');
  eq(r.diffCounts.modified, 1, 'exactly the geometry row modified');
  // 6. re-run real T20 — the role re-derivation FLIPPED
  const t20b = fx.registry.execute('T20', { objectIds: [GOLDEN_OID] }, { objectStore: fx.objectStore, geometryStore: fx.geometryStore, appearanceStore: fx.appearanceStore, sceneGraph: fx.sceneGraph });
  eq(t20b.output.proposals[0].proposedRole, 'background', 'post-correction role (area 105000)');
});

// ---- D-2 --------------------------------------------------------------------
test('D-2: post-mutation verification — the re-derived role after commit matches the proposal expected role.toward', ()=>{
  const fx = makeSubstrate();
  const t20 = fx.registry.execute('T20', { objectIds: [GOLDEN_OID] }, { objectStore: fx.objectStore, geometryStore: fx.geometryStore, appearanceStore: fx.appearanceStore, sceneGraph: fx.sceneGraph });
  const record = t20.output.proposals[0];
  eq(record.proposedRole, 'shape', 'pre role');
  const proposal = buildSemanticCorrectionProposal(
    { id: 'sct-86f52be0', objectId: GOLDEN_OID, currentRole: record.proposedRole, targetRole: 'background', confidence: record.confidence, evidence: record.evidence, source: 'dev-8305da82' },
    goldenCapability(),
    makeGoldenFacts()
  );
  eq(proposal.expectedSemanticEffect.role.from, 'shape', 'expected from');
  eq(proposal.expectedSemanticEffect.role.toward, 'background', 'expected toward');
  const r = executeSemanticCorrectionAttempt(proposal, fx.substrate);
  eq(r.status, 'EXECUTED', 'committed');
  const rederived = fx.registry.execute('T20', { objectIds: [GOLDEN_OID] }, { objectStore: fx.objectStore, geometryStore: fx.geometryStore, appearanceStore: fx.appearanceStore, sceneGraph: fx.sceneGraph }).output.proposals[0].proposedRole;
  eq(rederived, proposal.expectedSemanticEffect.role.toward, 'B9: verification is post-commit re-derivation, and it agrees');
  expect(rederived !== proposal.expectedSemanticEffect.role.from, 'the role actually moved');
});

// ---- D-3 --------------------------------------------------------------------
test('D-3: rollback works — the snapshot inverse undo restores the stores', ()=>{
  const fx = makeSubstrate();
  const pre = fx.geometryStore.get(GOLDEN_GEOM_ID).params;
  const r = executeSemanticCorrectionAttempt(makeGoldenProposal(), fx.substrate);
  eq(r.status, 'EXECUTED', 'committed');
  eq(r.inverseKind, 'snapshot', 'snapshot inverse available');
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width, 458.257569495584, 'mutated');
  fx.transactionManager.undo(); // the substrate's OWN undo API (§32) over the snapshot inverse
  const restored = fx.geometryStore.get(GOLDEN_GEOM_ID).params;
  deepEq(restored, pre, 'stores restored byte-for-byte from the pre-transaction snapshot');
  eq(fx.historyManager.canUndo(), false, 'history back at the root (linear, invariant 13)');
});

// ---- D-4 --------------------------------------------------------------------
test('D-4: golden chain reproduces the C6 values end-to-end — dev-8305da82 -> sct-86f52be0 -> scp-f09b1135, post-area === 105000', ()=>{
  const fx = makeSubstrate();
  const p = makeGoldenProposal(); // the C6 golden target + facts (confidence 0.696, evidence [], center (200,150))
  eq(p.id, 'scp-f09b1135', 'the C6 proposal id (B-2 anchor, byte-for-byte)');
  const r = executeSemanticCorrectionAttempt(p, fx.substrate);
  eq(r.status, 'EXECUTED', 'the golden proposal executes');
  eq(r.transactionId, eContentId('atx-', { proposalId: p.id, capabilityId: p.capabilityId, iteration: 1 }), 'content-derived attempt id');
  const after = fx.geometryStore.get(GOLDEN_GEOM_ID).params;
  eq(after.x, -29.128784747791997, 'post rect x (C6 #4)');
  eq(after.y, 35.435607626104, 'post rect y');
  eq(after.width, 458.257569495584, 'post rect width');
  eq(after.height, 229.128784747792, 'post rect height');
  eq(after.width * after.height, 105000, 'post-area === 105000 (exactly, the C6 value)');
});

// ============================================================================
// PHASE 3.18 CHECKPOINT F — VERIFICATION PATH + SEMANTIC ROLE PROVIDER (§109)
// ============================================================================
// Appended AFTER the A/B/C/D categories per the Checkpoint F prompt ("ADD new
// test categories AFTER the existing A/B/C/D tests (do NOT modify A/B/C/D
// tests)"). The A/B/C/D bodies above are byte-identical to the approved
// Checkpoint E file; this section adds its own import declarations (legal
// hoisted ESM — the module link fails RED until src-js/semantic-correction.js
// exports the two new names, which IS the honest RED for an extended module
// surface).
//
// CATEGORY E (12 tests) — verifySemanticCorrectionAttempt:
//   E-1  frozen VerificationResult with exactly the declared keys
//   E-2  golden chain SATISFIED — scp-f09b1135 executed -> actualRole
//        'background' (the B9 contract: REAL T20 re-inference, post-commit)
//   E-3  VIOLATED — an EXECUTED attempt verified against an unmutated
//        document -> VIOLATED / ROLE_MISMATCH
//   E-4  UNVERIFIABLE / T20_UNAVAILABLE — registry without T20
//   E-5  UNVERIFIABLE / T20_NO_PROPOSAL (object missing) + T20_REFUSED
//        (the normalizer's contract refuses a malformed / out-of-vocabulary
//        proposal)
//   E-6  FAILED attempt cannot verify -> INVALID_ATTEMPT
//   E-7  confidence + evidence copied verbatim from the normalized record
//        (never synthesized; verbatim-or-null)
//   E-8  actualRole ALWAYS read from post-commit state — a second mutation
//        between execute and verify flips the verification (no snapshot)
//   E-9  no false verification — an unreachable targetRole never SATISFIED
//   E-10 determinism — same state + same target + same substrate ->
//        byte-identical VerificationResult
//   E-11 architecture scan — the verification/provider region: no role-write
//        surface, no direct store writes, T20 reached ONLY via registry.get
//   E-12 provider shape — createSemanticRoleProvider returns a function; the
//        correct role for a known object; null when T20 unavailable
//
// CATEGORY F (4 tests) — createSemanticRoleProvider (the DD-1 bridge):
//   F-1  provider injected as evaluationContext.getActualRole -> the semantic
//        arm reaches SATISFIED against a real document
//   F-2  unknown object -> null (the honest signal, never a fabricated role)
//   F-3  no caching — the document mutated between calls changes the role
//   F-4  the DD-1 contract exactly: (objectId) => role string | null, never
//        throws
// ============================================================================

// --- the two new exports (RED until the module provides them) -----------------
import {
  verifySemanticCorrectionAttempt,
  createSemanticRoleProvider
} from '../src-js/semantic-correction.js';

// --- F-1 needs the real evaluation entry (the 3.17 Category P posture) --------
import { evaluate } from '../src-js/evaluation.js';

// --- F-local fixtures ----------------------------------------------------------
// The verification substrate: the E execution substrate PLUS the committed-state
// read surface T20 needs (tools.js getGeomOf :144-150 reads objectStore/
// geometryStore; the appearance read :979-981; sceneGraph for node/bbox
// context). The execution keys (transactionBuilder/transactionManager) are NOT
// required — verification runs no transaction.
function verifySubstrate(fx){
  return {
    registry: fx.registry,
    objectStore: fx.objectStore,
    geometryStore: fx.geometryStore,
    appearanceStore: fx.appearanceStore,
    sceneGraph: fx.sceneGraph,
  };
}
// The T20 tool context for the tests' own independent re-derivation (the D-1
// posture: registry.execute over the committed stores — no workingCopy).
function t20Context(fx){
  return { objectStore: fx.objectStore, geometryStore: fx.geometryStore, appearanceStore: fx.appearanceStore, sceneGraph: fx.sceneGraph };
}
// Golden-chain helper: the golden proposal, executed and committed, plus the
// golden target that names the expectation.
function runGoldenAttempt(){
  const fx = makeSubstrate();
  const proposal = makeGoldenProposal();
  const attempt = executeSemanticCorrectionAttempt(proposal, fx.substrate);
  return { fx, proposal, attempt, target: makeGoldenTarget() };
}

// ---- E-1 --------------------------------------------------------------------
test('E-1: verifySemanticCorrectionAttempt returns a frozen VerificationResult with exactly the declared keys', ()=>{
  const { fx, proposal, attempt, target } = runGoldenAttempt();
  eq(attempt.status, 'EXECUTED', 'the golden attempt committed (control)');
  const v = verifySemanticCorrectionAttempt(attempt, proposal, target, verifySubstrate(fx));
  deepEq(Object.keys(v).sort(), ['actualRole', 'confidence', 'evidence', 'reason', 'status', 'targetRole'], 'exactly the six declared keys');
  deepFrozen(v, 'VerificationResult');
});

// ---- E-2 --------------------------------------------------------------------
test("E-2: golden chain SATISFIED — after executing scp-f09b1135 with the golden substrate, verification returns SATISFIED, actualRole 'background'", ()=>{
  const { fx, proposal, attempt, target } = runGoldenAttempt();
  eq(proposal.id, 'scp-f09b1135', 'the golden proposal (the C6 chain anchor)');
  const v = verifySemanticCorrectionAttempt(attempt, proposal, target, verifySubstrate(fx));
  eq(v.status, 'SATISFIED', 'the post-commit re-derivation agrees with the target (B9: REAL T20)');
  eq(v.actualRole, 'background', 'the re-derived role');
  eq(v.targetRole, 'background', 'the expected role carried');
  eq(v.reason, null, 'reason null on the measured pair (the compared-pair convention)');
});

// ---- E-3 --------------------------------------------------------------------
test("E-3: VIOLATED — an EXECUTED attempt verified against a document where the object was never mutated returns VIOLATED, reason ROLE_MISMATCH", ()=>{
  const executed = runGoldenAttempt();
  const fresh = makeSubstrate(); // same golden object id, NEVER mutated
  const v = verifySemanticCorrectionAttempt(executed.attempt, executed.proposal, executed.target, verifySubstrate(fresh));
  eq(v.status, 'VIOLATED', "the fresh document still derives 'shape' — no false SATISFIED");
  eq(v.reason, 'ROLE_MISMATCH', 'the mismatch machine reason');
  eq(v.actualRole, 'shape', 'the honest actual role from the live document');
  eq(v.targetRole, 'background', 'the expectation unchanged');
});

// ---- E-4 --------------------------------------------------------------------
test("E-4: UNVERIFIABLE / T20_UNAVAILABLE — a substrate whose registry lacks T20 returns UNVERIFIABLE with reason T20_UNAVAILABLE", ()=>{
  const { fx, proposal, attempt, target } = runGoldenAttempt();
  const bare = verifySubstrate(fx);
  bare.registry = new ToolRegistry(); // no tools at all — T20 missing
  const v = verifySemanticCorrectionAttempt(attempt, proposal, target, bare);
  eq(v.status, 'UNVERIFIABLE', 'honest UNVERIFIABLE (spec §40: no false verification)');
  eq(v.reason, 'T20_UNAVAILABLE', 'the preflight machine reason');
  eq(v.actualRole, null, 'no role invented');
  eq(v.evidence, null, 'no evidence invented');
  eq(v.confidence, null, 'no confidence invented');
  eq(v.targetRole, 'background', 'the expectation is still carried');
});

// ---- E-5 --------------------------------------------------------------------
test("E-5: UNVERIFIABLE / T20_NO_PROPOSAL — T20 refuses for a missing object; T20_REFUSED — the normalizer's contract refuses a malformed / out-of-vocabulary proposal", ()=>{
  const { fx, proposal, attempt } = runGoldenAttempt();
  // (a) the verification target names an object the document does not have:
  //     T20's own validate (validateObjectsExist, tools.js:179-186) refuses ->
  //     no proposal for the target object.
  const missing = makeGoldenTarget({ objectId: '88888888-8888-4888-8888-888888888888' });
  const v = verifySemanticCorrectionAttempt(attempt, proposal, missing, verifySubstrate(fx));
  eq(v.status, 'UNVERIFIABLE', 'honest UNVERIFIABLE');
  eq(v.reason, 'T20_NO_PROPOSAL', 'T20 produced no proposal for the target object');
  eq(v.actualRole, null, 'no role invented');
  eq(v.evidence, null, 'no evidence invented');
  eq(v.confidence, null, 'no confidence invented');
  // (b) a stubbed live T20 returns a payload the normalizer's contract refuses
  //     (proposedRole not a string -> MALFORMED): UNVERIFIABLE / T20_REFUSED.
  const malformedRegistry = {
    has: id => id === 'T20',
    get: id => ({ validate: () => ({ valid: true, errors: [] }), execute: () => ({ success: true, output: { proposals: [{ objectId: GOLDEN_OID, proposedRole: 42 }] } }) }),
  };
  const vMalformed = verifySemanticCorrectionAttempt(attempt, proposal, makeGoldenTarget(), { ...verifySubstrate(fx), registry: malformedRegistry });
  eq(vMalformed.status, 'UNVERIFIABLE', 'honest UNVERIFIABLE');
  eq(vMalformed.reason, 'T20_REFUSED', 'the MALFORMED refusal surfaces as T20_REFUSED');
  // (c) out-of-vocabulary role (-> UNSUPPORTED_TYPE in the normalizer's
  //     vocabulary): also T20_REFUSED — never trusted, never compared.
  const foreignRoleRegistry = {
    has: id => id === 'T20',
    get: id => ({ validate: () => ({ valid: true, errors: [] }), execute: () => ({ success: true, output: { proposals: [{ objectId: GOLDEN_OID, proposedRole: 'widget', confidence: 0.9 }] } }) }),
  };
  const vForeign = verifySemanticCorrectionAttempt(attempt, proposal, makeGoldenTarget(), { ...verifySubstrate(fx), registry: foreignRoleRegistry });
  eq(vForeign.status, 'UNVERIFIABLE', 'honest UNVERIFIABLE');
  eq(vForeign.reason, 'T20_REFUSED', 'the UNSUPPORTED_TYPE refusal surfaces as T20_REFUSED');
});

// ---- E-6 --------------------------------------------------------------------
test('E-6: FAILED attempt cannot verify — INVALID_ATTEMPT (and any non-EXECUTED attempt shape)', ()=>{
  const fx = makeSubstrate();
  const p = makeGoldenProposal();
  const failedAttempt = executeSemanticCorrectionAttempt(p, { ...fx.substrate, registry: new ToolRegistry() });
  eq(failedAttempt.status, 'FAILED', 'control: the attempt FAILED (registry without T06 — the C-5 posture)');
  const target = makeGoldenTarget();
  for (const [label, bad] of [
    ['FAILED attempt', failedAttempt],
    ['null attempt', null],
    ['number attempt', 42],
    ['empty-object attempt', {}],
    ['status-keyless attempt', { transactionId: null, inverseKind: null, diffCounts: null, error: null }],
  ]){
    let threw = null;
    try { verifySemanticCorrectionAttempt(bad, p, target, verifySubstrate(fx)); } catch (e){ threw = e; }
    expect(threw, `${label}: refused`);
    expect(threw instanceof SemanticCorrectionError, `${label}: SemanticCorrectionError instance`);
    eq(threw.code, 'INVALID_ATTEMPT', `${label}: the INVALID_ATTEMPT code`);
  }
});

// ---- E-7 --------------------------------------------------------------------
test('E-7: confidence and evidence copied verbatim from the normalized record — never synthesized (value AND null arms)', ()=>{
  const { fx, proposal, attempt, target } = runGoldenAttempt();
  // Independent re-derivation of the SAME record the verification must copy from:
  const t20 = fx.registry.execute('T20', { objectIds: [GOLDEN_OID] }, t20Context(fx));
  eq(t20.success, true, 'control: T20 ran over the committed state');
  const raw = t20.output.proposals.find(p => p.objectId === GOLDEN_OID);
  eq(raw.proposedRole, 'background', 'control: the post-commit role');
  const v = verifySemanticCorrectionAttempt(attempt, proposal, target, verifySubstrate(fx));
  eq(v.status, 'SATISFIED', 'control');
  eq(v.confidence, raw.confidence, 'confidence verbatim from the T20 record (never clamped, never defaulted)');
  deepEq(v.evidence, raw.evidence, 'evidence verbatim (cloned, never aliased, never invented)');
  expect(Array.isArray(v.evidence), 'evidence is an array on the measured pair');
  // null arms through the stub surface: a non-numeric confidence normalizes to
  // null (BD-3 verbatim-or-null), absent evidence to [] (BD-4) — never 0, never {}.
  const noConfRegistry = {
    has: id => id === 'T20',
    get: id => ({ validate: () => ({ valid: true, errors: [] }), execute: () => ({ success: true, output: { proposals: [{ objectId: GOLDEN_OID, proposedRole: 'background', confidence: 'high', evidence: undefined }] } }) }),
  };
  const v2 = verifySemanticCorrectionAttempt(attempt, proposal, target, { ...verifySubstrate(fx), registry: noConfRegistry });
  eq(v2.status, 'SATISFIED', 'the role still verifies');
  eq(v2.confidence, null, 'non-numeric confidence -> null (never fabricated)');
  deepEq(v2.evidence, [], 'absent evidence -> []');
});

// ---- E-8 --------------------------------------------------------------------
test('E-8: actualRole is ALWAYS read from post-commit state — a document mutation between execute and verify flips the verification (no snapshot)', ()=>{
  const { fx, proposal, attempt, target } = runGoldenAttempt();
  eq(verifySemanticCorrectionAttempt(attempt, proposal, target, verifySubstrate(fx)).status, 'SATISFIED', 'control: SATISFIED right after the grow');
  // A SECOND, opposite mutation through the SAME substrate: shrink the object
  // back under the shape threshold (background -> shape, area 105000 -> 4750).
  const shrinkProposal = buildSemanticCorrectionProposal(
    makeGoldenTarget({ id: 'sct-7a7b7c7d', currentRole: 'background', targetRole: 'shape', source: 'smr-7a7b7c7d' }),
    goldenCapability(),
    makeGoldenFacts({ worldArea: 105000 })
  );
  const shrinkAttempt = executeSemanticCorrectionAttempt(shrinkProposal, fx.substrate);
  eq(shrinkAttempt.status, 'EXECUTED', 'the shrink committed');
  // Verifying the FIRST attempt now sees the NEW state: the live role is
  // 'shape'. A snapshot of the post-first-attempt state would say SATISFIED.
  const v = verifySemanticCorrectionAttempt(attempt, proposal, target, verifySubstrate(fx));
  eq(v.status, 'VIOLATED', 'the verification re-ran T20 over the CURRENT committed state');
  eq(v.actualRole, 'shape', 'the NEW post-second-mutation role (not the snapshotted background)');
  eq(v.reason, 'ROLE_MISMATCH', 'the honest mismatch');
});

// ---- E-9 --------------------------------------------------------------------
test('E-9: no false verification — a target with an unreachable role never becomes SATISFIED', ()=>{
  const { fx, proposal, attempt } = runGoldenAttempt();
  // The golden object is a childless rect: T20 can only ever derive 'shape' or
  // 'background' for it — 'heading' and 'container' are unreachable roles.
  for (const unreachable of ['heading', 'container']){
    const t = makeGoldenTarget({ targetRole: unreachable });
    const v = verifySemanticCorrectionAttempt(attempt, proposal, t, verifySubstrate(fx));
    eq(v.status, 'VIOLATED', `${unreachable}: never SATISFIED (spec §40)`);
    eq(v.reason, 'ROLE_MISMATCH', `${unreachable}: the honest mismatch`);
    eq(v.actualRole, 'background', `${unreachable}: the derived role is still reported verbatim`);
    eq(v.targetRole, unreachable, `${unreachable}: the expectation carried`);
  }
});

// ---- E-10 -------------------------------------------------------------------
test('E-10: determinism — same state + same target + same substrate -> byte-identical VerificationResult', ()=>{
  const { fx, proposal, attempt, target } = runGoldenAttempt();
  const s = verifySubstrate(fx);
  const a = verifySemanticCorrectionAttempt(attempt, proposal, target, s);
  const b = verifySemanticCorrectionAttempt(attempt, proposal, target, s);
  eq(JSON.stringify(a), JSON.stringify(b), 'byte-identical records (no RNG, no wall clock)');
  // and across FRESH substrates carrying the SAME committed state:
  const fresh = makeSubstrate();
  executeSemanticCorrectionAttempt(proposal, fresh.substrate);
  const c = verifySemanticCorrectionAttempt(attempt, proposal, target, verifySubstrate(fresh));
  eq(JSON.stringify(a), JSON.stringify(c), 'byte-identical across equivalent committed states');
});

// ---- E-11 -------------------------------------------------------------------
test("E-11: architecture scan — the verification/provider region: no role-write surface, no direct store writes, T20 reached only through the injected registry.get", ()=>{
  const src = readFileSync(new URL('../src-js/semantic-correction.js', import.meta.url), 'utf-8');
  const marker = src.indexOf('// ---- 9. Checkpoint F');
  expect(marker !== -1, 'the Checkpoint F section marker exists in the module');
  const region = stripComments(src.slice(marker));
  // the D/E forbidden role-write surface (spec §69 posture), over the F code too
  for (const token of ['setSemantic', 'forceRole', 'overrideRole', 'semanticStore', 'SemanticStore']){
    expect(!region.includes(token), `no ${token} anywhere in the verification region`);
  }
  // no direct store writes: the region only READS (the T20 read surface)
  for (const token of ['.set(', '.update(', '.create(', '.delete(', 'setObject', 'setGeometry', 'setAppearance', 'setNode']){
    expect(!region.includes(token), `no direct store write (${token}) in the verification region`);
  }
  // the LIVE tool is reached exclusively through the injected registry
  expect(region.includes('registry.get('), 'the LIVE tool comes from registry.get');
  expect(region.includes('registry.has('), 'the preflight goes through registry.has');
  expect(region.includes('T20'), 'T20 is the re-inference tool');
  expect(region.length > 1500, 'the verification region is a real implementation, not a stub');
});

// ---- E-12 -------------------------------------------------------------------
test('E-12: provider shape — createSemanticRoleProvider returns a function; the correct role for a known object; null when T20 unavailable', ()=>{
  const { fx } = runGoldenAttempt();
  const provider = createSemanticRoleProvider(verifySubstrate(fx));
  eq(typeof provider, 'function', 'a function is returned');
  eq(provider(GOLDEN_OID), 'background', 'the committed role for the known object');
  const pre = makeSubstrate(); // fresh document, T20 registered, object unmutated
  eq(createSemanticRoleProvider(verifySubstrate(pre))(GOLDEN_OID), 'shape', 'the pre-state role');
  const noT20 = verifySubstrate(makeSubstrate());
  noT20.registry = new ToolRegistry();
  eq(createSemanticRoleProvider(noT20)(GOLDEN_OID), null, 'null when T20 is unavailable (the honest signal, never a throw)');
});

// ============================================================================
// CATEGORY F — PROVIDER INTEGRATION (the DD-1 bridge to evaluation)
// ============================================================================

// ---- F-1 --------------------------------------------------------------------
test('F-1: the provider injected as evaluationContext.getActualRole drives the semantic arm to SATISFIED against a real document', ()=>{
  const { fx, attempt, target } = runGoldenAttempt();
  eq(attempt.status, 'EXECUTED', 'control: the golden attempt committed');
  const provider = createSemanticRoleProvider(verifySubstrate(fx));
  const expected = {
    intentId: 'semantic-correction-verification',
    status: 'requested',
    geometry: { width: null, height: null, rx: null, ry: null, area: null, symmetric: null },
    spatial: { aligned: null, centered: null, bbox: null },
    appearance: { fill: null, stroke: null, opacity: null },
    constraint: { satisfied: null },
    structure: { grouped: null },
    semantic: { satisfied: null, expectations: [{ objectId: GOLDEN_OID, role: target.targetRole, confidence: target.confidence }] },
  };
  const docContext = { objectStore: fx.objectStore, geometryStore: fx.geometryStore, appearanceStore: fx.appearanceStore, sceneGraph: fx.sceneGraph };
  const evaluationContext = { targets: [{ objectId: GOLDEN_OID, targetRef: '$doc:' + GOLDEN_OID }], getActualRole: provider };
  const result = evaluate(expected, docContext, evaluationContext);
  const r = result.metadata.semanticResults[0];
  eq(r.status, 'SATISFIED', 'the arm reaches SATISFIED through the injected provider (B9 end-to-end)');
  eq(r.role, 'background', 'the expected role carried by the arm');
  eq(r.confidence, target.confidence, 'confidence carried verbatim through the arm (BD-3 continuity)');
  eq(result.status, 'PASS', 'a satisfied agenda produces no deviation');
  eq(result.deviations.length, 0, 'zero deviations');
  eq(result.metadata.unevaluatedExpectations.includes('semantic'), false, "the blanket 'semantic' marker is gone once the arm ran");
  eq(expected.semantic.satisfied, null, 'the satisfied SLOT stays null-only (B9: never write a boolean)');
});

// ---- F-2 --------------------------------------------------------------------
test('F-2: the provider returns null on an unknown object (T20 refuses) — the honest signal, not a fabricated role', ()=>{
  const { fx } = runGoldenAttempt();
  const provider = createSemanticRoleProvider(verifySubstrate(fx));
  eq(provider('99999999-9999-4999-8999-999999999999'), null, 'unknown object -> null');
  eq(provider(''), null, 'empty id -> null');
  eq(provider(GOLDEN_OID), 'background', 'control: the known object still answers');
});

// ---- F-3 --------------------------------------------------------------------
test('F-3: the provider re-runs T20 on EVERY call — mutating the document between calls changes the returned role (no caching)', ()=>{
  const fx = makeSubstrate();
  const provider = createSemanticRoleProvider(verifySubstrate(fx));
  eq(provider(GOLDEN_OID), 'shape', 'pre-correction role');
  const attempt = executeSemanticCorrectionAttempt(makeGoldenProposal(), fx.substrate);
  eq(attempt.status, 'EXECUTED', 'the grow committed');
  eq(provider(GOLDEN_OID), 'background', 'post-correction role — SAME provider instance, fresh T20 run');
  eq(provider(GOLDEN_OID), 'background', 'stable on repeat (deterministic, still uncached)');
});

// ---- F-4 --------------------------------------------------------------------
test('F-4: the provider matches the DD-1 contract exactly: (objectId) => role string | null, never throws', ()=>{
  const { fx } = runGoldenAttempt();
  const provider = createSemanticRoleProvider(verifySubstrate(fx));
  eq(provider.length, 1, 'exactly one parameter (objectId)');
  for (const weird of [undefined, null, 42, {}, [], () => 'x', NaN]){
    let out; let threw = null;
    try { out = provider(weird); } catch (e){ threw = e; }
    eq(threw, null, `never throws for ${String(weird)}`);
    eq(out, null, `null (never undefined, never a role) for ${String(weird)}`);
  }
  const ok = provider(GOLDEN_OID);
  expect(typeof ok === 'string' && ok.length > 0, 'a known object yields a non-empty role string');
});

// ============================================================================
// PHASE 3.18 CHECKPOINT G — REGRESSION + ROLLBACK + CONVERGENCE + LOOP BRIDGE
// (spec §109; spec §50/§51 compliance: NO state machine change)
// ============================================================================
// Appended AFTER the A/B/C/D/E/F categories per the Checkpoint G prompt ("ADD
// new categories AFTER existing A/B/C/D/E/F tests"). The A-F bodies above are
// byte-identical to the approved Checkpoint F file; this section adds its own
// import declarations (legal hoisted ESM — the module link fails RED until
// src-js/semantic-correction.js exports the four new names, which IS the
// honest RED for an extended module surface).
//
// CATEGORY G (6 tests) — detectSemanticRegression:
//   G-1  frozen RegressionReport with exactly the declared keys + the
//        INVALID_VERIFICATION refusals (post required, vocabulary-guarded)
//   G-2  null preVerification -> UNKNOWN / NO_BASELINE (first attempt)
//   G-3  IMPROVED — pre UNVERIFIABLE or VIOLATED + post SATISFIED (incl. the
//        real pre/post chain from the golden fixture)
//   G-4  REGRESSED — pre SATISFIED + post VIOLATED
//   G-5  NO_CHANGE — same status twice (+ the UNKNOWN unmapped arms)
//   G-6  determinism — same inputs -> byte-identical report
//
// CATEGORY H (6 tests) — rollbackSemanticCorrectionAttempt (the §32 posture):
//   H-1  ROLLED_BACK on a top-of-history attempt (reason null, id carried)
//   H-2  stores restored to the pre-attempt state after rollback
//   H-3  REFUSED / NOT_TOP_OF_HISTORY when the attempt is not top-of-history
//        (stores untouched; the guard is precise — the TOP attempt still rolls
//        back afterwards)
//   H-4  INVALID_ATTEMPT / INVALID_SUBSTRATE throws (the prompt's "(or throw
//        INVALID_ATTEMPT)" option; the house duck-type, disclosure-32)
//   H-5  history position shrinks by exactly 1 (invariant 13, the substrate's
//        own moveBack semantics — entries retained for redo, truncated on the
//        next push: linear history preserved)
//   H-6  determinism — same attempt + fresh substrate -> byte-identical result
//
// CATEGORY I (8 tests) — detectSemanticConvergence:
//   I-1  empty trail -> TERMINATED / EMPTY_TRAIL (+ INVALID_TRAIL refusals)
//   I-2  last SATISFIED -> VERIFIED (reason null; wins over the budget)
//   I-3  iterationCount >= maxIterations -> MAX_ITERATIONS (fires before
//        NO_PROGRESS/OSCILLATION, the prompt's order)
//   I-4  NO_PROGRESS — the trailing threshold window shares one (status, role)
//   I-5  OSCILLATION — the A -> B -> A role recurrence (the §31 posture)
//   I-6  no path -> TERMINATED / NO_CONVERGENCE_PATH
//   I-7  policy defaults {5, 2} when omitted; explicit policy honored;
//        INVALID_POLICY refusals
//   I-8  determinism — same trail + same policy -> byte-identical verdict
//
// CATEGORY J (6 tests) — buildSemanticCorrectionAgenda (the §50/§51 bridge):
//   J-1  non-null for a CORRECTABLE diagnosis (golden anchor sct-86f52be0) and
//        the target feeds the E builder byte-for-byte (scp-f09b1135)
//   J-2  null for every UNSUPPORTED_TRANSITION refusal reason
//   J-3  the agenda carries target + diagnosis + isActionable (+ verbatim
//        belief enrichment into the target)
//   J-4  no state machine change — the module adds NO loop-state vocabulary
//        (scan) and imports nothing (no correction.js import)
//   J-5  determinism
//   J-6  the agenda is frozen and non-canonical (no store references)
// ============================================================================

// --- the four new exports (RED until the module provides them) -----------------
import {
  detectSemanticRegression,
  rollbackSemanticCorrectionAttempt,
  detectSemanticConvergence,
  buildSemanticCorrectionAgenda
} from '../src-js/semantic-correction.js';

// --- G/H/I/J-local fixtures -----------------------------------------------------
// VerificationResult stand-ins mirroring the F output shape (the house
// fixture-factory posture); the real-chain arms use the F functions directly.
function makeVerification(status, actualRole, overrides = {}){
  return {
    status,
    actualRole,
    targetRole: 'background',
    reason: status === 'SATISFIED' ? null : (status === 'VIOLATED' ? 'ROLE_MISMATCH' : 'T20_NO_PROPOSAL'),
    evidence: null,
    confidence: null,
    ...overrides,
  };
}
// A committed golden grow attempt on a GIVEN fixture (H needs two attempts on
// one substrate — the top-of-history refusal arm).
function growAttemptOn(fx){
  const proposal = makeGoldenProposal();
  const attempt = executeSemanticCorrectionAttempt(proposal, fx.substrate);
  return { proposal, attempt };
}
// The opposite-direction attempt (background -> shape) on an already-grown
// fixture (the E-8 shrink arithmetic: area 105000 -> 4750).
function shrinkAttemptOn(fx){
  const proposal = buildSemanticCorrectionProposal(
    makeGoldenTarget({ id: 'sct-7a7b7c7d', currentRole: 'background', targetRole: 'shape', source: 'smr-7a7b7c7d' }),
    goldenCapability(),
    makeGoldenFacts({ worldArea: 105000 })
  );
  const attempt = executeSemanticCorrectionAttempt(proposal, fx.substrate);
  return { proposal, attempt };
}

// ---- G-1 --------------------------------------------------------------------
test('G-1: detectSemanticRegression returns a frozen RegressionReport with exactly the declared keys (+ INVALID_VERIFICATION refusals)', ()=>{
  const v = detectSemanticRegression(makeVerification('VIOLATED', 'shape'), makeVerification('SATISFIED', 'background'));
  deepEq(Object.keys(v).sort(), ['postRole', 'postStatus', 'preRole', 'preStatus', 'reason', 'status'], 'exactly the six declared keys');
  deepFrozen(v, 'RegressionReport');
  for (const [label, pre, post] of [
    ['null post', makeVerification('VIOLATED', 'shape'), null],
    ['number post', null, 42],
    ['out-of-vocabulary post status', null, { status: 'WHATEVER', actualRole: null }],
    ['post missing actualRole', null, { status: 'SATISFIED' }],
    ['non-null invalid pre', 42, makeVerification('SATISFIED', 'background')],
  ]){
    let threw = null;
    try { detectSemanticRegression(pre, post); } catch (e){ threw = e; }
    expect(threw, `${label}: refused`);
    expect(threw instanceof SemanticCorrectionError, `${label}: SemanticCorrectionError instance`);
    eq(threw.code, 'INVALID_VERIFICATION', `${label}: the INVALID_VERIFICATION code`);
  }
});

// ---- G-2 --------------------------------------------------------------------
test('G-2: null preVerification -> UNKNOWN (first attempt, no baseline) with reason NO_BASELINE', ()=>{
  const post = makeVerification('SATISFIED', 'background');
  const v = detectSemanticRegression(null, post);
  eq(v.status, 'UNKNOWN', 'no baseline -> UNKNOWN (honest, never IMPROVED without a baseline)');
  eq(v.reason, 'NO_BASELINE', 'the deterministic machine reason');
  eq(v.preStatus, null, 'no pre status');
  eq(v.preRole, null, 'no pre role');
  eq(v.postStatus, 'SATISFIED', 'post status verbatim');
  eq(v.postRole, 'background', 'post role verbatim');
  const v2 = detectSemanticRegression(null, makeVerification('UNVERIFIABLE', null));
  eq(v2.status, 'UNKNOWN', 'UNKNOWN regardless of the post verdict');
  eq(v2.postStatus, 'UNVERIFIABLE', 'post status verbatim');
  eq(v2.postRole, null, 'null post role verbatim');
});

// ---- G-3 --------------------------------------------------------------------
test('G-3: IMPROVED — pre UNVERIFIABLE or VIOLATED + post SATISFIED (incl. the real golden pre/post chain)', ()=>{
  for (const preStatus of ['UNVERIFIABLE', 'VIOLATED']){
    const v = detectSemanticRegression(makeVerification(preStatus, 'shape'), makeVerification('SATISFIED', 'background'));
    eq(v.status, 'IMPROVED', `${preStatus} -> SATISFIED: IMPROVED`);
    eq(v.reason, null, 'mapped verdicts carry reason null');
    eq(v.preStatus, preStatus, 'pre status verbatim');
    eq(v.postStatus, 'SATISFIED', 'post status verbatim');
    eq(v.preRole, 'shape', 'pre role verbatim');
    eq(v.postRole, 'background', 'post role verbatim');
  }
  // the REAL chain: pre = the live F verification against the unmutated
  // document, post = the live F verification after the golden commit.
  const { fx, proposal, attempt, target } = runGoldenAttempt();
  const fresh = makeSubstrate();
  const pre = verifySemanticCorrectionAttempt(attempt, proposal, target, verifySubstrate(fresh));
  eq(pre.status, 'VIOLATED', 'control: the live pre-state derives shape');
  const post = verifySemanticCorrectionAttempt(attempt, proposal, target, verifySubstrate(fx));
  eq(post.status, 'SATISFIED', 'control: the live post-state derives background');
  const v = detectSemanticRegression(pre, post);
  eq(v.status, 'IMPROVED', 'the real chain reads IMPROVED');
  eq(v.preRole, 'shape', 'live pre role');
  eq(v.postRole, 'background', 'live post role');
});

// ---- G-4 --------------------------------------------------------------------
test('G-4: REGRESSED — pre SATISFIED + post VIOLATED', ()=>{
  const v = detectSemanticRegression(makeVerification('SATISFIED', 'background'), makeVerification('VIOLATED', 'shape'));
  eq(v.status, 'REGRESSED', 'SATISFIED -> VIOLATED: REGRESSED');
  eq(v.reason, null, 'mapped verdicts carry reason null');
  eq(v.preStatus, 'SATISFIED', 'pre status verbatim');
  eq(v.postStatus, 'VIOLATED', 'post status verbatim');
  eq(v.preRole, 'background', 'pre role verbatim');
  eq(v.postRole, 'shape', 'post role verbatim');
});

// ---- G-5 --------------------------------------------------------------------
test('G-5: NO_CHANGE — same status twice (all three statuses); the unmapped arms -> UNKNOWN / UNMAPPED_STATUS_TRANSITION', ()=>{
  for (const s of ['SATISFIED', 'VIOLATED', 'UNVERIFIABLE']){
    const role = s === 'UNVERIFIABLE' ? null : 'shape';
    const v = detectSemanticRegression(makeVerification(s, role), makeVerification(s, role));
    eq(v.status, 'NO_CHANGE', `${s} -> ${s}: NO_CHANGE`);
    eq(v.reason, null, 'mapped verdicts carry reason null');
    eq(v.preStatus, s, 'pre status verbatim');
    eq(v.postStatus, s, 'post status verbatim');
    eq(v.preRole, role, 'pre role verbatim (null for UNVERIFIABLE)');
    eq(v.postRole, role, 'post role verbatim');
  }
  // the prompt's "otherwise" arm: unmapped transitions -> UNKNOWN
  for (const [preS, postS] of [['UNVERIFIABLE', 'VIOLATED'], ['SATISFIED', 'UNVERIFIABLE'], ['VIOLATED', 'UNVERIFIABLE']]){
    const preRole = preS === 'UNVERIFIABLE' ? null : 'shape';
    const postRole = postS === 'UNVERIFIABLE' ? null : 'shape';
    const v = detectSemanticRegression(makeVerification(preS, preRole), makeVerification(postS, postRole));
    eq(v.status, 'UNKNOWN', `${preS} -> ${postS}: the otherwise arm`);
    eq(v.reason, 'UNMAPPED_STATUS_TRANSITION', 'the deterministic machine reason');
  }
});

// ---- G-6 --------------------------------------------------------------------
test('G-6: determinism — same inputs -> byte-identical report', ()=>{
  const post = makeVerification('SATISFIED', 'background');
  eq(JSON.stringify(detectSemanticRegression(makeVerification('VIOLATED', 'shape'), post)),
     JSON.stringify(detectSemanticRegression(makeVerification('VIOLATED', 'shape'), makeVerification('SATISFIED', 'background'))),
     'byte-identical (fresh records, same content)');
  eq(JSON.stringify(detectSemanticRegression(null, post)),
     JSON.stringify(detectSemanticRegression(null, makeVerification('SATISFIED', 'background'))),
     'byte-identical on the null-pre arm');
});

// ---- H-1 --------------------------------------------------------------------
test('H-1: rollbackSemanticCorrectionAttempt returns ROLLED_BACK on a top-of-history attempt (reason null, the attempt transactionId carried)', ()=>{
  const fx = makeSubstrate();
  const { attempt } = growAttemptOn(fx);
  eq(attempt.status, 'EXECUTED', 'control: committed');
  const r = rollbackSemanticCorrectionAttempt(attempt, fx.substrate);
  deepEq(Object.keys(r).sort(), ['reason', 'status', 'transactionId'], 'exactly the three declared keys');
  deepFrozen(r, 'RollbackResult');
  eq(r.status, 'ROLLED_BACK', 'the substrate undo succeeded');
  eq(r.reason, null, 'reason null on success');
  eq(r.transactionId, attempt.transactionId, 'the attempt transactionId carried');
});

// ---- H-2 --------------------------------------------------------------------
test('H-2: stores restored to the pre-attempt state after rollback (the substrate snapshot-inverse restore)', ()=>{
  const fx = makeSubstrate();
  const pre = JSON.parse(JSON.stringify(fx.geometryStore.get(GOLDEN_GEOM_ID).params));
  const { attempt } = growAttemptOn(fx);
  eq(attempt.status, 'EXECUTED', 'committed');
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width, 458.257569495584, 'mutated');
  const r = rollbackSemanticCorrectionAttempt(attempt, fx.substrate);
  eq(r.status, 'ROLLED_BACK', 'rolled back');
  deepEq(fx.geometryStore.get(GOLDEN_GEOM_ID).params, pre, 'stores restored byte-for-byte (x/y/width/height/rx/ry)');
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width * fx.geometryStore.get(GOLDEN_GEOM_ID).params.height, 20000, 'area back to 20000');
});

// ---- H-3 --------------------------------------------------------------------
test('H-3: REFUSED / NOT_TOP_OF_HISTORY when the attempt transaction is not top-of-history (stores untouched; the TOP attempt still rolls back)', ()=>{
  const fx = makeSubstrate();
  const first = growAttemptOn(fx);
  const second = shrinkAttemptOn(fx);
  eq(first.attempt.status, 'EXECUTED', 'control: both committed');
  eq(second.attempt.status, 'EXECUTED', 'control: both committed');
  eq(fx.historyManager.getCurrentIndex(), 1, 'control: two history entries, the top is the second');
  const r = rollbackSemanticCorrectionAttempt(first.attempt, fx.substrate);
  eq(r.status, 'REFUSED', 'the foreign transaction is refused');
  eq(r.reason, 'NOT_TOP_OF_HISTORY', 'the deterministic machine reason');
  eq(r.transactionId, first.attempt.transactionId, 'the refused transactionId carried');
  const width = fx.geometryStore.get(GOLDEN_GEOM_ID).params.width;
  expect(width !== 200 && width !== 458.257569495584, `stores untouched (still the post-shrink state: ${width})`);
  eq(fx.historyManager.getCurrentIndex(), 1, 'history untouched by the refusal');
  // the guard is precise, not over-refusing: the TOP attempt rolls back fine
  const r2 = rollbackSemanticCorrectionAttempt(second.attempt, fx.substrate);
  eq(r2.status, 'ROLLED_BACK', 'the top-of-history attempt rolls back');
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width, 458.257569495584, 'restored to the post-first-attempt state');
});

// ---- H-4 --------------------------------------------------------------------
test('H-4: INVALID_ATTEMPT for non-EXECUTED / malformed attempts; INVALID_SUBSTRATE for a substrate without the undo + top-of-history surface', ()=>{
  const fx = makeSubstrate();
  const failedAttempt = executeSemanticCorrectionAttempt(makeGoldenProposal(), { ...fx.substrate, registry: new ToolRegistry() });
  eq(failedAttempt.status, 'FAILED', 'control: the attempt FAILED (registry without T06)');
  for (const [label, bad] of [
    ['FAILED attempt', failedAttempt],
    ['null attempt', null],
    ['empty-object attempt', {}],
    ['transactionId-keyless attempt', { status: 'EXECUTED' }],
  ]){
    let threw = null;
    try { rollbackSemanticCorrectionAttempt(bad, fx.substrate); } catch (e){ threw = e; }
    expect(threw, `${label}: refused`);
    expect(threw instanceof SemanticCorrectionError, `${label}: SemanticCorrectionError instance`);
    eq(threw.code, 'INVALID_ATTEMPT', `${label}: the INVALID_ATTEMPT code`);
  }
  for (const [label, badSubstrate] of [
    ['missing transactionManager', {}],
    ['undo-keyless transactionManager', { transactionManager: {} }],
    ['historyManager-keyless transactionManager', { transactionManager: { undo: () => {} } }],
  ]){
    let threw = null;
    try { rollbackSemanticCorrectionAttempt({ status: 'EXECUTED', transactionId: 'atx-8f9fc7f8' }, badSubstrate); } catch (e){ threw = e; }
    expect(threw && threw.code === 'INVALID_SUBSTRATE', `${label}: INVALID_SUBSTRATE`);
  }
});

// ---- H-5 --------------------------------------------------------------------
test('H-5: history position shrinks by exactly 1 after rollback (invariant 13 — the substrate moveBack; entries retained for redo, truncated on the next push)', ()=>{
  const fx = makeSubstrate();
  const { attempt } = growAttemptOn(fx);
  eq(attempt.status, 'EXECUTED', 'committed');
  eq(fx.historyManager.getCurrentIndex(), 0, 'control: one entry, index 0');
  eq(fx.historyManager.size(), 1, 'control: size 1');
  const r = rollbackSemanticCorrectionAttempt(attempt, fx.substrate);
  eq(r.status, 'ROLLED_BACK', 'rolled back');
  eq(fx.historyManager.getCurrentIndex(), -1, 'the position shrank by EXACTLY 1 (0 -> -1)');
  eq(fx.historyManager.canUndo(), false, 'nothing left to undo');
  eq(fx.historyManager.getTransactionToUndo(), null, 'no transaction left to undo');
  eq(fx.historyManager.size(), 1, 'the substrate retains the entry for redo (moveBack never pops — the linear-history semantics of transaction.js)');
  // the NEXT push truncates the redo tail: the rolled-back entry is gone —
  // history stays linear (invariant 13)
  const second = growAttemptOn(fx);
  eq(second.attempt.status, 'EXECUTED', 'a new attempt commits');
  eq(fx.historyManager.size(), 1, 'the redo tail was truncated by the push: size back to 1');
  eq(fx.historyManager.getCurrentIndex(), 0, 'index back to 0');
});

// ---- H-6 --------------------------------------------------------------------
test('H-6: determinism — same attempt + fresh substrate -> byte-identical result (ROLLED_BACK and REFUSED arms)', ()=>{
  const rolledBackRun = () => {
    const fx = makeSubstrate();
    const { attempt } = growAttemptOn(fx);
    return rollbackSemanticCorrectionAttempt(attempt, fx.substrate);
  };
  const a = rolledBackRun();
  const b = rolledBackRun();
  eq(a.status, 'ROLLED_BACK', 'control');
  eq(JSON.stringify(a), JSON.stringify(b), 'byte-identical ROLLED_BACK records (the content-derived transactionId included)');
  const refusedRun = () => {
    const fx = makeSubstrate();
    const first = growAttemptOn(fx);
    shrinkAttemptOn(fx);
    return rollbackSemanticCorrectionAttempt(first.attempt, fx.substrate);
  };
  const ra = refusedRun();
  const rb = refusedRun();
  eq(ra.status, 'REFUSED', 'control');
  eq(JSON.stringify(ra), JSON.stringify(rb), 'byte-identical REFUSED records');
});

// ---- I-1 --------------------------------------------------------------------
test('I-1: empty trail -> TERMINATED / EMPTY_TRAIL (+ INVALID_TRAIL refusals)', ()=>{
  const v = detectSemanticConvergence([]);
  deepEq(Object.keys(v).sort(), ['iterationCount', 'reason', 'verdict'], 'exactly the three declared keys');
  deepFrozen(v, 'ConvergenceVerdict');
  eq(v.verdict, 'TERMINATED', 'empty trail: TERMINATED');
  eq(v.reason, 'EMPTY_TRAIL', 'the pinned reason');
  eq(v.iterationCount, 0, 'zero iterations');
  for (const [label, badTrail] of [
    ['null trail', null],
    ['object trail', {}],
    ['bad entry (number)', [42]],
    ['bad entry (out-of-vocabulary status)', [{ status: 'WHATEVER', actualRole: null }]],
    ['bad entry (missing actualRole)', [{ status: 'VIOLATED' }]],
  ]){
    let threw = null;
    try { detectSemanticConvergence(badTrail); } catch (e){ threw = e; }
    expect(threw, `${label}: refused`);
    expect(threw instanceof SemanticCorrectionError, `${label}: SemanticCorrectionError instance`);
    eq(threw.code, 'INVALID_TRAIL', `${label}: the INVALID_TRAIL code`);
  }
});

// ---- I-2 --------------------------------------------------------------------
test('I-2: last SATISFIED -> VERIFIED (reason null; wins over the iteration budget, the prompt step order)', ()=>{
  const v = detectSemanticConvergence([makeVerification('VIOLATED', 'shape'), makeVerification('SATISFIED', 'background')]);
  eq(v.verdict, 'VERIFIED', 'converged');
  eq(v.reason, null, 'reason null on VERIFIED (the pinned convention)');
  eq(v.iterationCount, 2, 'the trail length');
  const single = detectSemanticConvergence([makeVerification('SATISFIED', 'background')]);
  eq(single.verdict, 'VERIFIED', 'a single satisfied verification converges');
  eq(single.iterationCount, 1, 'one iteration');
  const over = detectSemanticConvergence(
    [makeVerification('VIOLATED', 'shape'), makeVerification('SATISFIED', 'background')],
    { maxIterations: 1, noProgressThreshold: 2 }
  );
  eq(over.verdict, 'VERIFIED', 'step 3 (VERIFIED) precedes step 4 (MAX_ITERATIONS)');
});

// ---- I-3 --------------------------------------------------------------------
test('I-3: iterationCount >= maxIterations -> MAX_ITERATIONS (fires before NO_PROGRESS/OSCILLATION, the prompt order)', ()=>{
  const trail = [makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'background'), makeVerification('VIOLATED', 'shape')];
  const v = detectSemanticConvergence(trail, { maxIterations: 3, noProgressThreshold: 2 });
  eq(v.verdict, 'MAX_ITERATIONS', 'budget exhausted');
  expect(v.reason !== null && v.reason.length > 0, 'a deterministic machine reason is carried');
  eq(v.iterationCount, 3, 'three iterations');
  const osc = detectSemanticConvergence(trail, { maxIterations: 10, noProgressThreshold: 2 });
  eq(osc.verdict, 'OSCILLATION', 'control: with budget 10 the same trail reads OSCILLATION — MAX_ITERATIONS wins by order');
});

// ---- I-4 --------------------------------------------------------------------
test('I-4: NO_PROGRESS — the trailing noProgressThreshold window shares one (status, role) pair', ()=>{
  const v = detectSemanticConvergence([makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'shape')]);
  eq(v.verdict, 'NO_PROGRESS', 'two identical failures: no progress (default threshold 2)');
  eq(v.iterationCount, 2, 'two iterations');
  const three = detectSemanticConvergence([makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'shape')]);
  eq(three.verdict, 'NO_PROGRESS', 'three identical failures: still NO_PROGRESS under the default budget of 5');
  const unverifiable = detectSemanticConvergence([makeVerification('UNVERIFIABLE', null), makeVerification('UNVERIFIABLE', null)]);
  eq(unverifiable.verdict, 'NO_PROGRESS', 'repeated UNVERIFIABLE (null role) is honest no-progress too');
});

// ---- I-5 --------------------------------------------------------------------
test('I-5: OSCILLATION — the A -> B -> A role recurrence (the §31 posture)', ()=>{
  const v = detectSemanticConvergence(
    [makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'background'), makeVerification('VIOLATED', 'shape')],
    { maxIterations: 10, noProgressThreshold: 2 }
  );
  eq(v.verdict, 'OSCILLATION', 'A -> B -> A detected');
  eq(v.iterationCount, 3, 'three iterations');
  const four = detectSemanticConvergence(
    [makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'background'), makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'background')],
    { maxIterations: 10, noProgressThreshold: 2 }
  );
  eq(four.verdict, 'OSCILLATION', 'A -> B -> A -> B detected (the recurrence spans the trail)');
  const endsSame = detectSemanticConvergence(
    [makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'background'), makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'shape')],
    { maxIterations: 10, noProgressThreshold: 2 }
  );
  eq(endsSame.verdict, 'NO_PROGRESS', 'a trailing same-pair window wins by order — the prompt lists NO_PROGRESS before OSCILLATION');
});

// ---- I-6 --------------------------------------------------------------------
test('I-6: no convergence path -> TERMINATED / NO_CONVERGENCE_PATH', ()=>{
  const v = detectSemanticConvergence([makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'background')]);
  eq(v.verdict, 'TERMINATED', 'two differing failures under the default policy: no path');
  eq(v.reason, 'NO_CONVERGENCE_PATH', 'the pinned reason');
  eq(v.iterationCount, 2, 'two iterations');
});

// ---- I-7 --------------------------------------------------------------------
test('I-7: policy defaults {maxIterations: 5, noProgressThreshold: 2} when omitted; explicit policy honored; INVALID_POLICY refusals', ()=>{
  eq(detectSemanticConvergence([makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'shape')]).verdict,
     'NO_PROGRESS', 'default noProgressThreshold 2 (length 2 < default max 5)');
  const five = detectSemanticConvergence([
    makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'shape'),
    makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'shape'),
  ]);
  eq(five.verdict, 'MAX_ITERATIONS', 'default maxIterations 5 (step order: budget before no-progress)');
  const one = detectSemanticConvergence([makeVerification('VIOLATED', 'shape')], { maxIterations: 1, noProgressThreshold: 2 });
  eq(one.verdict, 'MAX_ITERATIONS', 'explicit maxIterations 1 honored');
  for (const [label, badPolicy] of [
    ['null policy', null],
    ['number policy', 42],
    ['maxIterations 0', { maxIterations: 0, noProgressThreshold: 2 }],
    ['negative threshold', { maxIterations: 5, noProgressThreshold: -1 }],
    ['NaN maxIterations', { maxIterations: NaN, noProgressThreshold: 2 }],
    ['partial policy', { maxIterations: 3 }],
  ]){
    let threw = null;
    try { detectSemanticConvergence([makeVerification('VIOLATED', 'shape')], badPolicy); } catch (e){ threw = e; }
    expect(threw && threw.code === 'INVALID_POLICY', `${label}: INVALID_POLICY`);
  }
});

// ---- I-8 --------------------------------------------------------------------
test('I-8: determinism — same trail + same policy -> byte-identical verdict', ()=>{
  const trail = () => [makeVerification('VIOLATED', 'shape'), makeVerification('VIOLATED', 'background'), makeVerification('VIOLATED', 'shape')];
  const a = detectSemanticConvergence(trail(), { maxIterations: 10, noProgressThreshold: 2 });
  const b = detectSemanticConvergence(trail(), { maxIterations: 10, noProgressThreshold: 2 });
  eq(JSON.stringify(a), JSON.stringify(b), 'byte-identical (fresh trail and policy objects, same content)');
});

// ---- J-1 --------------------------------------------------------------------
test('J-1: buildSemanticCorrectionAgenda returns a non-null agenda for a CORRECTABLE diagnosis (golden anchor) and the target feeds the E builder byte-for-byte', ()=>{
  const agenda = buildSemanticCorrectionAgenda(makeDeviation(), makeFacts());
  expect(agenda !== null, 'CORRECTABLE -> agenda (never null)');
  eq(agenda.isActionable, true, 'actionable');
  eq(agenda.refusalReason, null, 'no refusal on the actionable agenda');
  // golden anchor: the REAL dev-8305da82 deviation (the A-16 content, with the
  // host belief enrichment) -> sct-86f52be0 -> the E builder -> scp-f09b1135
  const goldenDeviation = {
    id: 'dev-8305da82',
    category: 'semantic',
    property: 'role',
    expected: 'background',
    actual: 'shape',
    delta: null,
    tolerance: null,
    severity: 'error',
    objectId: GOLDEN_OID,
    targetRef: '$doc:' + GOLDEN_OID,
    message: `semantic role expectation violated: object '${GOLDEN_OID}' expected role 'background', observed role 'shape'`,
    confidence: 0.696,
    evidence: [],
  };
  const goldenAgenda = buildSemanticCorrectionAgenda(goldenDeviation, makeFacts());
  eq(goldenAgenda.target.id, 'sct-86f52be0', 'the golden target id (the C6 chain anchor)');
  const proposal = buildSemanticCorrectionProposal(goldenAgenda.target, goldenCapability(), makeGoldenFacts());
  eq(proposal.id, 'scp-f09b1135', 'the golden proposal id — agenda.target is byte-serviceable by the E builder (the bridge works)');
});

// ---- J-2 --------------------------------------------------------------------
test('J-2: returns null for every UNSUPPORTED_TRANSITION refusal reason (the host falls through to the existing NO_CAPABILITY terminal)', ()=>{
  eq(buildSemanticCorrectionAgenda(makeDeviation(), makeFacts({ geometryType: 'ellipse' })), null, 'rect-gate refusal -> null');
  eq(buildSemanticCorrectionAgenda(makeDeviation({ expected: 'heading', actual: 'text' }), makeFacts()), null, 'pair refusal -> null');
  eq(buildSemanticCorrectionAgenda(makeShrinkDeviation(), makeFacts({ childCount: 3 })), null, 'container-override refusal -> null');
  eq(buildSemanticCorrectionAgenda(makeDeviation(), makeFacts({ worldArea: null })), null, 'strict-crossing refusal (null area, grow) -> null');
});

// ---- J-3 --------------------------------------------------------------------
test('J-3: the agenda carries target + diagnosis + isActionable (exact keys; verbatim belief enrichment into the target)', ()=>{
  const agenda = buildSemanticCorrectionAgenda(makeDeviation(), makeFacts());
  deepEq(Object.keys(agenda).sort(), ['diagnosis', 'isActionable', 'refusalReason', 'target'], 'exactly the four declared keys');
  deepEq(Object.keys(agenda.target).sort(), ['confidence', 'currentRole', 'evidence', 'id', 'objectId', 'source', 'targetRole'], 'the target is the exact C1 record');
  deepEq(Object.keys(agenda.diagnosis).sort(), ['affectedObjectIds', 'capabilityId', 'reason', 'status', 'targetId'], 'the diagnosis is the exact C3 record');
  eq(agenda.target.id, agenda.diagnosis.targetId, 'the target names the diagnosis handle');
  eq(agenda.target.objectId, 'obj-fix-1', 'objectId from the deviation');
  eq(agenda.target.currentRole, 'shape', 'currentRole = the deviation actual');
  eq(agenda.target.targetRole, 'background', 'targetRole = the deviation expected');
  eq(agenda.target.source, 'dev-1a2b3c4d', 'source = the deviation id');
  eq(agenda.target.confidence, null, 'no upstream belief on the bare deviation -> null (never synthesized)');
  deepEq(agenda.target.evidence, [], 'no upstream evidence -> []');
  eq(agenda.diagnosis.status, 'CORRECTABLE', 'the diagnosis rides verbatim');
  eq(agenda.diagnosis.capabilityId, 'cap-shape-background', 'the ONE capability grounds the agenda');
  // enrichment: a host carrying the belief passes it through VERBATIM
  const enriched = buildSemanticCorrectionAgenda(
    makeDeviation({ confidence: 0.696, evidence: [{ signal: 'size', description: 'area 20000', weight: 0.05 }] }),
    makeFacts()
  );
  eq(enriched.target.confidence, 0.696, 'confidence verbatim (never synthesized)');
  deepEq(enriched.target.evidence, [{ signal: 'size', description: 'area 20000', weight: 0.05 }], 'evidence verbatim clone');
  let threw = null;
  try { buildSemanticCorrectionAgenda(makeDeviation({ confidence: 'high' }), makeFacts()); } catch (e){ threw = e; }
  expect(threw && threw.code === 'INVALID_DEVIATION', 'enrichment is validated when present (the validate-what-you-consume posture)');
  let threwId = null;
  try { buildSemanticCorrectionAgenda(makeDeviation({ id: 'not-a-house-id' }), makeFacts()); } catch (e){ threwId = e; }
  expect(threwId && threwId.code === 'INVALID_DEVIATION', 'the deviation id is gated to the house dev-/smr- id space (the C1 target.source contract)');
});

// ---- J-4 --------------------------------------------------------------------
test('J-4: no state machine change — the module adds NO loop-state vocabulary and imports nothing (no correction.js import)', ()=>{
  const src = readFileSync(new URL('../src-js/semantic-correction.js', import.meta.url), 'utf-8');
  const body = stripComments(src);
  // The 11-state machine's state names — NONE may appear in this module. The
  // two shared tokens (TERMINATED, VERIFIED) are prompt-pinned CONVERGENCE
  // VERDICTS here (outputs of detectSemanticConvergence), not loop states:
  // this module owns no transition table and no session state.
  for (const state of ['PLANNING', 'EXECUTING', 'EVALUATING', 'DIAGNOSING', 'CORRECTING', 'RE_EXECUTING', 'RE_EVALUATING', 'ROLLING_BACK', 'IDLE']){
    expect(!body.includes(state), `no loop-state vocabulary: ${state}`);
  }
  expect(!/(^|\n)\s*import[\s{*'"(]/.test(src), 'no import declarations (the zero-import pin)');
  expect(!body.includes("from './correction"), 'no correction.js import (integration is via injection, not import)');
  // the house engine rollback wrapper is never CALLED — the substrate's own
  // undo path is used instead (the E-approved substrateError message cites
  // correction.js line ranges as documentation, which is not an import)
  expect(!body.includes('rollbackCorrectionAttempt'), 'the house rollback wrapper is never called (the substrate undo path is used instead)');
});

// ---- J-5 --------------------------------------------------------------------
test('J-5: determinism — same inputs -> byte-identical agenda (and stable null refusals)', ()=>{
  const a = buildSemanticCorrectionAgenda(makeDeviation(), makeFacts());
  const b = buildSemanticCorrectionAgenda(makeDeviation(), makeFacts());
  eq(JSON.stringify(a), JSON.stringify(b), 'byte-identical agendas (fresh inputs, same content)');
  eq(buildSemanticCorrectionAgenda(makeDeviation(), makeFacts({ geometryType: 'ellipse' })), null, 'refusal stays null');
  eq(buildSemanticCorrectionAgenda(makeDeviation(), makeFacts({ geometryType: 'ellipse' })), null, 'null determinism');
});

// ---- J-6 --------------------------------------------------------------------
test('J-6: the returned agenda is frozen and non-canonical (deep-frozen, JSON-serializable, primitive-leaf data only)', ()=>{
  const agenda = buildSemanticCorrectionAgenda(makeDeviation(), makeFacts());
  deepFrozen(agenda, 'agenda');
  const json = JSON.stringify(agenda);
  expect(typeof json === 'string' && json.length > 100, 'serializable (no functions, no cycles, no store handles)');
  const walk = (v, path) => {
    if (v === null || typeof v !== 'object'){
      expect(v === null || ['string', 'number', 'boolean'].includes(typeof v), `primitive leaf at ${path}`);
      return;
    }
    for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
  };
  walk(agenda, 'agenda');
});

// ============================================================================
// PHASE 3.18 CHECKPOINT H — FINAL GREEN + INTEGRATION + STUB-KILL (spec §109)
// ============================================================================
// Appended AFTER the A/B/C/D/E/F/G/H/I/J categories per the Checkpoint H
// prompt ("Add a new test category K ... Add tests that prove the critical
// path CANNOT succeed via stubs"). The A-J bodies above are byte-identical to
// the approved Checkpoint G file; this section adds its own import
// declaration (legal hoisted ESM — the module link fails RED until
// src-js/semantic-correction.js exports buildSemanticCorrectionPlan, which IS
// the honest RED for an extended module surface).
//
// CATEGORY K (6 tests) — the §50 integration pipeline + the plan contract:
//   K-1  full semantic correction pipeline — real document (rect at world
//        area 20000) -> REAL T20 'shape' -> semantic deviation (expected
//        'background', actual 'shape') -> diagnosis CORRECTABLE -> agenda
//        non-null -> PLAN non-null (buildSemanticCorrectionPlan, the ONE
//        agenda->proposal conversion) -> execute EXECUTED -> verify SATISFIED
//        -> regression IMPROVED (VIOLATED-pre / SATISFIED-post) -> convergence
//        VERIFIED -> REAL T20 re-derives 'background' — all side effects
//        inside ONE transaction
//   K-2  rollback golden — the K-1 setup, after execute a manual REAL T20 run
//        confirms 'background', then rollbackSemanticCorrectionAttempt ->
//        ROLLED_BACK and REAL T20 re-derives 'shape' (restored)
//   K-3  no-capability golden — a text->heading semantic deviation ->
//        UNSUPPORTED_TRANSITION -> agenda null -> NO transaction opened
//        (substrate counters stay zero) -> honest termination: the host falls
//        through to the existing NO_CAPABILITY path (spec §114: this is the
//        honest refusal, NOT the phase's PASS claim — K-1 carries that)
//   K-4  convergence golden — the stubbornly oscillating trail
//        [VIOLATED/shape, VIOLATED/background, VIOLATED/shape] under budget 10
//        -> OSCILLATION; under budget 3 -> MAX_ITERATIONS (budget fires first)
//   K-5  plan validation — NOT_ACTIONABLE / INVALID_AGENDA /
//        INVALID_CAPABILITY / INVALID_OBJECT_FACTS refusals
//   K-6  plan contract — frozen, exactly the four declared keys, the
//        content-derived 'scplan-<8hex>' id (independently recomputed over the
//        pinned {agendaId, proposalId} pair), the byte-identical golden
//        proposal scp-f09b1135, determinism
//
// STUB-KILL PROOF (spec §68; 3 tests) — the critical path CANNOT succeed via
// stubs. Each test's comment names the EXACT shortcut it kills:
//   stub-kill-1  a fixed-role T20 stub bypasses the real derivation chain —
//                SATISFIED for target 'background' is impossible; verification
//                reports the honest VIOLATED with the stub's own role
//   stub-kill-2  a transaction-executor stub that skips the commit leaves the
//                stores unchanged — the REAL post-commit re-derivation exposes
//                the silent no-op as VIOLATED
//   stub-kill-3  a registry answering the T06 key with a DIFFERENT tool fails
//                the attempt's tool validation (proposal.toolId mismatch) —
//                atomic refusal, stores untouched
// ============================================================================

// --- the new export (RED until the module provides it) -------------------------
import { buildSemanticCorrectionPlan } from '../src-js/semantic-correction.js';

// ---- K-1 --------------------------------------------------------------------
test('K-1: full semantic correction pipeline — real T20 -> deviation -> diagnosis -> agenda -> plan -> execute -> verify SATISFIED -> IMPROVED -> VERIFIED -> role background, ONE transaction', ()=>{
  const fx = makeSubstrate();
  eq(fx.historyManager.size(), 0, 'empty before (the counters baseline for the ONE-transaction proof)');
  // 1. REAL T20 over the real document (a rect at world area 20000)
  const t20 = fx.registry.execute('T20', { objectIds: [GOLDEN_OID] }, t20Context(fx));
  eq(t20.success, true, 'T20 ran');
  const record = t20.output.proposals[0];
  eq(record.proposedRole, 'shape', "REAL T20 derives 'shape' at area 20000");
  // 2. the semantic deviation (expected 'background', actual 'shape') — the C6
  //    golden content with the C6 worked-example belief enrichment, so the
  //    whole pipeline rides the approved golden chain
  const deviation = {
    id: eContentId('dev-', {
      category: 'semantic', property: 'role', expected: 'background', actual: 'shape',
      delta: null, tolerance: null, severity: 'error', objectId: GOLDEN_OID, targetRef: '$doc:' + GOLDEN_OID,
      message: `semantic role expectation violated: object '${GOLDEN_OID}' expected role 'background', observed role 'shape'`,
    }),
    category: 'semantic', property: 'role', expected: 'background', actual: 'shape',
    delta: null, tolerance: null, severity: 'error', objectId: GOLDEN_OID, targetRef: '$doc:' + GOLDEN_OID,
    message: `semantic role expectation violated: object '${GOLDEN_OID}' expected role 'background', observed role 'shape'`,
    confidence: 0.696,
    evidence: [],
  };
  eq(deviation.id, 'dev-8305da82', 'the house dev- id (the C6 anchor)');
  // 3. the host reads the facts from the document BEFORE calling
  const geom = fx.geometryStore.get(GOLDEN_GEOM_ID).params;
  const facts = {
    geometryType: fx.geometryStore.get(GOLDEN_GEOM_ID).type,
    childCount: fx.sceneGraph.findNodeByObjectId(GOLDEN_OID).children.length,
    worldArea: geom.width * geom.height,
    center: { x: geom.x + geom.width / 2, y: geom.y + geom.height / 2 },
  };
  eq(facts.worldArea, 20000, 'the pre-state world area');
  // 4. diagnose
  const diagnosis = diagnoseSemanticDeviation(deviation, facts);
  eq(diagnosis.status, 'CORRECTABLE', 'the deviation is CORRECTABLE');
  eq(diagnosis.targetId, 'sct-86f52be0', 'the golden target handle');
  // 5. agenda
  const agenda = buildSemanticCorrectionAgenda(deviation, facts);
  expect(agenda !== null, 'the agenda is non-null');
  eq(agenda.isActionable, true, 'actionable');
  // 6. the PLAN — the ONE agenda->proposal conversion (spec §50, Checkpoint H)
  const plan = buildSemanticCorrectionPlan(agenda, facts);
  expect(plan !== null, 'the plan is non-null');
  eq(plan.proposal.id, 'scp-f09b1135', 'the plan carries the byte-for-byte golden proposal');
  eq(plan.expectedRegression.status, 'IMPROVED', 'the declared expectation: VIOLATED-pre -> SATISFIED-post');
  // 7. execute
  const attempt = executeSemanticCorrectionAttempt(plan.proposal, fx.substrate);
  eq(attempt.status, 'EXECUTED', 'the attempt committed');
  eq(attempt.transactionId, 'atx-8f9fc7f8', 'the golden attempt transaction (the approved chain tail)');
  // 8. verify (B9: REAL T20 re-inference over the committed state)
  const post = verifySemanticCorrectionAttempt(attempt, plan.proposal, agenda.target, verifySubstrate(fx));
  eq(post.status, 'SATISFIED', 'the post-commit re-derivation agrees');
  eq(post.actualRole, 'background', 'the re-derived role');
  // 9. regression — pre = the live verification against an UNMUTATED document
  const fresh = makeSubstrate();
  const pre = verifySemanticCorrectionAttempt(attempt, plan.proposal, agenda.target, verifySubstrate(fresh));
  eq(pre.status, 'VIOLATED', 'the pre-state derives shape (honest VIOLATED baseline)');
  eq(detectSemanticRegression(pre, post).status, 'IMPROVED', 'VIOLATED-pre + SATISFIED-post -> IMPROVED');
  // 10. convergence
  const convergence = detectSemanticConvergence([pre, post]);
  eq(convergence.verdict, 'VERIFIED', 'the two-verification trail converged');
  eq(convergence.iterationCount, 2, 'two iterations');
  // 11. re-run REAL T20 — the role re-derivation FLIPPED
  const t20b = fx.registry.execute('T20', { objectIds: [GOLDEN_OID] }, t20Context(fx));
  eq(t20b.output.proposals[0].proposedRole, 'background', "REAL T20 re-derives 'background' at area 105000");
  // 12. ALL side effects inside ONE transaction
  eq(fx.historyManager.size(), 1, 'exactly one history entry');
  eq(fx.historyManager.getCurrentIndex(), 0, 'the attempt is top of history');
  eq(fx.eventBus.getHistory().filter(e => e.type === 'TransactionCommitted').length, 1, 'exactly one commit event');
  eq(attempt.diffCounts.modified, 1, 'exactly the geometry row modified');
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width * fx.geometryStore.get(GOLDEN_GEOM_ID).params.height, 105000, 'the committed post-area');
});

// ---- K-2 --------------------------------------------------------------------
test('K-2: rollback golden — the K-1 flow, T20 confirms background, rollbackSemanticCorrectionAttempt -> ROLLED_BACK, REAL T20 re-derives shape', ()=>{
  const fx = makeSubstrate();
  const t20 = fx.registry.execute('T20', { objectIds: [GOLDEN_OID] }, t20Context(fx));
  eq(t20.output.proposals[0].proposedRole, 'shape', 'pre-correction role');
  const deviation = {
    id: 'dev-8305da82',
    category: 'semantic', property: 'role', expected: 'background', actual: 'shape',
    delta: null, tolerance: null, severity: 'error', objectId: GOLDEN_OID, targetRef: '$doc:' + GOLDEN_OID,
    message: `semantic role expectation violated: object '${GOLDEN_OID}' expected role 'background', observed role 'shape'`,
    confidence: 0.696,
    evidence: [],
  };
  const geom = fx.geometryStore.get(GOLDEN_GEOM_ID).params;
  const facts = {
    geometryType: fx.geometryStore.get(GOLDEN_GEOM_ID).type,
    childCount: fx.sceneGraph.findNodeByObjectId(GOLDEN_OID).children.length,
    worldArea: geom.width * geom.height,
    center: { x: geom.x + geom.width / 2, y: geom.y + geom.height / 2 },
  };
  const agenda = buildSemanticCorrectionAgenda(deviation, facts);
  const plan = buildSemanticCorrectionPlan(agenda, facts);
  const attempt = executeSemanticCorrectionAttempt(plan.proposal, fx.substrate);
  eq(attempt.status, 'EXECUTED', 'committed');
  // manually re-run REAL T20 and confirm the flip
  const flipped = fx.registry.execute('T20', { objectIds: [GOLDEN_OID] }, t20Context(fx)).output.proposals[0].proposedRole;
  eq(flipped, 'background', "REAL T20 confirms 'background' after the grow");
  // the §32 rollback through the substrate's OWN undo
  const rollback = rollbackSemanticCorrectionAttempt(attempt, fx.substrate);
  eq(rollback.status, 'ROLLED_BACK', 'rolled back');
  eq(rollback.reason, null, 'reason null on success');
  eq(rollback.transactionId, attempt.transactionId, 'the attempt transactionId carried');
  // REAL T20 re-derives the pre-correction role
  const restored = fx.registry.execute('T20', { objectIds: [GOLDEN_OID] }, t20Context(fx)).output.proposals[0].proposedRole;
  eq(restored, 'shape', "REAL T20 re-derives 'shape' (restored)");
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width, 200, 'the store restored to the pre-attempt width');
  eq(fx.historyManager.getCurrentIndex(), -1, 'history back at the root (invariant 13)');
});

// ---- K-3 --------------------------------------------------------------------
test('K-3: no-capability golden — text->heading -> UNSUPPORTED_TRANSITION -> agenda null -> NO transaction opened -> honest termination (the existing NO_CAPABILITY fall-through)', ()=>{
  const fx = makeSubstrate();
  // a semantic deviation for text->heading — NO tool exists for that transition
  const deviation = makeDeviation({ expected: 'heading', actual: 'text', objectId: GOLDEN_OID, targetRef: '$doc:' + GOLDEN_OID });
  const facts = makeFacts();
  const diagnosis = diagnoseSemanticDeviation(deviation, facts);
  eq(diagnosis.status, 'UNSUPPORTED_TRANSITION', 'no registered capability serves text->heading');
  eq(diagnosis.reason, 'ROLE_PAIR_UNSUPPORTED', 'the machine reason');
  eq(diagnosis.capabilityId, null, 'no capabilityId on the refusal');
  eq(buildSemanticCorrectionAgenda(deviation, facts), null, 'the agenda is null — the host fall-through signal');
  // no transaction opened: the substrate counters stay zero
  eq(fx.historyManager.size(), 0, 'history untouched');
  eq(fx.historyManager.canUndo(), false, 'nothing to undo');
  eq(fx.eventBus.getHistory().filter(e => e.type === 'TransactionCommitted').length, 0, 'no commit events');
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width, 200, 'stores untouched');
  // honest termination: with a null agenda the host never builds a plan and
  // never opens an attempt — it falls through to the EXISTING engine terminal
  // (SEMANTIC_ERROR has ZERO recipes, correction.js:1328-1347 -> NO_CAPABILITY ->
  // UNFIXABLE). Spec §114: this honest refusal is NOT the phase's PASS claim;
  // K-1 carries the real correction proof.
});

// ---- K-4 --------------------------------------------------------------------
test('K-4: convergence golden — the oscillating trail [VIOLATED/shape, VIOLATED/background, VIOLATED/shape] reads OSCILLATION under budget 10 and MAX_ITERATIONS under budget 3 (the budget fires first)', ()=>{
  const trail = () => [
    makeVerification('VIOLATED', 'shape'),
    makeVerification('VIOLATED', 'background'),
    makeVerification('VIOLATED', 'shape'),
  ];
  const osc = detectSemanticConvergence(trail(), { maxIterations: 10, noProgressThreshold: 2 });
  eq(osc.verdict, 'OSCILLATION', 'the stubborn oscillation under budget 10');
  eq(osc.reason, 'ROLE_RECURRENCE', 'the A -> B -> A recurrence reason');
  eq(osc.iterationCount, 3, 'three iterations');
  const maxed = detectSemanticConvergence(trail(), { maxIterations: 3, noProgressThreshold: 2 });
  eq(maxed.verdict, 'MAX_ITERATIONS', 'under budget 3 the budget fires FIRST (the prompt order)');
  eq(maxed.reason, 'MAX_ITERATIONS_REACHED', 'the budget machine reason');
  eq(maxed.iterationCount, 3, 'three iterations');
});

// ---- K-5 --------------------------------------------------------------------
test('K-5: plan validation — NOT_ACTIONABLE for a non-actionable agenda; INVALID_AGENDA for malformed records; INVALID_CAPABILITY for an unregistered capability; INVALID_OBJECT_FACTS inherits the E builder refusals', ()=>{
  const agenda = buildSemanticCorrectionAgenda(makeDeviation(), makeFacts());
  // malformed agendas (never even reach the actionability gate)
  const missingKey = JSON.parse(JSON.stringify(agenda)); delete missingKey.isActionable;
  const nullCapability = JSON.parse(JSON.stringify(agenda)); nullCapability.diagnosis.capabilityId = null;
  for (const [label, bad] of [
    ['null agenda', null],
    ['array agenda', [agenda]],
    ['missing key (isActionable)', missingKey],
    ['diagnosis without a capabilityId', nullCapability],
  ]){
    let threw = null;
    try { buildSemanticCorrectionPlan(bad, makeFacts()); } catch (e){ threw = e; }
    expect(threw, `${label}: refused`);
    expect(threw instanceof SemanticCorrectionError, `${label}: SemanticCorrectionError instance`);
    eq(threw.code, 'INVALID_AGENDA', `${label}: the INVALID_AGENDA code`);
  }
  // non-actionable agenda -> NOT_ACTIONABLE (the prompt's step-1 gate)
  const notActionable = JSON.parse(JSON.stringify(agenda));
  notActionable.isActionable = false;
  let naThrew = null;
  try { buildSemanticCorrectionPlan(notActionable, makeFacts()); } catch (e){ naThrew = e; }
  expect(naThrew && naThrew.code === 'NOT_ACTIONABLE', 'isActionable false -> NOT_ACTIONABLE');
  // an actionable agenda naming an UNREGISTERED capability -> INVALID_CAPABILITY
  const forged = JSON.parse(JSON.stringify(agenda));
  forged.diagnosis.capabilityId = 'cap-nope';
  let capThrew = null;
  try { buildSemanticCorrectionPlan(forged, makeFacts()); } catch (e){ capThrew = e; }
  expect(capThrew && capThrew.code === 'INVALID_CAPABILITY', 'unregistered capabilityId -> INVALID_CAPABILITY');
  // facts the E proposal builder refuses (null worldArea on the grow direction)
  let factsThrew = null;
  try { buildSemanticCorrectionPlan(agenda, makeFacts({ worldArea: null })); } catch (e){ factsThrew = e; }
  expect(factsThrew && factsThrew.code === 'INVALID_OBJECT_FACTS', 'the E builder fact refusals surface unchanged');
});

// ---- K-6 --------------------------------------------------------------------
test("K-6: plan contract — frozen, exactly the four declared keys, the content-derived 'scplan-<8hex>' id (independently recomputed), the byte-identical golden proposal, determinism", ()=>{
  const goldenDeviation = {
    id: 'dev-8305da82',
    category: 'semantic', property: 'role', expected: 'background', actual: 'shape',
    delta: null, tolerance: null, severity: 'error', objectId: GOLDEN_OID, targetRef: '$doc:' + GOLDEN_OID,
    message: `semantic role expectation violated: object '${GOLDEN_OID}' expected role 'background', observed role 'shape'`,
    confidence: 0.696,
    evidence: [],
  };
  const agenda = buildSemanticCorrectionAgenda(goldenDeviation, makeGoldenFacts());
  const plan = buildSemanticCorrectionPlan(agenda, makeGoldenFacts());
  deepEq(Object.keys(plan).sort(), ['agenda', 'expectedRegression', 'id', 'proposal'], 'exactly the four declared keys');
  deepFrozen(plan, 'plan');
  expect(/^scplan-[0-9a-f]{8}$/.test(plan.id), `id format: ${plan.id}`);
  // independent recomputation over the pinned {agendaId, proposalId} pair
  eq(plan.id, eContentId('scplan-', { agendaId: 'sct-86f52be0', proposalId: 'scp-f09b1135' }), 'content-derived plan id (no RNG, no wall clock)');
  eq(plan.proposal.id, 'scp-f09b1135', 'the golden proposal id');
  eq(JSON.stringify(plan.proposal), JSON.stringify(makeGoldenProposal()), 'byte-identical to the E-built golden proposal (the bridge is lossless)');
  eq(plan.agenda.target.id, 'sct-86f52be0', 'the agenda rides verbatim');
  eq(JSON.stringify(plan.agenda), JSON.stringify(agenda), 'the agenda record byte-identical');
  deepEq(plan.expectedRegression, { status: 'IMPROVED', reason: null }, 'the expected regression on a measured deviation');
  // determinism: a fresh agenda + fresh facts -> byte-identical plan
  const plan2 = buildSemanticCorrectionPlan(buildSemanticCorrectionAgenda(goldenDeviation, makeGoldenFacts()), makeGoldenFacts());
  eq(JSON.stringify(plan), JSON.stringify(plan2), 'byte-identical plans');
});

// ---- stub-kill-1 --------------------------------------------------------------
// KILLS: the shortcut "call it verified by trusting the execution result or the
// proposal's declared expectation instead of re-deriving the role". A T20 stub
// returning a FIXED role bypasses the real derivation chain entirely; the
// verification layer compares ONLY what the derivation chain returns, so a
// bypassed chain can never manufacture SATISFIED for target 'background'.
test('stub-kill-1: a T20 stub returning a fixed role can never produce SATISFIED — verification reports the honest VIOLATED (spec §68)', ()=>{
  const { fx, proposal, attempt, target } = runGoldenAttempt();
  eq(attempt.status, 'EXECUTED', 'the golden attempt really committed');
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width * fx.geometryStore.get(GOLDEN_GEOM_ID).params.height, 105000, 'the real store really mutated');
  eq(verifySemanticCorrectionAttempt(attempt, proposal, target, verifySubstrate(fx)).status, 'SATISFIED', 'control: the REAL derivation chain verifies SATISFIED');
  // the stub: a T20 that returns a FIXED role regardless of document state
  const stubRegistry = {
    has: id => id === 'T20',
    get: id => ({ validate: () => ({ valid: true, errors: [] }), execute: () => ({ success: true, output: { proposals: [{ objectId: target.objectId, proposedRole: 'shape', confidence: 0.99 }] } }) }),
  };
  const v = verifySemanticCorrectionAttempt(attempt, proposal, target, { ...verifySubstrate(fx), registry: stubRegistry });
  eq(v.status, 'VIOLATED', "the stubbed chain can never satisfy target 'background' (the killed shortcut)");
  eq(v.reason, 'ROLE_MISMATCH', 'the honest mismatch');
  eq(v.actualRole, 'shape', 'the stub-reported role is carried verbatim — never replaced by the expectation');
  eq(v.targetRole, 'background', 'the expectation unchanged');
});

// ---- stub-kill-2 --------------------------------------------------------------
// KILLS: the shortcut "report EXECUTED without committing" — a transaction
// executor stub that skips the commit leaves the stores unchanged and pushes
// nothing to history; the REAL post-commit re-derivation (B9) exposes the
// silent no-op as VIOLATED. Verification never trusts the attempt record.
test('stub-kill-2: an executor stub that skips the commit leaves the store unchanged; verification reports VIOLATED (spec §68)', ()=>{
  const fx = makeSubstrate();
  const proposal = makeGoldenProposal();
  const committedShapedFake = tx => ({ id: tx.id, inverse: { type: 'snapshot' }, diff: { added: [], removed: [], modified: [{ id: GOLDEN_GEOM_ID }] } });
  let stubInvocations = 0;
  fx.substrate.transactionManager = { execute: tx => { stubInvocations++; return committedShapedFake(tx); } };
  const attempt = executeSemanticCorrectionAttempt(proposal, fx.substrate);
  eq(stubInvocations, 1, 'the stub answered the one execute call');
  eq(attempt.status, 'EXECUTED', 'the stub REPORTS a commit');
  eq(attempt.transactionId, eContentId('atx-', { proposalId: proposal.id, capabilityId: proposal.capabilityId, iteration: 1 }), 'the record even carries the content-derived transaction id');
  // but NOTHING happened: no commit, no history, no event, no store change
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width, 200, 'the store is UNCHANGED (the commit was skipped)');
  eq(fx.historyManager.size(), 0, 'nothing pushed to history');
  eq(fx.eventBus.getHistory().filter(e => e.type === 'TransactionCommitted').length, 0, 'no commit event fired');
  // verification runs the REAL T20 over the ACTUAL committed state and catches the lie
  const v = verifySemanticCorrectionAttempt(attempt, proposal, makeGoldenTarget(), verifySubstrate(fx));
  eq(v.status, 'VIOLATED', 'the uncommitted mutation is exposed by the real re-derivation');
  eq(v.reason, 'ROLE_MISMATCH', 'the honest mismatch');
  eq(v.actualRole, 'shape', 'the real document still derives shape');
});

// ---- stub-kill-3 --------------------------------------------------------------
// KILLS: the shortcut "obtain whatever tool answers under the T06 key" — a
// registry that hands back a DIFFERENT tool breaks the proposal's grounding;
// the substituted tool's own validator refuses the T06-shaped input (the
// proposal.toolId mismatch) and the attempt fails ATOMICALLY: no commit, no
// history, no store change.
test("stub-kill-3: a registry answering the T06 key with a different tool fails the attempt's tool validation — proposal.toolId mismatch (spec §68)", ()=>{
  const fx = makeSubstrate();
  const differentTool = fx.registry.get('T07'); // apply_fill — a REAL, REGISTERED, different tool
  eq(differentTool.id, 'T07', 'the substituted tool is genuinely a different tool');
  const t06ShapedInput = { objectIds: [GOLDEN_OID], transform: { a: 2, b: 0, c: 0, d: 2, tx: 0, ty: 0 } };
  eq(fx.registry.validate('T07', t06ShapedInput, {}).valid, false, "the T06-shaped input fails the different tool's own validation (fill or opacity required)");
  fx.substrate.registry = {
    has: id => (id === 'T06' ? true : fx.registry.has(id)),
    get: id => (id === 'T06' ? differentTool : fx.registry.get(id)),
  };
  const attempt = executeSemanticCorrectionAttempt(makeGoldenProposal(), fx.substrate);
  eq(attempt.status, 'FAILED', 'the attempt failed validation');
  eq(attempt.error.code, 'EXECUTION_ERROR', 'the house failure envelope');
  expect(attempt.error.message.includes('fill or opacity required'), `the substituted tool's own refusal surfaced: ${attempt.error.message}`);
  expect(/^atx-[0-9a-f]{8}$/.test(attempt.transactionId), 'the attempt transaction id is still the derived one');
  eq(fx.geometryStore.get(GOLDEN_GEOM_ID).params.width, 200, 'stores untouched (atomic)');
  eq(fx.historyManager.size(), 0, 'nothing pushed (invariant 13)');
  eq(fx.eventBus.getHistory().filter(e => e.type === 'TransactionCommitted').length, 0, 'no commit event (invariant 16)');
});

// --- summary (house protocol) -------------------------------------------------
Promise.all(pending).then(()=>{
  console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
  if(failed>0) process.exit(1);
});
