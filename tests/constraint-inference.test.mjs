// ============================================================================
// PHASE 3.16 — CONSTRAINT INFERENCE + END-TO-END LOOP TESTS
// (tests/constraint-inference.test.mjs — the 3.16 counted suite)
// ============================================================================
// Harness protocol: identical to tests/correction.test.mjs / tests/ai.test.mjs
// (final "Tests: N total, M passed, F failed" line, exit 1 on failure). This
// file is run SEPARATELY from the 943-test counted suite (scripts/run-suite.sh
// keeps its 3.15 file list; the 3.16 surface is counted here — H-1 protocol:
// "943 counted + 5 gates" + "107 inference tests" = 1050 GREEN; M-18 (the
// spec §93 module-README pin) was added at H-1 FINAL, RED-first evidence
// scripts/phase3.16-evidence/3.16-HFINAL-m18-red.txt).
//
// CATEGORIES (107 tests):
//   A  (9)  Data Contracts        — T19 vocabulary + proposal/record shapes
//   B  (8)  T19 Vocabulary Mapping— utterance -> house constraint types
//   C  (4)  T19 Pass-Through      — canonical records pass through unchanged
//   D  (3)  Provenance & Confidence
//   E  (5)  No Mutation           — inference is read-only over its inputs
//   F  (3)  Determinism           — byte-identical outputs (Invariant 17)
//   G  (4)  Architecture Scans    — constraint-inference.js (new G-pattern)
//   H  (3)  Backward Compatibility— 3.13/3.14 module contracts unchanged
//   I  (8)  Planner Integration   — ai.js constraint-aware planning arms
//   J  (14) Evaluation Integration— evaluation.js constraint compliance arm
//   K  (14) Critic Integration    — critic.js constraint proposal pass
//   L  (14) Correction Loop Integration — constraint agendas through the
//                                 FROZEN 3.15 CorrectionEngine seams
//   M  (18) Golden Scenario + Properties P-1..P-7 + Final Architecture
//          Scans over the whole 3.16 surface (M-1..M-17) + the spec §93
//          module-README pin (M-18)
//
// THE A-2/D-8 INTERSECTION: T19-supported × implemented constraint types =
// {equalWidth, equalHeight, align, center}. T19 maps them onto the house
// vocabulary (constraints.js VALID_TYPES): equalWidth/equalHeight verbatim,
// align -> alignLeft/alignRight/alignTop/alignBottom, center ->
// alignCenterX/alignCenterY.
//
// THE GOLDEN SCENARIO (M-1, per §67): a column of three rectangles — left
// edges aligned (alignLeft), equal width (equalWidth), equal height
// (equalHeight, HARD/required). T19 infers the three constraints from the
// arrangement; they are accepted into the LIVE ConstraintStore; a REAL
// post-acceptance drift transaction (T05, +30px on the third rect) violates
// alignLeft; the host critic evaluates through the evaluation.js constraint
// arm; the critic constraint pass proposes the translate correction; the
// FROZEN 3.15 CorrectionEngine closes the loop through ONE independent
// correction transaction; the re-evaluation is clean; the verdict is
// VERIFIED. Every step is asserted with live evidence.
//
// ENGINE-EXECUTABILITY RULING (disclosed, the F-44 tradition): the 3.15
// derivation table (correction.js deriveForTool) carries rules ONLY for T05
// (position metrics) and T07 (opacity metrics); T06 (scale) is rule-less, so
// size-class constraint violations (equalWidth/equalHeight) are honestly
// UNFIXABLE through the engine (plan refusal INSUFFICIENT_EVIDENCE ->
// UNFIXABLE) and the critic's constraint pass proposes NOTHING for them
// (§28: the T06 origin-anchored scale mutates position as a side effect —
// no SAFE capability). Position-class violations (align/center pinned-axis
// errors) close the loop end-to-end. Surfaced as counted evidence (L-4/L-5/
// K-4/K-5), never patched.
//
// DETERMINISM NOTE (M-2): T01 creation ids are substrate uuid() entropy (the
// declared identity entropy of the substrate, not of the 3.16 surface). The
// two-run byte-identical proof normalizes the three creation uuids through
// the disclosed creation-order projection (OBJ-A/OBJ-B/OBJ-C, global string
// replacement) — every downstream content-derived id (session, plan, target,
// deviation, proposal, attempt transaction) hashes content that embeds those
// uuids, so the projection normalizes the whole chain deterministically.
// ============================================================================

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// --- the 3.16 surface under test -------------------------------------------
import * as T19 from '../src-js/constraint-inference.js';

// --- the modified 3.16 hosts (pinned import contracts; arms added in 3.16) --
import { createPlanningContext as gPlanningContext, createExpectedState as gCreateExpectedState,
  createPlan as gCreatePlan, validatePlan as gValidatePlan, compilePlanToDSL,
  verifyArrangementAgainstConstraints, verifyPlanStepsAgainstConstraints } from '../src-js/ai.js';
import { buildActualState as gBuildActualState, createEvaluationResult as gCreateEvaluationResult,
  validateEvaluationResult as liveValidateEvaluationResult, evaluate as liveEvaluate,
  EVALUATION_TOLERANCES as G_TOLERANCES } from '../src-js/evaluation.js';
import { proposeCorrections as regularProposeCorrections,
  validateCorrectionProposal as gValidateProposal, CriticError } from '../src-js/critic.js';

// --- the FROZEN 3.15 loop substrate (imported, never modified) --------------
import { createCorrectionTarget as bTarget, createCorrectionLoopPolicy as gCreatePolicy,
  validateCorrectionTarget as gValidateTarget, CorrectionEngine,
  scanCorrectionDependencies, evaluateCorrectionSafety, generateCorrectionPlan,
  resolveCorrectionDiagnosis, rankCorrectionStrategies, deriveCorrectionCommands,
  CONSTRAINT_PINNED_AXES, TOOL_MUTATION_AXES, CORRECTION_CAPABILITY_RECIPES,
  CATEGORY_TO_ROOT_CAUSE, CORRECTION_TARGET_CATEGORIES, executeCorrectionAttempt,
  rollbackCorrectionAttempt } from '../src-js/correction.js';

// --- the live document substrate --------------------------------------------
import { ToolRegistry, registerCoreTools } from '../src-js/tools.js';
import { TransactionBuilder, TransactionExecutor, HistoryManager, EventBus,
  createMoveObjectCommand, createUpdateGeometryCommand } from '../src-js/transaction.js';
import { SceneGraph } from '../src-js/scenegraph.js';
import { GeometryStore, AppearanceStore, ObjectStore } from '../src-js/stores.js';
import { ConstraintStore, VALID_TYPES as HOUSE_VALID_TYPES } from '../src-js/constraints.js';
import { parseDSL, validateDSL, compileToIR, DSLExecutor } from '../src-js/dsl.js';

// --- house runner (verbatim 3.15 pattern) ------------------------------------
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
function isUUIDFormat(id){ return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function jsonOf(v){ return JSON.stringify(v); }

// A deep clone taken BEFORE a call, compared AFTER — the no-mutation probe.
function unchangedAfter(fn, input, label){
  const before=clone(input);
  fn();
  deepEq(input, before, `${label}: input unchanged`);
}

// ============================================================================
// LIVE SUBSTRATE — the golden column (the §58/§61 assembly, 3.16 fixture)
// ============================================================================
// Three rectangles in a COLUMN: left edges aligned at x=100 (alignLeft),
// equal width 80 (equalWidth), equal height 60 (equalHeight). Creation runs
// through the REAL pipeline: Intent -> ExpectedState -> Plan -> validatePlan
// -> DSL -> IR -> Tool Registry -> Transaction -> Commit.

const G3_ARTBOARD = { width: 800, height: 600, centerX: 400, centerY: 300 };
const G3_X = 100, G3_W = 80, G3_H = 60;
const G3_YS = [100, 200, 300];
const G3_TOLERANCE = 1e-9;

async function g3Column(){
  const geometryStore=new GeometryStore(), appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:id=>geometryStore.has(id), hasAppearance:id=>appearanceStore.has(id)});
  const sceneGraph=new SceneGraph(), eventBus=new EventBus(), historyManager=new HistoryManager();
  const transactionManager=new TransactionExecutor({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus, historyManager);
  const registry=new ToolRegistry(); registerCoreTools(registry);
  const transactionBuilder=new TransactionBuilder();
  const docContext={ objectStore, geometryStore, appearanceStore, sceneGraph };
  const planCtx=gPlanningContext({ artboard: G3_ARTBOARD, objects: {} });
  const fills=['#FF0000', '#00FF00', '#0000FF'];
  const rects=[];
  for (let i=0;i<3;i++){
    const intent={ type:'create', objectType:'rectangle', width:G3_W, height:G3_H, x:G3_X, y:G3_YS[i], fill:fills[i] };
    const expectedState=gCreateExpectedState(intent, planCtx);
    const plan=gCreatePlan(intent, planCtx);
    const verdict=gValidatePlan(plan, planCtx);
    eq(verdict.valid, true, 'g3: the create plan validates against the planning context');
    const dslProgram=compilePlanToDSL(plan);
    const parsed=parseDSL(JSON.stringify(dslProgram));
    const dslVerdict=validateDSL(parsed.program, planCtx);
    eq(dslVerdict.valid, true, 'g3: the DSL program validates');
    const ir=compileToIR(parsed.program, planCtx);
    const execution=await new DSLExecutor().execute(ir.ir, { toolRegistry: registry, documentContext: { ...docContext, transactionManager } });
    const out=execution.outputs.find(o=>o.output && o.output.objectId);
    if(!out) throw new Error('g3: T01 produced no objectId — '+JSON.stringify(execution.errors));
    rects.push({ objectId: out.output.objectId, intent, expectedState, plan });
  }
  const objectIds=rects.map(r=>r.objectId);
  const constraintStore=new ConstraintStore();
  const geomParamsOf=(oid)=>geometryStore.get(objectStore.get(oid).geometryRef).params;
  const docEvalContext=()=>({ targets: objectIds.map(id=>({ objectId:id, targetRef:'$doc:'+id })) });
  const snapshot=()=>JSON.stringify({
    objects: objectIds.map(id=>objectStore.get(id)),
    geoms: objectIds.map(id=>geometryStore.get(objectStore.get(id).geometryRef)),
    apps: objectIds.map(id=>appearanceStore.get(objectStore.get(id).appearanceRef))
  });
  return { objectStore, geometryStore, appearanceStore, sceneGraph, eventBus, historyManager,
    transactionManager, registry, transactionBuilder, docContext, rects, objectIds,
    constraintStore, geomParamsOf, docEvalContext, snapshot, historyAfterCreation: historyManager.size(),
    substrate: { registry, transactionManager, transactionBuilder, sceneGraph } };
}

// The all-null ExpectedState: the constraint-agenda evaluation carries NO
// per-object desired-state expectation — the ACCEPTED CONSTRAINTS are the
// expectation (the post-acceptance drift model; §12 shape guard passes:
// status + the five sections).
function g3NullExpected(){
  return {
    intentId: 'constraint-agenda',
    status: 'requested',
    geometry: { width: null, height: null, rx: null, ry: null, area: null, symmetric: null },
    spatial: { aligned: null, centered: null, bbox: null },
    appearance: { fill: null, stroke: null, opacity: null },
    constraint: { satisfied: null },
    structure: { grouped: null }
  };
}
const G3_NULL_EXPECTED = Object.freeze(g3NullExpected());

// The host §23 critic (the F-43 host-adapter tradition, 3.16 form): the
// accepted constraint regime IS the desired state — the critic declares it in
// the ExpectedState's constraint.satisfied compliance request and the LIVE
// evaluate() runs the 3.16 internal compliance arm natively (§12 record
// assembled by the engine itself; zero host-side record surgery).
function g3Critic(g){
  const calls=[];
  return {
    calls,
    evaluate(document, context){
      calls.push({ document, context });
      const expected={ ...G3_NULL_EXPECTED, constraint:{ satisfied:{ records: g.constraintStore.list(), tolerance: G3_TOLERANCE } } };
      const result=liveEvaluate(expected, document, context);
      const v=liveValidateEvaluationResult(result);
      eq(v.valid, true, 'g3Critic: a valid LIVE §12 EvaluationResult');
      return result;
    }
  };
}

// The T19 arrangement request for the golden column (creation-order ids).
function g3ObjectSpecs(g){
  return g.objectIds.map((id,i)=>({ id, x:G3_X, y:G3_YS[i], width:G3_W, height:G3_H }));
}

// Accept a T19 proposal set into the LIVE ConstraintStore (the acceptance step).
function g3Accept(g, proposals){
  for (const p of proposals){
    g.constraintStore.create(T19.toHouseConstraintRecord(p));
  }
  return g.constraintStore.list();
}

// The post-acceptance drift: a REAL transaction (never a store write).
function g3Drift(g, dx, dy, objectId, txId){
  const before=g.historyManager.size();
  const tx=new TransactionBuilder().begin({ source:'fixture', description:'post-acceptance drift', id: txId || 'tx-drift-g3' })
    .addCommand(createMoveObjectCommand({ objectId: objectId || g.objectIds[2], dx, dy })).build();
  g.transactionManager.execute(tx);
  return { tx, id: tx.id, before, after: g.historyManager.size() };
}

// The constraint agenda target derived from a constraint deviation record
// (the host translation of the critic proposal into the §7 agenda).
function g3TargetFromConstraintDeviation(cd){
  return bTarget({
    category: 'POSITION',
    objectIds: [cd.violatedObjectId],
    metric: cd.property,
    observedValue: cd.actual,
    targetValue: cd.expected,
    severity: 'HIGH',
    confidence: 0.9,
    evidence: [{ type: 'CONSTRAINT', source: 'constraint-inference', constraintId: cd.constraintId, constraintType: cd.type, objectIds: [...cd.objectIds], value: cd.actual }]
  });
}

// The full golden flow (M-1): creation -> inference -> acceptance -> drift ->
// evaluation -> critique -> loop -> verified. Returns the 11-item evidence
// bundle verbatim.
async function mGolden(){
  const g=await g3Column();
  const historyAfterCreation=g.historyManager.size();
  const creationSnapshot=g.snapshot();

  // ① initial document state (post-creation, pre-inference)
  const initialGeometry=g.objectIds.map(id=>({ ...g.geomParamsOf(id) }));

  // ② T19 proposal set
  const inference=T19.inferConstraints({
    utterance: 'three equal-size rectangles with left edges aligned',
    objects: g3ObjectSpecs(g)
  });

  // ③ accepted constraint records (LIVE ConstraintStore) — the fixture pins
  // equalHeight to REQUIRED (the user's hardening act; T19 itself never
  // infers hard constraints), giving the loop a real hard record to preserve
  const records=inference.proposals.map(p=>clone(T19.toHouseConstraintRecord(p)));
  for(const rec of records){ if(rec.type==='equalHeight') rec.strength='required'; }
  for(const rec of records) g.constraintStore.create(rec);
  const accepted=g.constraintStore.list();

  // ④ Planner output: the creation ExpectedStates + Plans (the pipeline leg
  // that produced the arrangement) — captured per rect in g.rects.

  // the post-acceptance drift — the FIRST transaction after acceptance
  const drift=g3Drift(g, 30, 0);
  const driftGeometry=g.objectIds.map(id=>({ ...g.geomParamsOf(id) }));

  // ⑥ the pre-loop EvaluationResult (deviations + metadata.constraintDeviations)
  const critic=g3Critic(g);
  const initialEvaluation=critic.evaluate(g.docContext, g.docEvalContext());

  // ⑦ the Critic constraint proposals (the constraint rule INSIDE the §23
  // proposeCorrections rule engine — the 6-export critic surface is pinned)
  const critique=regularProposeCorrections(initialEvaluation);

  // the agenda (§7) from the constraint deviation provenance
  const cd=initialEvaluation.metadata.constraintDeviations[0];
  const agendaTarget=g3TargetFromConstraintDeviation(cd);

  // ⑧ the Correction Loop
  const request={
    rootIntentId: 'intent-g3', rootTransactionId: 'tx-root-g3',
    targets: [agendaTarget],
    policy: gCreatePolicy({}), mode: 'AUTO',
    critic, document: g.docContext, evaluationContext: g.docEvalContext(),
    planningContext: { constraints: accepted },
    substrate: g.substrate
  };
  const done=CorrectionEngine.run(CorrectionEngine.start(request));

  // ⑨⑩⑪ read out of the terminated engine + the live substrate
  const correctionTxId=done.session.corrections.length>0 ? done.session.corrections[0].transactionId : null;
  const reEvaluation=done.session.currentEvaluation;

  return { g, inference, accepted, drift, driftGeometry, critic, initialEvaluation, critique,
    agendaTarget, request, done, correctionTxId, reEvaluation,
    initialGeometry, historyAfterCreation, creationSnapshot };
}

// A minimal live fixture for the J/K unit surfaces (real stores, real
// buildActualState — the arm consumes REAL snapshots, never hand-waved
// shapes). specs: [{id, x, y, width, height}] (rects, identity transform).
function mDoc(specs){
  const geometryStore=new GeometryStore(), appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:id=>geometryStore.has(id), hasAppearance:id=>appearanceStore.has(id)});
  const sceneGraph=new SceneGraph(), eventBus=new EventBus(), historyManager=new HistoryManager();
  const transactionManager=new TransactionExecutor({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus, historyManager);
  const registry=new ToolRegistry(); registerCoreTools(registry);
  const geomIdOf=(id)=>'b'+id.slice(1);   // UUID-format derived ids (the live stores validate)
  const appIdOf=(id)=>'c'+id.slice(1);
  for (const s of specs){
    geometryStore.create(geomIdOf(s.id), {type:'rect', params:{x:s.x, y:s.y, width:s.width, height:s.height, rx:0, ry:0}});
    appearanceStore.create({id:appIdOf(s.id), stack:[]});
    objectStore.create({id:s.id, geometryRef:geomIdOf(s.id), appearanceRef:appIdOf(s.id), meta:{name:s.id, locked:false, visible:true, selectable:true}});
    const root=sceneGraph.createRoot();
    sceneGraph.createNode(s.id, root.id);
  }
  const docContext={ objectStore, geometryStore, appearanceStore, sceneGraph };
  const evaluationContext={ targets: specs.map(s=>({ objectId:s.id, targetRef:'$doc:'+s.id })) };
  const actualState=()=>gBuildActualState(docContext, evaluationContext);
  return { objectStore, geometryStore, appearanceStore, sceneGraph, docContext, evaluationContext, actualState, geomIdOf, appIdOf,
    geomParamsOf:(id)=>geometryStore.get(objectStore.get(id).geometryRef).params };
}

// Constraint fixture builder: house records over a role list, deterministic
// ids, canonical shape (the same shape the LIVE ConstraintStore round-trips).
function mConstraint(type, objectIds, opts={}){
  return { id: opts.id || ('c-fix-'+type), type, objectIds: [...objectIds], enabled: opts.enabled!==false,
    strength: opts.strength || 'strong', source: 'ai', parameters: opts.parameters || {},
    provenance: { t19Type: 'x', inferredBy: 'T19' } };
}

console.log('=== PHASE 3.16 Category A: Data Contracts (9 tests) ===');

test('A-1: T19_SUPPORTED_TYPES is exactly the A-2/D-8 intersection {equalWidth, equalHeight, align, center} — frozen', ()=>{
  deepEq([...T19.T19_SUPPORTED_TYPES], ['equalWidth','equalHeight','align','center'], 'the intersection vocabulary');
  expect(Object.isFrozen(T19.T19_SUPPORTED_TYPES), 'vocabulary frozen');
});

test('A-2: T19_HOUSE_MAPPING — frozen, complete: every T19 type maps >=1 house type; align covers the four edges; center covers both center axes', ()=>{
  const m=T19.T19_HOUSE_MAPPING;
  expect(Object.isFrozen(m), 'mapping frozen');
  deepEq(m.equalWidth, ['equalWidth'], 'equalWidth maps verbatim');
  deepEq(m.equalHeight, ['equalHeight'], 'equalHeight maps verbatim');
  deepEq(m.align, ['alignLeft','alignRight','alignTop','alignBottom'], 'align covers the four edges');
  deepEq(m.center, ['alignCenterX','alignCenterY'], 'center covers both center axes');
  for(const t of T19.T19_SUPPORTED_TYPES) expect(Array.isArray(m[t]) && m[t].length>0, `${t} maps to house types`);
});

test('A-3: validateInferenceRequest accepts the golden request shape {utterance, objects[>=2], strength?} and returns {valid:true, errors:[]}', ()=>{
  const req={ utterance: 'three equal-size rectangles with left edges aligned',
    objects: [{id:'a'},{id:'b'},{id:'c'}] };
  const v=T19.validateInferenceRequest(req);
  eq(v.valid, true, 'valid');
  deepEq(v.errors, [], 'no errors');
});

test('A-4: validateInferenceRequest deterministic refusals — non-object, missing/non-string utterance, <2 objects, non-string ids, function values, invalid strength', ()=>{
  expect(T19.validateInferenceRequest(null).valid===false, 'null refused');
  expect(T19.validateInferenceRequest('x').valid===false, 'string refused');
  expect(T19.validateInferenceRequest({objects:[{id:'a'},{id:'b'}]}).valid===false, 'missing utterance refused');
  expect(T19.validateInferenceRequest({utterance:'x', objects:[{id:'a'},{id:'b'}], strength:'required'}).valid===false, 'T19 never infers hard constraints: required refused');
  expect(T19.validateInferenceRequest({utterance:7, objects:[{id:'a'},{id:'b'}]}).valid===false, 'non-string utterance refused');
  expect(T19.validateInferenceRequest({utterance:'x', objects:[{id:'a'}]}).valid===false, 'single object refused (constraints need >=2)');
  expect(T19.validateInferenceRequest({utterance:'x', objects:['a','b']}).valid===false, 'non-entry objects refused');
  expect(T19.validateInferenceRequest({utterance:'x', objects:[{id:1},{id:'b'}]}).valid===false, 'non-string id refused');
  const fnReq={ utterance:'x', objects:[{id:'a', toJSON(){}} ,{id:'b'}] };
  expect(T19.validateInferenceRequest(fnReq).valid===false, 'function-valued entry refused');
});

test('A-5: inferConstraints output shape — exact proposal key set, frozen plain data, unmatched honesty list', ()=>{
  const out=T19.inferConstraints({ utterance:'equal width', objects:[{id:'a'},{id:'b'}] });
  deepEq(Object.keys(out).sort(), ['proposals','unmatched'], 'exact result key set');
  for(const p of out.proposals){
    deepEq(Object.keys(p).sort(), [...T19.T19_PROPOSAL_KEYS].sort(), 'exact proposal key set');
  }
  deepFrozen(out, 'inferConstraints result');
  const none=T19.inferConstraints({ utterance:'make it pretty', objects:[{id:'a'},{id:'b'}] });
  deepEq(none.proposals, [], 'no invention: unrecognized utterance yields zero proposals');
  deepEq(none.unmatched, ['make it pretty'], 'the unmapped span is reported honestly');
});

test('A-6: proposal ids are content-derived UUID-v4-FORMAT strings and are accepted by the LIVE ConstraintStore (create -> list round-trip)', ()=>{
  const out=T19.inferConstraints({ utterance:'equal width and align left', objects:[{id:'a'},{id:'b'}] });
  expect(out.proposals.length>=2, 'two proposals inferred');
  for(const p of out.proposals){
    expect(isUUIDFormat(p.id), `proposal id is UUID-v4 format: ${p.id}`);
  }
  const store=new ConstraintStore();
  for(const p of out.proposals) store.create(T19.toHouseConstraintRecord(p));
  eq(store.size(), out.proposals.length, 'the LIVE store accepted every record');
  const listed=store.list();
  deepEq(listed.map(r=>r.id).sort(), [...out.proposals.map(p=>p.id)].sort(), 'the id chain survives into the store');
});

test('A-7: toHouseConstraintRecord — exact house shape, house type within the live constraints.js vocabulary, enabled:true, source ai', ()=>{
  const out=T19.inferConstraints({ utterance:'equal width', objects:[{id:'a'},{id:'b'}] });
  const rec=T19.toHouseConstraintRecord(out.proposals[0]);
  deepEq(Object.keys(rec).sort(), ['enabled','id','objectIds','parameters','provenance','source','strength','type'].sort(), 'exact house key set');
  eq(rec.type, 'equalWidth', 'house type');
  eq(rec.enabled, true, 'enabled');
  eq(rec.source, 'ai', 'the T19 provenance source');
  deepEq(rec.objectIds, ['a','b'], 'participant order preserved (first = reference)');
  expect(HOUSE_VALID_TYPES.has(rec.type), 'the house type is in the LIVE constraints.js VALID_TYPES');
  deepFrozen(rec, 'house record');
});

test('A-8: validateHouseConstraintRecord refusals — missing keys, unknown type, bad strength, bad id format, non-array objectIds', ()=>{
  const base={ id:'11111111-1111-4111-8111-111111111111', type:'alignLeft', objectIds:['a','b'], enabled:true, strength:'strong', source:'ai', parameters:{} };
  eq(T19.validateHouseConstraintRecord(base).valid, true, 'the canonical base validates');
  for(const [label, mutate] of [
    ['missing type', r=>{ delete r.type; }],
    ['unknown type', r=>{ r.type='centerAll'; }],
    ['bad strength', r=>{ r.strength='hard'; }],
    ['bad id format', r=>{ r.id='c-1'; }],
    ['non-array objectIds', r=>{ r.objectIds='a,b'; }],
    ['missing enabled', r=>{ delete r.enabled; }]
  ]){
    const r=clone(base); mutate(r);
    eq(T19.validateHouseConstraintRecord(r).valid, false, `refused: ${label}`);
  }
});

test('A-9: every 3.16 inference-surface output is deep-frozen (proposals, house records, validator verdicts are plain data)', ()=>{
  const out=T19.inferConstraints({ utterance:'equal height', objects:[{id:'a'},{id:'b'}] });
  deepFrozen(out, 'inference output');
  deepFrozen(T19.toHouseConstraintRecord(out.proposals[0]), 'house record');
  deepFrozen(T19.validateInferredConstraint(out.proposals[0]), 'proposal verdict');
  deepFrozen(T19.validateHouseConstraintRecord(T19.toHouseConstraintRecord(out.proposals[0])), 'record verdict');
});

console.log('=== PHASE 3.16 Category B: T19 Vocabulary Mapping (8 tests) ===');

test('B-1: equal width is inferred as T19 equalWidth mapped to the house equalWidth type over ALL participants (reference = first)', ()=>{
  const out=T19.inferConstraints({ utterance:'make these equal width', objects:[{id:'a'},{id:'b'},{id:'c'}] });
  eq(out.proposals.length, 1, 'one proposal');
  const p=out.proposals[0];
  eq(p.t19Type, 'equalWidth', 't19 type');
  eq(p.houseType, 'equalWidth', 'house type');
  deepEq(p.objectIds, ['a','b','c'], 'all participants, input order');
});

test('B-2: equal height is inferred as T19 equalHeight mapped to the house equalHeight type', ()=>{
  const out=T19.inferConstraints({ utterance:'same height for the row', objects:[{id:'a'},{id:'b'}] });
  eq(out.proposals.length, 1, 'one proposal');
  eq(out.proposals[0].t19Type, 'equalHeight', 't19 type');
  eq(out.proposals[0].houseType, 'equalHeight', 'house type');
});

test('B-3: the align family — left/right/top/bottom phrasings map to alignLeft/alignRight/alignTop/alignBottom with the fixed edge semantics', ()=>{
  const cases=[
    ['align the left edges', 'alignLeft', 'align left edges'],
    ['align the right edges', 'alignRight', 'align right edges'],
    ['align the top edges', 'alignTop', 'align top edges'],
    ['align the bottom edges', 'alignBottom', 'align bottom edges']
  ];
  for(const [utterance, house] of cases){
    const out=T19.inferConstraints({ utterance, objects:[{id:'a'},{id:'b'}] });
    eq(out.proposals.length, 1, `${utterance}: one proposal`);
    eq(out.proposals[0].t19Type, 'align', `${utterance}: t19 type align`);
    eq(out.proposals[0].houseType, house, `${utterance}: house type`);
  }
});

test('B-4: center phrasings — horizontally maps to alignCenterX, vertically to alignCenterY (single-axis centering)', ()=>{
  const hx=T19.inferConstraints({ utterance:'centered horizontally', objects:[{id:'a'},{id:'b'}] });
  eq(hx.proposals.length, 1, 'one proposal');
  eq(hx.proposals[0].houseType, 'alignCenterX', 'horizontal centering');
  const vy=T19.inferConstraints({ utterance:'centered vertically', objects:[{id:'a'},{id:'b'}] });
  eq(vy.proposals.length, 1, 'one proposal');
  eq(vy.proposals[0].houseType, 'alignCenterY', 'vertical centering');
});

test('B-5: unqualified centered maps to BOTH center axes — two proposals, deterministic order (alignCenterX then alignCenterY)', ()=>{
  const out=T19.inferConstraints({ utterance:'centered', objects:[{id:'a'},{id:'b'}] });
  eq(out.proposals.length, 2, 'both axes');
  deepEq(out.proposals.map(p=>p.houseType), ['alignCenterX','alignCenterY'], 'deterministic x-then-y order');
});

test('B-6: unsupported vocabulary is honestly unmapped — zero proposals invented, the span reported in unmatched', ()=>{
  const out=T19.inferConstraints({ utterance:'make them magnetic and equally rotated', objects:[{id:'a'},{id:'b'}] });
  deepEq(out.proposals, [], 'no invention');
  deepEq(out.unmatched, ['make them magnetic and equally rotated'], 'the whole span is unmapped');
});

test('B-7: multi-phrase utterances produce the deterministic full set in fixed table order (equal width + align left)', ()=>{
  const out=T19.inferConstraints({ utterance:'equal width, and align the left edges', objects:[{id:'a'},{id:'b'}] });
  eq(out.proposals.length, 2, 'two constraints');
  deepEq(out.proposals.map(p=>p.t19Type), ['equalWidth','align'], 'table order');
  deepEq(out.proposals.map(p=>p.houseType), ['equalWidth','alignLeft'], 'house mapping');
  const again=T19.inferConstraints({ utterance:'equal width, and align the left edges', objects:[{id:'a'},{id:'b'}] });
  deepEq(again.proposals.map(p=>p.id), out.proposals.map(p=>p.id), 'the same utterance yields the same proposals');
});

test('B-8: the mapping closes onto the LIVE house vocabulary — every inferred houseType is in constraints.js VALID_TYPES, and paraphrases of the same logical constraint yield the SAME content-derived id', ()=>{
  const utterances=['equal width', 'same width'];
  const ids=utterances.map(u=>T19.inferConstraints({ utterance:u, objects:[{id:'a'},{id:'b'}] }).proposals[0].id);
  eq(ids[0], ids[1], 'paraphrase identity: same logical constraint, same id');
  const every=T19.inferConstraints({ utterance:'equal width, equal height, align the left edges, align the right edges, align the top edges, align the bottom edges, centered horizontally, centered vertically',
    objects:[{id:'a'},{id:'b'}] });
  expect(every.proposals.length>=8, 'the full sweep infers the mapped set');
  for(const p of every.proposals){
    expect(HOUSE_VALID_TYPES.has(p.houseType), `house type ${p.houseType} is live vocabulary`);
  }
});

console.log('=== PHASE 3.16 Category C: T19 Pass-Through (4 tests) ===');

test('C-1: an already-canonical house record validates unchanged — validateHouseConstraintRecord is a pure shape verdict (no transformation, no re-id)', ()=>{
  const canonical={ id:'22222222-2222-4222-8222-222222222222', type:'fixedDistance', objectIds:['a','b'],
    enabled:true, strength:'weak', source:'user', parameters:{ distance: 42 } };
  const v=T19.validateHouseConstraintRecord(canonical);
  eq(v.valid, true, 'canonical record valid');
  unchangedAfter(()=>T19.validateHouseConstraintRecord(canonical), canonical, 'validator');
  deepEq(clone(canonical), canonical, 'byte-identical content');
});

test('C-2: canonical records of ALL eleven house types pass validation — the pass-through surface covers the full live vocabulary, not just the T19 subset', ()=>{
  const types=['horizontal','vertical','alignLeft','alignRight','alignTop','alignBottom','alignCenterX','alignCenterY','equalWidth','equalHeight','fixedDistance'];
  for(const type of types){
    const rec={ id:'33333333-3333-4333-8333-333333333333', type, objectIds:['a','b'], enabled:true,
      strength:'strong', source:'user', parameters: type==='fixedDistance' ? { distance: 10 } : {} };
    const v=T19.validateHouseConstraintRecord(rec);
    eq(v.valid, true, `${type}: canonical record validates`);
  }
});

test('C-3: the acceptance chain preserves identity — the house record id EQUALS the proposal id (no re-id through toHouseConstraintRecord)', ()=>{
  const out=T19.inferConstraints({ utterance:'align the left edges', objects:[{id:'a'},{id:'b'}] });
  const p=out.proposals[0];
  const rec=T19.toHouseConstraintRecord(p);
  eq(rec.id, p.id, 'id preserved verbatim');
  eq(rec.type, p.houseType, 'type is the mapped house type');
  deepEq(rec.objectIds, p.objectIds, 'participants preserved verbatim');
  eq(rec.strength, p.strength, 'strength preserved verbatim');
});

test('C-4: canonical records round-trip the LIVE ConstraintStore byte-identically — the store is the acceptance authority and the 3.16 records are first-class citizens', ()=>{
  const store=new ConstraintStore();
  const rec={ id:'44444444-4444-4444-8444-444444444444', type:'equalWidth', objectIds:['a','b'], enabled:true,
    strength:'strong', source:'ai', parameters:{}, provenance:{ t19Type:'equalWidth', inferredBy:'T19' } };
  store.create(rec);
  const listed=store.list();
  eq(listed.length, 1, 'stored');
  deepEq(listed[0], rec, 'byte-identical round-trip (the provenance field is tolerated)');
  // the constraint-arm and gate surfaces consume exactly these plain records
  const scan=scanCorrectionDependencies(['a'], { constraints: listed });
  eq(scan.scanned.constraints, true, 'the loop scan reads the store-list shape');
  eq(scan.constraints.length, 1, 'the touching record is reported');
});

console.log('=== PHASE 3.16 Category D: Provenance & Confidence (3 tests) ===');

test('D-1: every proposal carries deterministic provenance {phrase, rule} with rule = T19:<t19Type> and the phrase traceable in the utterance', ()=>{
  const utterance='equal width, and align the left edges';
  const out=T19.inferConstraints({ utterance, objects:[{id:'a'},{id:'b'}] });
  for(const p of out.proposals){
    deepEq(Object.keys(p.provenance).sort(), ['phrase','rule'].sort(), 'exact provenance key set');
    eq(p.provenance.rule, 'T19:'+p.t19Type, 'rule names the T19 type');
    expect(utterance.toLowerCase().includes(p.provenance.phrase), `the phrase '${p.provenance.phrase}' occurs in the utterance`);
  }
});

test('D-2: confidence is rule-derived, in (0,1], constant 1 for exact phrase matches, and deterministic across runs', ()=>{
  const run=()=>T19.inferConstraints({ utterance:'equal width and centered', objects:[{id:'a'},{id:'b'}] }).proposals.map(p=>p.confidence);
  const a=run(), b=run();
  deepEq(a, b, 'deterministic');
  for(const c of a){ expect(typeof c==='number' && c>0 && c<=1, `confidence ${c} in (0,1]`); eq(c, 1, 'exact-phrase confidence is 1'); }
});

test('D-3: the provenance survives acceptance — the house record embeds {t19Type, inferredBy:\'T19\'} so the audit trail reaches the loop seams', ()=>{
  const out=T19.inferConstraints({ utterance:'equal height', objects:[{id:'a'},{id:'b'}] });
  const rec=T19.toHouseConstraintRecord(out.proposals[0]);
  deepEq(Object.keys(rec.provenance).sort(), ['inferredBy','t19Type'].sort(), 'the record provenance key set');
  eq(rec.provenance.inferredBy, 'T19', 'the inference origin');
  eq(rec.provenance.t19Type, out.proposals[0].t19Type, 'the t19 type');
  // and it rides through the LIVE store into the seam shape
  const store=new ConstraintStore(); store.create(rec);
  eq(store.list()[0].provenance.inferredBy, 'T19', 'the trail survives the store');
});

console.log('=== PHASE 3.16 Category E: No Mutation (5 tests) ===');

test('E-1: inferConstraints does not mutate the request record', ()=>{
  const req={ utterance:'equal width and align the top edges', objects:[{id:'a', x:1, y:2},{id:'b', x:3, y:4}], strength:'weak' };
  unchangedAfter(()=>T19.inferConstraints(req), req, 'request');
});

test('E-2: inferConstraints does not mutate the objects array or its entries (including entry order and nested values)', ()=>{
  const objects=[{id:'a', x:10, y:0, width:80, height:60},{id:'b', x:10, y:200, width:80, height:60}];
  const arrClone=clone(objects);
  T19.inferConstraints({ utterance:'equal width', objects });
  deepEq(objects, arrClone, 'objects unchanged');
  eq(objects.length, 2, 'array length unchanged');
});

test('E-3: toHouseConstraintRecord does not mutate the proposal (the acceptance path is read-only over its source)', ()=>{
  const out=T19.inferConstraints({ utterance:'align the left edges', objects:[{id:'a'},{id:'b'}] });
  const p=out.proposals[0];
  const before=clone(p);
  T19.toHouseConstraintRecord(p);
  deepEq(p, before, 'proposal unchanged');
});

test('E-4: the validators never mutate their inputs (request, proposal, house record)', ()=>{
  const req={ utterance:'equal width', objects:[{id:'a'},{id:'b'}] };
  unchangedAfter(()=>T19.validateInferenceRequest(req), req, 'request validator');
  const out=T19.inferConstraints(req);
  const p=out.proposals[0];
  unchangedAfter(()=>T19.validateInferredConstraint(p), p, 'proposal validator');
  const rec=T19.toHouseConstraintRecord(p);
  unchangedAfter(()=>T19.validateHouseConstraintRecord(rec), rec, 'record validator');
});

test('E-5: acceptance is alias-free — the LIVE ConstraintStore record, the frozen house record, and every store read are independent deep structures (no aliasing in any direction)', ()=>{
  const out=T19.inferConstraints({ utterance:'equal width', objects:[{id:'a'},{id:'b'}] });
  const rec=T19.toHouseConstraintRecord(out.proposals[0]);
  const store=new ConstraintStore(); store.create(rec);
  // the accepted record is deep-frozen AND independent of the store's internals
  expect(Object.isFrozen(rec.objectIds), 'the house record is frozen');
  const first=store.list()[0];
  first.objectIds.push('d');
  eq(store.list()[0].objectIds.length, 2, 'a store read is a clone: mutating it cannot bleed back in');
  deepEq(first.objectIds, ['a','b','d'], 'the first read carried only its own mutation');
  deepEq(rec.objectIds, ['a','b'], 'the source record unaffected by the store-read mutation');
  eq(store.list()[0].id, rec.id, 'the identity chain holds');
});

console.log('=== PHASE 3.16 Category F: Determinism (3 tests) ===');

test('F-1: inferConstraints — identical requests yield byte-identical outputs (ids, provenance, order), Invariant 17 face', ()=>{
  const req={ utterance:'equal width, equal height, align the left edges, centered', objects:[{id:'a'},{id:'b'},{id:'c'}] };
  deepEq(jsonOf(T19.inferConstraints(req)), jsonOf(T19.inferConstraints(clone(req))), 'byte-identical inference');
});

test('F-2: toHouseConstraintRecord + the validators are byte-identical across runs', ()=>{
  const req={ utterance:'align the top edges', objects:[{id:'a'},{id:'b'}] };
  const p=T19.inferConstraints(req).proposals[0];
  deepEq(jsonOf(T19.toHouseConstraintRecord(p)), jsonOf(T19.toHouseConstraintRecord(clone(p))), 'house record byte-identical');
  deepEq(jsonOf(T19.validateInferredConstraint(p)), jsonOf(T19.validateInferredConstraint(clone(p))), 'proposal verdict byte-identical');
});

test('F-3: content identity is key-order-insensitive — permuting the KEY ORDER inside object entries and the request yields identical inference output (stable canonicalization)', ()=>{
  const a=T19.inferConstraints({ utterance:'equal width', objects:[{id:'a', x:1, y:2},{id:'b', x:3, y:4}] });
  const b=T19.inferConstraints({ objects:[{y:2, x:1, id:'a'},{y:4, x:3, id:'b'}], utterance:'equal width' });
  deepEq(jsonOf(a), jsonOf(b), 'key-order permuted input, identical output');
});

console.log('=== PHASE 3.16 Category G: Architecture Scans — constraint-inference.js (4 tests) ===');

// The G-pattern harness (verbatim 3.13/3.14/3.15 stripper discipline).
function stripCommentsAndStrings(src){
  let out=''; let mode='code'; const frames=[]; const n=src.length; let i=0;
  while(i<n){
    const c=src[i], d=i+1<n?src[i+1]:'';
    if(mode==='code'){
      if(c==='/'&&d==='/'){mode='line';out+='  ';i+=2;continue;}
      if(c==='/'&&d==='*'){mode='block';out+='  ';i+=2;continue;}
      if(c==="'"){mode='squote';out+=' ';i+=1;continue;}
      if(c==='"'){mode='dquote';out+=' ';i+=1;continue;}
      if(c==='`'){mode='template';out+=' ';i+=1;continue;}
      if(frames.length>0){
        if(c==='{'){frames[frames.length-1].braceDepth+=1;}
        else if(c==='}'){const f=frames[frames.length-1]; if(f.braceDepth===0){frames.pop();mode='template';out+=' ';i+=1;continue;} f.braceDepth-=1;}
      }
      out+=c;i+=1;continue;
    }
    if(mode==='line'){ if(c==='\n'){mode='code';out+='\n';}else{out+=' ';} i+=1;continue; }
    if(mode==='block'){ if(c==='*'&&d==='/'){mode='code';out+='  ';i+=2;}else{out+=(c==='\n'?'\n':' ');i+=1;} continue; }
    if(c==='\\'){out+='  ';i+=2;continue;}
    if(mode==='squote'&&c==="'"){mode='code';out+=' ';i+=1;continue;}
    if(mode==='dquote'&&c==='"'){mode='code';out+=' ';i+=1;continue;}
    if(mode==='template'){
      if(c==='`'){mode='code';out+=' ';i+=1;continue;}
      if(c==='$'&&d==='{'){frames.push({braceDepth:0});mode='code';out+='  ';i+=2;continue;}
      out+=(c==='\n'?'\n':' ');i+=1;continue;
    }
    out+=(c==='\n'?'\n':' ');i+=1;
  }
  return out;
}
function collectImportLines(src){ return src.split('\n').filter(l=>/^\s*import\b/.test(l)||/\brequire\s*\(/.test(l)||/\bimport\s*\(/.test(l)); }
function importSpecifiersOf(src){
  const specs=[];
  for(const line of collectImportLines(src)){
    const m=line.match(/from\s*['"]([^'"]+)['"]/)||line.match(/import\s+['"]([^'"]+)['"]/);
    if(m) specs.push(m[1]);
  }
  return specs;
}
// Multi-line-import-aware collector for THIS file's own import discipline
// (M-10/M-11/M-12): matches from-clauses on every line, so wrapped import
// statements are swept too.
function importSpecifiersOfAll(src){
  const specs=[];
  for(const line of src.split('\n')){
    const m=line.match(/from\s*['"]([^'"]+)['"]/)||line.match(/^\s*import\s+['"]([^'"]+)['"]/);
    if(m) specs.push(m[1]);
  }
  return specs;
}
const T19_SRC=readFileSync(new URL('../src-js/constraint-inference.js', import.meta.url), 'utf-8');
const T19_STRIPPED=stripCommentsAndStrings(T19_SRC);
const T19_CAP_WORDS=['window','document','fetch','eval','Function','globalThis','process','fs','localStorage','require','Date','Math.random'];
const T19_MUT_RE=/\.(write|set|execute|commit|rollback|register|unregister|insert|remove|update|delete|create|render|invalidate)\s*\(/g;

test('G-1: constraint-inference.js ZERO-import pin — no import declarations at all, no dynamic module escape (require( / import() in the code body)', ()=>{
  eq(importSpecifiersOf(T19_SRC).length, 0, 'the zero-import pin: the module declares NO imports');
  const dyn=[...T19_STRIPPED.matchAll(/\brequire\s*\(/g), ...T19_STRIPPED.matchAll(/\bimport\s*\(/g)];
  eq(dyn.length, 0, 'no dynamic module escape in the code body');
});

test('G-2: constraint-inference.js code body reaches no capability surface — window/document/fetch/eval/Function/globalThis/process/fs/localStorage/require/Date.now/Math.random absent (alias-form word-boundary scan on the stripped body)', ()=>{
  for(const w of T19_CAP_WORDS){
    const hits=T19_STRIPPED.match(new RegExp('\\b'+w+'\\b','g'))||[];
    eq(hits.join(','), '', `no ${w} in the stripped code body`);
  }
  const rawRandom=T19_SRC.match(/Math\.random|Date\.now/g)||[];
  eq(rawRandom.length, 0, 'no entropy source even in raw text (ids are content-derived)');
});

test('G-3: constraint-inference.js calls no mutation method — the full substrate mutation vocabulary is absent from the stripped body (the module is pure data, reads nothing, writes nothing)', ()=>{
  const hits=T19_STRIPPED.match(T19_MUT_RE)||[];
  eq(hits.join(','), '', `mutation-method calls are FORBIDDEN — matched ${JSON.stringify(hits)}`);
});

test('G-4: scan-harness sanity (anti-vacuity) — the stripper preserves the module\'s code tokens AND removes the documented comment occurrences with 1:1 char/line mapping', ()=>{
  for(const t of ['T19_SUPPORTED_TYPES','T19_HOUSE_MAPPING','inferConstraints','toHouseConstraintRecord','validateInferenceRequest','validateHouseConstraintRecord']){
    expect(T19_STRIPPED.includes(t), `stripped body must still contain '${t}'`);
  }
  expect(T19_SRC.includes('PHASE 3.16'), 'control is real: the header comment exists in RAW source');
  expect(!T19_STRIPPED.includes('PHASE 3.16'), 'header comment text must be stripped before scanning');
  eq(T19_STRIPPED.length, T19_SRC.length, 'char-count-identical');
  eq(T19_STRIPPED.split('\n').length, T19_SRC.split('\n').length, 'line-count-identical');
});

console.log('=== PHASE 3.16 Category H: Backward Compatibility (3 tests) ===');

test('H-1: evaluation.js evaluate() contract is UNCHANGED — a 3.14-style geometry expectation yields the exact §12 record shape with metadata keys exactly {tolerances, unevaluatedExpectations} (the 3.16 arm added a SEPARATE export, never touched the engine)', ()=>{
  const doc=mDoc([{id:'11111111-1111-4111-8111-111111111111', x:10, y:20, width:100, height:50}]);
  const expected={ intentId:'i-h1', status:'requested',
    geometry:{ width:100, height:null, rx:null, ry:null, area:null, symmetric:null },
    spatial:{ aligned:null, centered:null, bbox:null },
    appearance:{ fill:null, stroke:null, opacity:null },
    constraint:{ satisfied:null }, structure:{ grouped:null } };
  const result=liveEvaluate(expected, doc.docContext, doc.evaluationContext);
  eq(result.status, 'PASS', 'no deviation: the observed width matches');
  deepEq(Object.keys(result.metadata).sort(), ['tolerances','unevaluatedExpectations'].sort(), 'the metadata contract is untouched');
  const v=liveValidateEvaluationResult(result);
  eq(v.valid, true, 'a valid §12 record');
  // the width mismatch case still behaves exactly as the 3.14 contract
  const expected2={ ...expected, geometry:{ ...expected.geometry, width:120 } };
  const result2=liveEvaluate(expected2, doc.docContext, doc.evaluationContext);
  eq(result2.status, 'DEVIATION', 'the mismatch deviates');
  eq(result2.deviations[0].property, 'width', 'the live geometry property vocabulary');
});

test('H-2: critic.js proposeCorrections contract is UNCHANGED — the regular rule engine still produces the 3.14 create-rebuild proposal for a geometry deviation and does NOT consume the 3.16 constraint deviations (the constraint pass is a separate, additive surface)', ()=>{
  const doc=mDoc([{id:'11111111-1111-4111-8111-111111111111', x:10, y:20, width:100, height:50}]);
  const expected={ intentId:'i-h2', status:'requested',
    geometry:{ width:120, height:50, rx:0, ry:0, area:6000, symmetric:true },
    spatial:{ aligned:null, centered:null, bbox:null },
    appearance:{ fill:'#FF0000', stroke:null, opacity:null },
    constraint:{ satisfied:null }, structure:{ grouped:null } };
  // align the observed fill with the expectation so only the geometry deviates
  doc.appearanceStore.update('c1111111-1111-4111-8111-111111111111', {id:'c1111111-1111-4111-8111-111111111111', stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  const result=liveEvaluate(expected, doc.docContext, doc.evaluationContext);
  eq(result.status, 'DEVIATION', 'the width mismatch deviates');
  const proposals=regularProposeCorrections(result);
  eq(proposals.length, 1, 'the 3.14 rule fires exactly once');
  eq(proposals[0].intent.type, 'create', 'the create-rebuild rule');
  // a constraint-arm style record (geometry category, position.x property, all-null expected) proposes NOTHING through the regular engine
  const constraintStyle=liveEvaluate(g3NullExpected(), doc.docContext, doc.evaluationContext);
  eq(regularProposeCorrections(constraintStyle).length, 0, 'the regular engine is silent under the constraint agenda record');
});

test('H-3: ai.js planning contracts are UNCHANGED — the documented 3.13 rules still hold (slice plan T01->T07, transform scale resolves the T06 diagonal, create-planning context stays deep-frozen plain data)', ()=>{
  const ctx=gPlanningContext({ artboard:G3_ARTBOARD, objects:{} });
  const intent={ type:'create', objectType:'rectangle', width:200, height:100, fill:'#FF0000', placement:'center' };
  const plan=gCreatePlan(intent, ctx);
  deepEq(plan.steps.map(s=>s.toolId), ['T01','T07','T08'], 'the documented slice plan (Rule B/C)');
  const tctx=gPlanningContext({ artboard:G3_ARTBOARD, objects:{ 'r1':{objectType:'rect'} } });
  const scaleIntent={ type:'transform', targets:['r1'], operation:'scale', params:{x:2, y:1} };
  const scalePlan=gCreatePlan(scaleIntent, tctx);
  eq(scalePlan.steps[0].toolId, 'T06', 'Rule E: scale resolves to T06');
  deepEq(scalePlan.steps[0].input.transform, {a:2, b:0, c:0, d:1, tx:0, ty:0}, 'the diagonal matrix resolved at plan time');
  deepFrozen(ctx, 'planning context');
});

console.log('=== PHASE 3.16 Category I: Planner Integration (8 tests) ===');

// Fixed UUID object ids for the live-substrate unit fixtures (the SceneGraph
// validates objectRef as a UUID at node creation — the F-era discipline).
const UA='aaaaaaa1-1111-4111-8111-111111111111';
const UB='aaaaaaa2-2222-4222-8222-222222222222';
const UC='aaaaaaa3-3333-4333-8333-333333333333';
// The golden column arrangement projection (the PlanningContext.objects shape).
function mArrangement(specs){
  const map={};
  for(const s of specs){
    map[s.id]={ geometry:{ width:s.width, height:s.height }, spatial:{ bbox:{ minX:s.x, minY:s.y, maxX:s.x+s.width, maxY:s.y+s.height } } };
  }
  return map;
}
const G3_SPECS=[{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:80, height:60},{id:UC, x:100, y:300, width:80, height:60}];

test('I-1: verifyArrangementAgainstConstraints — the golden column satisfies all three T19-inferred constraints: PRESERVED with per-constraint SATISFIED checks', ()=>{
  const arrangement=mArrangement(G3_SPECS);
  const constraints=[mConstraint('equalWidth',[UA,UB,UC]), mConstraint('equalHeight',[UA,UB,UC],{id:'c-eqH'}), mConstraint('alignLeft',[UA,UB,UC],{id:'c-aL'})];
  const verdict=verifyArrangementAgainstConstraints(arrangement, constraints);
  eq(verdict.status, 'PRESERVED', 'the arrangement satisfies the accepted regime');
  eq(verdict.checks.length, 3, 'one check per constraint');
  for(const c of verdict.checks) eq(c.status, 'SATISFIED', `${c.constraintId} satisfied`);
  deepFrozen(verdict, 'verdict');
});

test('I-2: a violating arrangement is caught BEFORE planning executes — VIOLATED names the constraint and the violated participant (the planning-time face of P-5)', ()=>{
  const drifted=mArrangement([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:120, height:60},{id:UC, x:100, y:300, width:80, height:60}]);
  const verdict=verifyArrangementAgainstConstraints(drifted, [mConstraint('equalWidth',[UA,UB,UC])]);
  eq(verdict.status, 'VIOLATED', 'the width drift is caught');
  const check=verdict.checks[0];
  eq(check.status, 'VIOLATED', 'the constraint check');
  eq(check.violatedObjectIds.join(','), UB, 'the drifted participant is named');
  eq(check.expected, 80, 'the reference width');
  eq(check.actual, 120, 'the observed width');
});

test('I-3: missing participant state or unmeasurable quantities are UNVERIFIABLE — the planner never invents a verdict (honesty face)', ()=>{
  const partial=mArrangement([{id:UA, x:100, y:100, width:80, height:60}]); // B and C absent
  const verdict=verifyArrangementAgainstConstraints(partial, [mConstraint('equalWidth',[UA,UB,UC])]);
  eq(verdict.status, 'UNVERIFIABLE', 'absent participants are not guessed around');
  eq(verdict.checks[0].status, 'UNVERIFIABLE', 'the check is honest');
  // a null quantity is likewise unverifiable
  const nullish={ [UA]:{ geometry:{ width:80, height:60 }, spatial:{ bbox:null } }, [UB]:{ geometry:{ width:80, height:60 }, spatial:{ bbox:null } } };
  const verdict2=verifyArrangementAgainstConstraints(nullish, [mConstraint('alignLeft',[UA,UB])]);
  eq(verdict2.status, 'UNVERIFIABLE', 'a null bbox cannot be verified');
});

test('I-4: disabled constraints are invisible to the planning-time verification', ()=>{
  const arrangement=mArrangement(G3_SPECS);
  const off=mConstraint('equalWidth',[UA,UB,UC],{enabled:false});
  const verdict=verifyArrangementAgainstConstraints(arrangement, [off]);
  eq(verdict.status, 'PRESERVED', 'no check runs for a disabled constraint');
  eq(verdict.checks.length, 1, 'the check is reported for transparency');
  eq(verdict.checks[0].status, 'DISABLED', 'with the DISABLED status');
});

test('I-5: the planning verdicts are deterministic, deep-frozen, and computed without mutating their inputs', ()=>{
  const arrangement=mArrangement(G3_SPECS);
  const constraints=[mConstraint('alignLeft',[UA,UB,UC])];
  const a=verifyArrangementAgainstConstraints(arrangement, constraints);
  const b=verifyArrangementAgainstConstraints(clone(arrangement), clone(constraints));
  deepEq(jsonOf(a), jsonOf(b), 'byte-identical verdicts');
  unchangedAfter(()=>verifyArrangementAgainstConstraints(arrangement, constraints), arrangement, 'arrangement');
  unchangedAfter(()=>verifyArrangementAgainstConstraints(arrangement, constraints), constraints, 'constraints');
  deepFrozen(a, 'verdict');
});

test('I-6: verifyPlanStepsAgainstConstraints — a T05 step whose delta mutates a pinned axis of a touching HARD constraint CONFLICTS at planning time (the static mutation face, mirroring the correction gate semantics)', ()=>{
  const tctx=gPlanningContext({ artboard:G3_ARTBOARD, objects:{ [UA]:{objectType:'rect'} } });
  const plan=gCreatePlan({ type:'transform', targets:[UA], operation:'translate', params:{x:30, y:0} }, tctx);
  eq(plan.steps[0].toolId, 'T05', 'the plan is a T05 move');
  const hard=mConstraint('alignLeft',[UA,UB],{strength:'required', id:'c-hard'});
  const verdict=verifyPlanStepsAgainstConstraints(plan, [hard]);
  eq(verdict.status, 'CONFLICTS', 'the plan would mutate the pinned x axis');
  eq(verdict.conflicts.length, 1, 'one conflict');
  eq(verdict.conflicts[0].constraintIds.join(','), 'c-hard', 'the conflicting constraint is named');
  eq(verdict.conflicts[0].toolId, 'T05', 'the step tool');
  deepEq(verdict.conflicts[0].axes, ['x'], 'the mutated axis');
});

test('I-7: verifyPlanStepsAgainstConstraints — a T07 appearance step mutates no geometric axis (PRESERVED under any constraint); a T05 delta on a NON-pinned axis is PRESERVED; an unclassifiable tool is conservatively flagged', ()=>{
  const tctx=gPlanningContext({ artboard:G3_ARTBOARD, objects:{ [UA]:{objectType:'rect'} } });
  const fillPlan=gCreatePlan({ type:'appearance', targets:[UA], fill:'#00FF00' }, tctx);
  eq(fillPlan.steps[0].toolId, 'T07', 'the appearance plan');
  const hard=mConstraint('alignLeft',[UA,UB],{strength:'required', id:'c-hard'});
  eq(verifyPlanStepsAgainstConstraints(fillPlan, [hard]).status, 'PRESERVED', 'T07 touches no geometric axis');
  const yPlan=gCreatePlan({ type:'transform', targets:[UA], operation:'translate', params:{x:0, y:25} }, tctx);
  eq(verifyPlanStepsAgainstConstraints(yPlan, [hard]).status, 'PRESERVED', 'a y-delta does not touch the x-pinned edge');
  const unknownPlan={ steps:[{ id:'step-x', toolId:'T99', input:{ objectIds:['$doc:'+UA] } }], expectedState:{}, intentId:'i-x' };
  eq(verifyPlanStepsAgainstConstraints(unknownPlan, [hard]).status, 'CONFLICTS', 'an unknown tool mutates everything (conservative)');
});

test('I-8: integration — the planner\'s OWN creation ExpectedStates, projected into the arrangement shape, satisfy the T19-inferred regime (the arrangement IS the constraints\' origin: the loop of I returns PRESERVED on its own output)', ()=>{
  const arrangement=mArrangement(G3_SPECS);
  // infer from the arrangement and accept
  const inference=T19.inferConstraints({ utterance:'equal width, equal height, align the left edges', objects:G3_SPECS });
  const records=inference.proposals.map(p=>T19.toHouseConstraintRecord(p));
  eq(records.length, 3, 'three constraints inferred');
  const verdict=verifyArrangementAgainstConstraints(arrangement, records);
  eq(verdict.status, 'PRESERVED', 'the planner\'s own output satisfies its inferred regime');
});

console.log('=== PHASE 3.16 Category J: Evaluation Integration (14 tests) ===');

// The evaluation-side builder: the accepted regime rides in the ExpectedState's
// constraint.satisfied compliance request and the LIVE evaluate() runs the
// internal 3.16 compliance arm (NO new exports — the 12-export surface pinned).
function jEvaluate(doc, constraints, over={}){
  const expected={ ...G3_NULL_EXPECTED, constraint:{ satisfied:{ records: constraints, tolerance: over.tolerance===undefined ? G3_TOLERANCE : over.tolerance } } };
  return liveEvaluate(expected, doc.docContext, doc.evaluationContext);
}

test('J-1: the satisfied golden column evaluates PASS — zero deviations, all constraintResults SATISFIED, empty constraintDeviations, evaluated carries the constraint marker', ()=>{
  const doc=mDoc(G3_SPECS);
  const result=jEvaluate(doc, [mConstraint('equalWidth',[UA,UB,UC]), mConstraint('equalHeight',[UA,UB,UC],{id:'c-eqH'}), mConstraint('alignLeft',[UA,UB,UC],{id:'c-aL'})]);
  eq(result.status, 'PASS', 'no deviations');
  deepEq(result.deviations, [], 'clean deviations');
  eq(result.evaluated.includes('constraint'), true, 'the constraint marker in evaluated');
  eq(result.metadata.constraintResults.length, 3, 'one verdict per constraint');
  for(const r of result.metadata.constraintResults) eq(r.status, 'SATISFIED', `${r.constraintId} satisfied`);
  deepEq(result.metadata.constraintDeviations, [], 'no provenance records');
  deepEq(Object.keys(result.metadata).sort(), ['constraintDeviations','constraintResults','tolerances','unevaluatedExpectations'].sort(), 'the metadata contract');
  deepFrozen(result, 'the §12 record frozen');
});

test('J-2: the alignLeft drift produces EXACTLY ONE §13 deviation — category geometry, property position.x, expected 100, actual 130, delta 30, tolerance 1e-9, objectId = the drifted participant, targetRef $doc: — with a deterministic message and full provenance', ()=>{
  const doc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:80, height:60},{id:UC, x:130, y:300, width:80, height:60}]);
  const result=jEvaluate(doc, [mConstraint('alignLeft',[UA,UB,UC],{id:'c-aL'})]);
  eq(result.status, 'DEVIATION', 'the violation deviates');
  eq(result.deviations.length, 1, 'one deviation');
  const d=result.deviations[0];
  eq(d.category, 'geometry', '§13 category');
  eq(d.property, 'position.x', 'the pinned-axis position class');
  eq(d.expected, 100, 'the reference minX');
  eq(d.actual, 130, 'the drifted minX');
  eq(d.delta, 30, 'actual - expected');
  eq(d.tolerance, G3_TOLERANCE, 'the tolerance is part of the contract');
  eq(d.objectId, UC, 'the violated participant');
  eq(d.targetRef, '$doc:'+UC, 'the plan-reference grammar');
  eq(d.severity, 'error', 'severity');
  expect(typeof d.message==='string' && d.message.length>0, 'a deterministic human-readable message');
  const again=jEvaluate(doc, [mConstraint('alignLeft',[UA,UB,UC],{id:'c-aL'})]);
  eq(again.deviations[0].message, d.message, 'the message is deterministic');
  eq(again.deviations[0].id, d.id, 'the content-derived id is deterministic');
  const cd=result.metadata.constraintDeviations[0];
  eq(cd.deviationId, d.id, 'the deviation binding');
  eq(cd.constraintId, 'c-aL', 'the constraint id');
  eq(cd.type, 'alignLeft', 'the house type');
  eq(cd.referenceObjectId, UA, 'the reference object');
  eq(cd.violatedObjectId, UC, 'the violated participant');
  eq(cd.property, 'position.x', 'the property class');
});

test('J-3: equalWidth violations report the size class — property size.width with the reference width as expected', ()=>{
  const doc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:120, height:60}]);
  const result=jEvaluate(doc, [mConstraint('equalWidth',[UA,UB])]);
  eq(result.deviations.length, 1, 'one deviation');
  eq(result.deviations[0].property, 'size.width', 'the size class');
  eq(result.deviations[0].expected, 80, 'the reference width');
  eq(result.deviations[0].actual, 120, 'the drifted width');
  eq(result.deviations[0].delta, 40, 'actual - expected');
});

test('J-4: equalHeight violations report size.height with the same contract', ()=>{
  const doc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:80, height:90}]);
  const result=jEvaluate(doc, [mConstraint('equalHeight',[UA,UB])]);
  eq(result.deviations.length, 1, 'one deviation');
  eq(result.deviations[0].property, 'size.height', 'the size class');
  eq(result.deviations[0].expected, 60, 'reference height');
  eq(result.deviations[0].actual, 90, 'drifted height');
});

test('J-5: center constraints report the pinned center axis — alignCenterX deviations carry position.x with centerX quantities; alignCenterY carries position.y', ()=>{
  const cxDoc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:130, y:200, width:80, height:60}]);
  const cx=jEvaluate(cxDoc, [mConstraint('alignCenterX',[UA,UB])]);
  eq(cx.deviations[0].property, 'position.x', 'the x-center class');
  eq(cx.deviations[0].expected, 140, 'the reference centerX');
  eq(cx.deviations[0].actual, 170, 'the drifted centerX');
  const cyDoc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:220, width:80, height:60}]);
  const cy=jEvaluate(cyDoc, [mConstraint('alignCenterY',[UA,UB])]);
  eq(cy.deviations[0].property, 'position.y', 'the y-center class');
  eq(cy.deviations[0].expected, 130, 'the reference centerY');
  eq(cy.deviations[0].actual, 250, 'the drifted centerY');
});

test('J-6: localization is deterministic — when MULTIPLE participants fail, the deviation names the FIRST failing participant in objectIds order (the house constraint-kernel break semantics)', ()=>{
  const doc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:130, y:200, width:80, height:60},{id:UC, x:170, y:300, width:80, height:60}]);
  const result=jEvaluate(doc, [mConstraint('alignLeft',[UA,UB,UC])]);
  eq(result.deviations.length, 1, 'ONE deviation per constraint (the first failure breaks)');
  eq(result.deviations[0].objectId, UB, 'B is the first failing participant');
  eq(result.deviations[0].actual, 130, 'B\'s drifted minX');
});

test('J-7: fixedDistance violations report the distance class with the configured distance as expected', ()=>{
  const doc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:80, height:60}]);
  const result=jEvaluate(doc, [mConstraint('fixedDistance',[UA,UB],{parameters:{distance:50}})]);
  eq(result.deviations.length, 1, 'one deviation');
  eq(result.deviations[0].property, 'position.distance', 'the distance class');
  eq(result.deviations[0].expected, 50, 'the configured distance');
  eq(result.deviations[0].actual, 100, 'the actual center distance');
});

test('J-8: a missing participant is UNVERIFIABLE — no deviation is invented for an unobservable constraint (§21 honesty)', ()=>{
  const doc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:80, height:60}]);
  const result=jEvaluate(doc, [mConstraint('alignLeft',[UA,UB,UC])]);
  deepEq(result.deviations, [], 'nothing invented');
  eq(result.metadata.constraintResults[0].status, 'UNVERIFIABLE', 'the honest status');
  eq(result.metadata.constraintResults[0].reason, 'OBJECT_UNOBSERVED', 'the honest reason');
});

test('J-9: an unmeasurable geometry (worldBBox null) is UNVERIFIABLE — an unmeasurable constraint is never invented (§15/§19 honesty)', ()=>{
  const doc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:80, height:60}]);
  doc.geometryStore.update(doc.geomIdOf(UA), {type:'bezier', params:{x:100, y:100, width:80, height:60, rx:0, ry:0}});
  const result=jEvaluate(doc, [mConstraint('equalWidth',[UA,UB])]);
  deepEq(result.deviations, [], 'nothing invented');
  eq(result.metadata.constraintResults[0].status, 'UNVERIFIABLE', 'the honest status');
  eq(result.metadata.constraintResults[0].reason, 'GEOMETRY_UNMEASURABLE', 'the honest reason');
});

test('J-10: disabled constraints are DISABLED and invisible — no deviation, no influence on other results', ()=>{
  const doc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:500, y:200, width:20, height:20}]);
  const result=jEvaluate(doc, [mConstraint('equalWidth',[UA,UB],{enabled:false}), mConstraint('alignLeft',[UA,UB],{id:'c-on'})]);
  eq(result.metadata.constraintResults[0].status, 'DISABLED', 'the disabled verdict');
  deepEq(result.deviations.filter(d=>d.property==='size.width'), [], 'the disabled constraint deviates nothing');
  eq(result.deviations.length, 1, 'the enabled constraint still reports');
});

test('J-11: the tolerance boundary — an error exactly at the tolerance is SATISFIED, beyond it a deviation (the §14/§15 kernel discipline)', ()=>{
  const base=[{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100.5, y:200, width:80, height:60}];
  const at=jEvaluate(mDoc(base), [mConstraint('alignLeft',[UA,UB])], { tolerance: 0.5 });
  deepEq(at.deviations, [], 'error == tolerance is satisfied');
  const beyond=jEvaluate(mDoc([{...base[0]},{...base[1], x:100.6}]), [mConstraint('alignLeft',[UA,UB])], { tolerance: 0.5 });
  eq(beyond.deviations.length, 1, 'error > tolerance deviates');
});

test('J-12: the compliance arm is read-only — the stores are byte-identical after the evaluation and the §12 record is deep-frozen', ()=>{
  const doc=mDoc(G3_SPECS);
  const geomsBefore=JSON.stringify(G3_SPECS.map(s=>doc.geometryStore.get(doc.geomIdOf(s.id))));
  const result=jEvaluate(doc, [mConstraint('alignLeft',[UA,UB,UC])]);
  const geomsAfter=JSON.stringify(G3_SPECS.map(s=>doc.geometryStore.get(doc.geomIdOf(s.id))));
  eq(geomsAfter, geomsBefore, 'the stores unchanged');
  deepFrozen(result, 'result frozen');
});

test('J-13: the §12 record is the NATIVE merge — status derives from the deviations exactly (PASS iff zero), the record validates through the LIVE validator, and the provenance rides in metadata', ()=>{
  const good=jEvaluate(mDoc(G3_SPECS), [mConstraint('alignLeft',[UA,UB,UC],{id:'c-aL'})]);
  eq(good.status, 'PASS', 'satisfied -> PASS');
  eq(liveValidateEvaluationResult(good).valid, true, 'a valid §12 record');
  const drifted=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:80, height:60},{id:UC, x:130, y:300, width:80, height:60}]);
  const dev=jEvaluate(drifted, [mConstraint('alignLeft',[UA,UB,UC],{id:'c-aL'})]);
  eq(dev.status, 'DEVIATION', 'violated -> DEVIATION');
  eq(dev.metadata.constraintDeviations.length, 1, 'the provenance rides in metadata');
  eq(liveValidateEvaluationResult(dev).valid, true, 'a valid §12 record');
});

test('J-14: the compliance arm is deterministic — identical inputs yield byte-identical §12 records (Invariant 17 face), including ids and messages', ()=>{
  const doc=mDoc(G3_SPECS);
  const drifted=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:80, height:60},{id:UC, x:130, y:300, width:80, height:60}]);
  const constraints=[mConstraint('equalWidth',[UA,UB,UC]), mConstraint('alignLeft',[UA,UB,UC],{id:'c-aL'})];
  deepEq(jsonOf(jEvaluate(drifted, constraints)), jsonOf(jEvaluate(drifted, clone(constraints))), 'byte-identical on the violated state');
  deepEq(jsonOf(jEvaluate(doc, constraints)), jsonOf(jEvaluate(doc, clone(constraints))), 'byte-identical on the satisfied state');
});

console.log('=== PHASE 3.16 Category K: Critic Integration (14 tests) ===');

// The constraint evaluation record (the evaluation arm's §12 output) feeds the
// REGULAR §23 proposeCorrections — the constraint rule lives INSIDE the rule
// engine (the 6-export critic surface is pinned).
function kEvaluation(doc, constraints){
  return jEvaluate(doc, constraints);
}
const G3_DRIFTED=[{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:80, height:60},{id:UC, x:130, y:300, width:80, height:60}];

test('K-1: proposeCorrections on a satisfied (PASS) constraint evaluation yields an empty frozen proposal array', ()=>{
  const doc=mDoc(G3_SPECS);
  const result=kEvaluation(doc, [mConstraint('alignLeft',[UA,UB,UC])]);
  eq(result.status, 'PASS', 'the fixture is satisfied');
  const out=regularProposeCorrections(result);
  deepEq(out, [], 'no proposals');
  deepFrozen(out, 'frozen');
});

test('K-2: the alignLeft violation yields EXACTLY ONE 7-key §25 proposal — intent transform/translate with delta = expected - actual on the pinned axis, deviationId/targetRef carried verbatim, confidence 1, priority 0', ()=>{
  const doc=mDoc(G3_DRIFTED);
  const result=kEvaluation(doc, [mConstraint('alignLeft',[UA,UB,UC],{id:'c-aL'})]);
  eq(result.status, 'DEVIATION', 'the fixture violates');
  const out=regularProposeCorrections(result);
  eq(out.length, 1, 'one proposal');
  const p=out[0];
  deepEq(Object.keys(p).sort(), ['confidence','deviationId','id','intent','priority','reason','targetRef'].sort(), 'the 7-key contract');
  eq(gValidateProposal(p).valid, true, 'validates through the LIVE §25 validator');
  deepEq(p.intent, { type:'transform', targets:[UC], operation:'translate', params:{ x:-30, y:0 } }, 'delta = expected(100) - actual(130)');
  eq(p.deviationId, result.deviations[0].id, 'the deviation binding');
  eq(p.targetRef, '$doc:'+UC, 'the targetRef grammar');
  eq(p.confidence, 1, 'the rule-derived confidence');
  eq(p.priority, 0, 'the deviation-order priority');
});

test('K-3: the delta direction follows the pinned axis — an alignTop violation translates on y only; an alignCenterX violation on x only', ()=>{
  const topDoc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:220, width:80, height:60}]);
  const top=regularProposeCorrections(kEvaluation(topDoc, [mConstraint('alignTop',[UA,UB])]));
  eq(top.length, 1, 'one proposal');
  deepEq(top[0].intent.params, { x:0, y:-120 }, 'y = expected(100) - actual(220), x untouched');
  const cxDoc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:130, y:200, width:80, height:60}]);
  const cx=regularProposeCorrections(kEvaluation(cxDoc, [mConstraint('alignCenterX',[UA,UB])]));
  deepEq(cx[0].intent.params, { x:-30, y:0 }, 'x = expected(140) - actual(170), y untouched');
});

test('K-4: an equalWidth violation produces NO proposal — the §28 honest gap (the only size capability T06 is origin-anchored: scaling the width moves the object; no SAFE capability exists and the architecture is never bypassed)', ()=>{
  const doc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:120, height:60}]);
  const result=kEvaluation(doc, [mConstraint('equalWidth',[UA,UB])]);
  eq(result.status, 'DEVIATION', 'the violation is honestly reported');
  const out=regularProposeCorrections(result);
  deepEq(out, [], 'no proposal for the size class — the absence IS the decline');
});

test('K-5: the mixed verdict — size-class violations stay silent while the position-class violation still proposes (one pass, both faces)', ()=>{
  const doc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:130, y:260, width:120, height:90}]);
  const result=kEvaluation(doc, [mConstraint('equalWidth',[UA,UB],{id:'c-w'}), mConstraint('equalHeight',[UA,UB],{id:'c-h'}), mConstraint('alignLeft',[UA,UB],{id:'c-l'})]);
  const out=regularProposeCorrections(result);
  eq(out.length, 1, 'only the position-class proposal');
  eq(out[0].intent.targets.join(','), UB, 'the drifted participant');
  eq(result.metadata.constraintDeviations.length, 3, 'all three violations were reported by the evaluation arm');
});

test('K-6: the constraint rule is deterministic — identical evaluation records yield byte-identical proposals (ids included)', ()=>{
  const doc=mDoc(G3_DRIFTED);
  const constraints=[mConstraint('alignLeft',[UA,UB,UC]), mConstraint('equalWidth',[UA,UB,UC],{id:'c-w'})];
  deepEq(jsonOf(regularProposeCorrections(kEvaluation(doc, constraints))), jsonOf(regularProposeCorrections(kEvaluation(doc, clone(constraints)))), 'byte-identical');
});

test('K-7: proposal ordering follows the deviation order — priority equals the deviation index (the §30 primary basis)', ()=>{
  const doc=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:130, y:200, width:80, height:60},{id:UC, x:100, y:260, width:80, height:60}]);
  const result=kEvaluation(doc, [mConstraint('alignLeft',[UA,UB,UC],{id:'c-l'}), mConstraint('alignTop',[UA,UB,UC],{id:'c-t'})]);
  const out=regularProposeCorrections(result);
  eq(out.length, 2, 'two proposals');
  deepEq(out.map(p=>p.priority), [0,1], 'index order');
  deepEq(out.map(p=>p.deviationId), result.deviations.map(d=>d.id), 'the deviation order');
});

test('K-8: dedup — two accepted constraints whose fixes collapse to the SAME translate intent produce ONE proposal (the first deviation wins, the shared §28 dedup)', ()=>{
  const doc=mDoc(G3_DRIFTED);
  const result=kEvaluation(doc, [mConstraint('alignLeft',[UA,UB,UC],{id:'c-l1'}), mConstraint('alignLeft',[UA,UB,UC],{id:'c-l2'})]);
  eq(result.metadata.constraintDeviations.length, 2, 'both violations reported');
  const out=regularProposeCorrections(result);
  eq(out.length, 1, 'identical corrections collapse');
});

test('K-9: the §23 entry consumes the §12 contract — non-EvaluationResult input and shape-violating records throw CriticError INVALID_EVALUATION_RESULT (never a shape guess)', ()=>{
  let threw=null;
  try{ regularProposeCorrections(null); }catch(e){ threw=e; }
  expect(threw instanceof CriticError, 'a CriticError');
  eq(threw.code, 'INVALID_EVALUATION_RESULT', 'the code');
  threw=null;
  try{ regularProposeCorrections({ status:'DEVIATION', deviations:[] }); }catch(e){ threw=e; }
  expect(threw instanceof CriticError && threw.code==='INVALID_EVALUATION_RESULT', 'the shape-violating record is refused');
});

test('K-10: a constraint-STYLE deviation WITHOUT constraint provenance produces no proposal — the rule engine never guesses constraint semantics from property names alone', ()=>{
  const doc=mDoc(G3_SPECS);
  const actual=doc.actualState();
  const bare=gCreateEvaluationResult({ expected: G3_NULL_EXPECTED, actual,
    deviations:[{ id:'dev-bare', category:'geometry', property:'position.x', expected:100, actual:130, delta:30, tolerance:G3_TOLERANCE, severity:'error', objectId:UC, targetRef:'$doc:'+UC, message:'bare position deviation' }],
    evaluated:['constraint'], metadata:{} });
  const out=regularProposeCorrections(bare);
  deepEq(out, [], 'no proposal without the provenance anchor (and the 3.14 geometry rule declines on the all-null desired state)');
});

test('K-11: an orphan constraintDeviation (its deviationId absent from result.deviations) is skipped — no proposal without a live deviation anchor', ()=>{
  const doc=mDoc(G3_SPECS);
  const actual=doc.actualState();
  const orphan=gCreateEvaluationResult({ expected: G3_NULL_EXPECTED, actual, deviations: [],
    evaluated:['constraint'],
    metadata:{ constraintDeviations:[{ deviationId:'dev-orphan', constraintId:'c-x', type:'alignLeft', strength:'strong',
      objectIds:[UA,UB], referenceObjectId:UA, violatedObjectId:UB, property:'position.x', expected:100, actual:130, error:30, tolerance:G3_TOLERANCE }] } });
  const out=regularProposeCorrections(orphan);
  deepEq(out, [], 'no orphan proposal');
});

test('K-12: every proposal is a valid LIVE §25 record whose intent stays inside the transform capability vocabulary (type/targets/operation/params keys only)', ()=>{
  const doc=mDoc(G3_DRIFTED);
  const constraints=[mConstraint('alignLeft',[UA,UB,UC]), mConstraint('alignTop',[UA,UB,UC],{id:'c-t'})];
  const out=regularProposeCorrections(kEvaluation(doc, constraints));
  eq(out.length, 2, 'two distinct violations (C on the x axis, B on the y axis) propose two distinct corrections');
  for(const p of out){
    eq(gValidateProposal(p).valid, true, 'the LIVE §25 validator accepts');
    deepEq(Object.keys(p.intent).sort(), ['operation','params','targets','type'].sort(), 'the transform intent key vocabulary');
    eq(p.intent.type, 'transform', 'the transform capability');
    eq(p.intent.operation, 'translate', 'the translate operation');
  }
});

test('K-13: the constraint rule is read-only over the evaluation record and the proposals are frozen plain data', ()=>{
  const doc=mDoc(G3_DRIFTED);
  const result=kEvaluation(doc, [mConstraint('alignLeft',[UA,UB,UC])]);
  const before=clone(result);
  const out=regularProposeCorrections(result);
  deepEq(result, before, 'the evaluation record unchanged');
  deepFrozen(out, 'the proposals frozen');
});

test('K-14: integration — the proposal intent is PLANNABLE: the LIVE createPlan accepts it and resolves the T05 step with the exact delta (the §26 route back to the doc: proposal -> Planner -> Plan -> DSL -> Transaction)', ()=>{
  const doc=mDoc(G3_DRIFTED);
  const out=regularProposeCorrections(kEvaluation(doc, [mConstraint('alignLeft',[UA,UB,UC])]));
  const intent=out[0].intent;
  const ctx=gPlanningContext({ artboard:G3_ARTBOARD, objects:{ [UC]:{objectType:'rect'} } });
  const plan=gCreatePlan(intent, ctx);
  eq(plan.steps[0].toolId, 'T05', 'the planner resolves T05');
  deepEq(plan.steps[0].input.delta, { x:-30, y:0 }, 'the exact delta');
  eq(gValidatePlan(plan, ctx).valid, true, 'the plan validates');
});

console.log('=== PHASE 3.16 Category L: Correction Loop Integration (14 tests) ===');

// The width drift: a REAL transaction through the sanctioned createUpdateGeometryCommand.
function g3WidthDrift(g, objectId, newWidth){
  const obj=g.objectStore.get(objectId);
  const geom=g.geometryStore.get(obj.geometryRef);
  const newGeom={ ...geom, params:{ ...geom.params, width:newWidth } };
  const tx=new TransactionBuilder().begin({ source:'fixture', description:'post-acceptance width drift', id:'tx-drift-w-g3' })
    .addCommand(createUpdateGeometryCommand({ geometryId: obj.geometryRef, geometry: newGeom })).build();
  g.transactionManager.execute(tx);
  return tx;
}

// The standard loop fixture: golden column + the three inferred constraints
// (equalHeight HARD via the accepted T19 set is 'strong'; the fixture pins
// equalHeight to 'required' for the preserved-hard face) + the +30 drift.
async function lFixture(over={}){
  const g=await g3Column();
  const inference=T19.inferConstraints({ utterance:'equal width, equal height, align the left edges', objects:g3ObjectSpecs(g) });
  // convert once, apply the fixture's strength overrides on the RECORDS (T19
  // itself never infers hard constraints — the override is the fixture's user act)
  const records=inference.proposals.map(p=>clone(T19.toHouseConstraintRecord(p)));
  for(const rec of records){
    if(over.alignLeftStrength && rec.type==='alignLeft') rec.strength=over.alignLeftStrength;
    if(over.equalHeightStrength!==undefined && rec.type==='equalHeight') rec.strength=over.equalHeightStrength;
  }
  for(const rec of records) g.constraintStore.create(rec);
  const accepted=g.constraintStore.list();
  const drift=g3Drift(g, 30, 0);
  const critic=g3Critic(g);
  const initialEvaluation=critic.evaluate(g.docContext, g.docEvalContext());
  const cd=initialEvaluation.metadata.constraintDeviations.find(c=>c.type===(over.violatedType||'alignLeft'));
  expect(cd, 'the fixture violates the expected constraint: '+jsonOf(initialEvaluation.metadata.constraintResults));
  const target=over.target || g3TargetFromConstraintDeviation(cd);
  const request={
    rootIntentId:'intent-l', rootTransactionId:'tx-root-l',
    targets: over.targets || [target],
    policy: gCreatePolicy(over.policy || {}),
    mode:'AUTO', critic, document:g.docContext, evaluationContext:g.docEvalContext(),
    planningContext: over.planningContext!==undefined ? over.planningContext : (over.noConstraintContext ? undefined : { constraints: accepted }),
    substrate:g.substrate
  };
  if(over.autorun===false){
    return { g, inference, accepted, drift, critic, initialEvaluation, cd, target, request, proposals: inference.proposals };
  }
  const done=CorrectionEngine.run(CorrectionEngine.start(request));
  return { g, inference, accepted, drift, critic, initialEvaluation, cd, target, request, done, proposals: inference.proposals };
}

test('L-1: a constraint agenda closes through the FROZEN 3.15 CorrectionEngine — TERMINATED/VERIFIED in exactly one T05 attempt, the §3 choreography intact', async ()=>{
  const f=await lFixture({ equalHeightStrength:'required' });
  eq(f.done.status, 'TERMINATED', 'terminated');
  eq(f.done.terminationReason, 'VERIFIED', 'verified');
  eq(f.done.executedAttempts, 1, 'one attempt');
  deepEq(f.done.session.visitedStates, ['IDLE','PLANNING','EXECUTING','EVALUATING','VERIFIED','TERMINATED'], 'the §3 choreography');
  eq(f.g.geomParamsOf(f.g.objectIds[2]).x, 100, 'the LIVE T05 restored the left edge');
  deepEq(f.done.session.corrections.map(a=>a.status), ['IMPROVED'], 'the §6 trail');
});

test('L-2: the loop\'s plan carried the constraint context — hardConstraintsPreserved names the hard equalHeight record; softTradeOffs records the violated strong alignLeft (the disclosed trade-off, never silent)', async ()=>{
  const f=await lFixture({ equalHeightStrength:'required' });
  const plan=f.done.iterationLedger[0].plan;
  const c=plan.riskAssessment.constraints;
  expect(c, 'the constraint context rides on the plan');
  const hardId=f.accepted.find(r=>r.type==='equalHeight').id;
  const softId=f.accepted.find(r=>r.type==='alignLeft').id;
  expect(c.hardConstraintsPreserved.includes(hardId), 'the hard record preserved');
  deepEq(c.softTradeOffs.map(t=>t.constraintId), [softId], 'the violated strong record trades off');
  eq(plan.preconditions.some(p=>p.kind==='hard-constraints-preserved'), true, 'the precondition records the preservation');
});

test('L-3: a HARD violated constraint whose pinned axis the fix must mutate is NEVER silently degraded — the plan refuses HARD_CONSTRAINT_REJECTED and the loop terminates CONSTRAINT_BLOCKED with zero attempts (P-5 REJECTED face)', async ()=>{
  const f=await lFixture({ alignLeftStrength:'required' });
  eq(f.done.status, 'TERMINATED', 'terminated');
  eq(f.done.terminationReason, 'CONSTRAINT_BLOCKED', 'the honest blocked verdict');
  eq(f.done.executedAttempts, 0, 'nothing executed');
  eq(f.g.geomParamsOf(f.g.objectIds[2]).x, 130, 'the drifted state is untouched — no silent fix');
  const refusals=f.done.refusalLedger.filter(e=>e.source==='PLAN_REFUSED');
  expect(refusals.length>=1, 'the refusal is in the ledger');
  eq(refusals[0].reason, 'HARD_CONSTRAINT_REJECTED', 'the refusal reason');
});

test('L-4: a size-class agenda (metric size.width) resolves the scale-to-target-size recipe but the plan refuses INSUFFICIENT_EVIDENCE — T06 is rule-less in the frozen derivation table — and the loop terminates UNFIXABLE (the disclosed boundary, never patched)', async ()=>{
  const g=await g3Column();
  const inference=T19.inferConstraints({ utterance:'equal width', objects:g3ObjectSpecs(g) });
  const accepted=g3Accept(g, inference.proposals);
  g3WidthDrift(g, g.objectIds[1], 120);   // a REAL width-changing transaction on the second rect
  eq(g.geomParamsOf(g.objectIds[1]).width, 120, 'the width drift committed');
  const critic=g3Critic(g);
  const initialEvaluation=critic.evaluate(g.docContext, g.docEvalContext());
  eq(initialEvaluation.status, 'DEVIATION', 'the equalWidth violation is live');
  const cd=initialEvaluation.metadata.constraintDeviations[0];
  eq(cd.property, 'size.width', 'the size class');
  const target=bTarget({ category:'SIZE', objectIds:[cd.violatedObjectId], metric:'size.width',
    observedValue:cd.actual, targetValue:cd.expected, severity:'HIGH', confidence:0.9,
    evidence:[{ type:'CONSTRAINT', source:'constraint-inference', constraintId:cd.constraintId, objectIds:[...cd.objectIds], value:cd.actual }] });
  const request={ rootIntentId:'intent-l4', rootTransactionId:'tx-root-l4', targets:[target],
    policy:gCreatePolicy({}), mode:'AUTO', critic, document:g.docContext, evaluationContext:g.docEvalContext(),
    planningContext:{ constraints: accepted }, substrate:g.substrate };
  const done=CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'UNFIXABLE', 'the honest unfixable verdict');
  eq(done.executedAttempts, 0, 'nothing executed — no fake fix');
  eq(g.geomParamsOf(g.objectIds[1]).width, 120, 'the drifted width is untouched');
  const refusals=done.refusalLedger.filter(e=>e.source==='PLAN_REFUSED');
  expect(refusals.length>=1, 'the INSUFFICIENT_EVIDENCE refusal is in the ledger');
  eq(refusals[0].reason, 'INSUFFICIENT_EVIDENCE', 'the refusal reason');
});

test('L-5: a CONSTRAINT-category target hits the frozen zero-recipe table (CONSTRAINT -> CONSTRAINT_VIOLATION, zero recipes) — NO_CAPABILITY, honest UNFIXABLE, zero attempts', async ()=>{
  const f=await lFixture({ autorun:false });
  const target=bTarget({ category:'CONSTRAINT', objectIds:[f.g.objectIds[2]], metric:'position.x',
    observedValue:130, targetValue:100, severity:'HIGH', confidence:0.9,
    evidence:[{ type:'CONSTRAINT', source:'constraint-inference', constraintId:'c-fix-alignLeft', objectIds:[...f.g.objectIds], value:130 }] });
  const request={ ...f.request, targets:[target] };
  const done=CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'UNFIXABLE', 'the honest verdict');
  eq(done.executedAttempts, 0, 'nothing executed');
  eq(CATEGORY_TO_ROOT_CAUSE.CONSTRAINT, 'CONSTRAINT_VIOLATION', 'the frozen mapping');
  const led=done.refusalLedger.filter(e=>e.source==='NO_CAPABILITY');
  eq(led.length, 1, 'the NO_CAPABILITY ledger entry');
});

test('L-6: with NO constraint context on the request, the loop still closes (VERIFIED) and the plan makes NO preserved-constraints claim — honest absence, never a false safety record', async ()=>{
  const f=await lFixture({ noConstraintContext: true });
  eq(f.done.status, 'TERMINATED', 'terminated');
  eq(f.done.terminationReason, 'VERIFIED', 'the loop closes without constraint context');
  const plan=f.done.iterationLedger[0].plan;
  eq(plan.riskAssessment.constraints, undefined, 'no constraint verdict is fabricated');
  eq(plan.preconditions.some(p=>p.kind==='hard-constraints-preserved'), false, 'no false preservation claim');
});

test('L-7: the correction is ONE independent substrate transaction with a content-derived atx- id — distinct from the root and drift transactions; history grows by exactly one per attempt', async ()=>{
  const f=await lFixture({ equalHeightStrength:'required' });
  const txId=f.done.session.corrections[0].transactionId;
  expect(txId && txId.startsWith('atx-'), `the atx- content-derived id: ${txId}`);
  expect(txId!==f.request.rootTransactionId, 'distinct from the root');
  expect(txId!==f.drift.id, 'distinct from the drift');
  eq(f.g.historyManager.size(), f.g.historyAfterCreation+1+1, 'creations + drift + exactly ONE correction transaction');
  const ids=f.g.historyManager.getAll().map(t=>t.id);
  expect(ids.includes(txId), 'the correction transaction is IN the linear history');
});

test('L-8: §22 — the loop NEVER self-evaluates: the host critic is called exactly 1 + iterations times with the request document verbatim', async ()=>{
  const f=await lFixture({ equalHeightStrength:'required' });
  eq(f.critic.calls.length, 3, 'the fixture pre-evaluation + the engine initial + one re-evaluation');
  expect(f.critic.calls.every(c=>c.document===f.request.document), 'the request document, verbatim');
  eq(f.done.session.currentEvaluation.status, 'PASS', 'the final authority record is clean');
});

test('L-9: the rollback arc under constraint context — a target pointing at the WRONG restoration value regresses the relation; §15 declares the regression, §32 undo restores the drifted state, and the constraint records are untouched by the rollback', async ()=>{
  const f=await lFixture({ equalHeightStrength:'required', autorun:false });
  // a deliberately WRONG target: "restore" the left edge to x=160 (further from the truth)
  const wrongTarget=bTarget({ category:'POSITION', objectIds:[f.g.objectIds[2]], metric:'position.x',
    observedValue:130, targetValue:160, severity:'HIGH', confidence:0.9,
    evidence:[{ type:'CONSTRAINT', source:'fixture', objectIds:[f.g.objectIds[2]], value:130 }] });
  const request={ ...f.request, targets:[wrongTarget] };
  const done=CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  const last=done.session.corrections[done.session.corrections.length-1];
  eq(last.status, 'ROLLED_BACK', 'the regression was rolled back');
  eq(f.g.geomParamsOf(f.g.objectIds[2]).x, 130, 'the §32 undo restored the pre-attempt state');
  expect(done.terminationReason!=='VERIFIED', 'the loop never lies about convergence');
  // the constraint records survived the rollback untouched
  deepEq(f.g.constraintStore.list(), f.accepted, 'the accepted regime is out of the transaction surface');
});

test('L-10: loop determinism — two rebuilt fixtures produce normalized byte-identical outcome records (status, trail, attempt count, restoration values)', async ()=>{
  const norm=async ()=>{
    const f=await lFixture({ equalHeightStrength:'required' });
    return jsonOf({
      status:f.done.status, reason:f.done.terminationReason, attempts:f.done.executedAttempts,
      trail:f.done.session.visitedStates, corrections:f.done.session.corrections.map(a=>a.status),
      geometry:f.g.objectIds.map(id=>f.g.geomParamsOf(id)),
      evaluationStatus:f.done.session.currentEvaluation.status,
      deviationCount:f.done.session.currentEvaluation.deviations.length
    });
  };
  eq(await norm(), await norm(), 'normalized byte-identical outcomes');
});

test('L-11: the history stays LINEAR through a constraint-correction loop (Invariant 13 face) — one linear array, currentIndex at the tail, every transaction committed in sequence', async ()=>{
  const f=await lFixture({ equalHeightStrength:'required' });
  const h=f.g.historyManager;
  eq(h.getAll().length, h.size(), 'the linear array carries every transaction');
  eq(h.getCurrentIndex(), h.size()-1, 'the cursor sits at the tail (no branch, no redo tail)');
  for(const tx of h.getAll()) eq(tx.status, 'committed', 'every history entry is a committed transaction');
  eq(h.size(), f.g.historyAfterCreation+2, 'creations + drift + correction — no extra pushes, no branches');
});

test('L-12: a critic that keeps reporting the violation is answered with NO_PROGRESS — the loop never claims VERIFIED without the authority, even when the substrate was actually corrected', async ()=>{
  const g=await g3Column();
  const inference=T19.inferConstraints({ utterance:'align the left edges', objects:g3ObjectSpecs(g) });
  const accepted=g3Accept(g, inference.proposals);
  g3Drift(g, 30, 0);
  const realCritic=g3Critic(g);
  const stale=realCritic.evaluate(g.docContext, g.docEvalContext());
  eq(stale.status, 'DEVIATION', 'the stale authority is the drifted record');
  const lyingCalls=[];
  const lying={ evaluate(){ lyingCalls.push(1); return stale; } };
  const target=bTarget({ category:'POSITION', objectIds:[g.objectIds[2]], metric:'position.x',
    observedValue:130, targetValue:100, severity:'HIGH', confidence:0.9,
    evidence:[{ type:'CONSTRAINT', source:'fixture', objectIds:[g.objectIds[2]], value:130 }] });
  const request={ rootIntentId:'intent-l12', rootTransactionId:'tx-root-l12', targets:[target],
    policy:gCreatePolicy({}), mode:'AUTO', critic:lying, document:g.docContext, evaluationContext:g.docEvalContext(),
    planningContext:{ constraints: accepted }, substrate:g.substrate };
  const done=CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'NO_PROGRESS', 'the honest no-progress verdict');
  eq(done.executedAttempts, 1, 'the attempt executed');
  eq(g.geomParamsOf(g.objectIds[2]).x, 100, 'the substrate WAS corrected — the lying authority is the fixture\'s point');
  expect(lyingCalls.length>=2, 'the lying authority served every evaluation the loop needed');
});

test('L-13: a two-object, two-axis drift under an L-arrangement — alignLeft([A,B]) and alignTop([B,C]) both hold at acceptance; moving B right violates the first and moving C down violates the second; the loop sequences two single-axis T05 fixes to VERIFIED (each target\'s (metric, objectId) pair is unique — the disclosed agenda-calibration discipline)', async ()=>{
  const g=await g3Column();
  // the L-arrangement: A(100,100), B(100,300), C(300,300) — built by REAL
  // correction transactions from the created column (never direct writes)
  const moveTx=(oid, dx, dy, id)=>{ const tx=new TransactionBuilder().begin({ source:'fixture', description:'arrange', id })
    .addCommand(createMoveObjectCommand({ objectId: oid, dx, dy })).build(); g.transactionManager.execute(tx); return tx; };
  moveTx(g.objectIds[1], 0, 100, 'tx-arrange-b');   // B: y 200 -> 300
  moveTx(g.objectIds[2], 200, 0, 'tx-arrange-c');   // C: x 100 -> 300
  eq(g.geomParamsOf(g.objectIds[1]).x, 100, 'B holds the shared left edge');
  eq(g.geomParamsOf(g.objectIds[1]).y, 300, 'B holds the shared top edge with C');
  // two SCOPED T19 inferences (the host scopes the participants per relation)
  const [a,b,c]=g.objectIds;
  const infLeft=T19.inferConstraints({ utterance:'align the left edges', objects:[{id:a},{id:b}] });
  const infTop=T19.inferConstraints({ utterance:'align the top edges', objects:[{id:b},{id:c}] });
  const accepted=g3Accept(g, [...infLeft.proposals, ...infTop.proposals]);
  eq(accepted.map(r=>r.type).sort().join(','), 'alignLeft,alignTop', 'the two accepted constraints');
  // the two-object drift: B right (alignLeft violated on B), C down (alignTop violated on C)
  g3Drift(g, 30, 0, b, 'tx-drift-g3-b');
  g3Drift(g, 0, 25, c, 'tx-drift-g3-c');
  const critic=g3Critic(g);
  const initialEvaluation=critic.evaluate(g.docContext, g.docEvalContext());
  eq(initialEvaluation.metadata.constraintDeviations.length, 2, 'both violations live');
  deepEq(initialEvaluation.metadata.constraintDeviations.map(cd=>cd.property).sort(), ['position.x','position.y'].sort(), 'the two axis classes');
  expect(initialEvaluation.metadata.constraintDeviations[0].violatedObjectId!==initialEvaluation.metadata.constraintDeviations[1].violatedObjectId, 'the violations localize to DIFFERENT objects');
  const targets=initialEvaluation.metadata.constraintDeviations.map(cd=>g3TargetFromConstraintDeviation(cd));
  const request={ rootIntentId:'intent-l13', rootTransactionId:'tx-root-l13', targets,
    policy:gCreatePolicy({}), mode:'AUTO', critic, document:g.docContext, evaluationContext:g.docEvalContext(),
    planningContext:{ constraints: accepted }, substrate:g.substrate };
  const done=CorrectionEngine.run(CorrectionEngine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'VERIFIED', 'the sequenced fixes verify the whole agenda');
  eq(done.executedAttempts, 2, 'two single-axis attempts');
  eq(g.geomParamsOf(b).x, 100, 'B\'s left edge restored');
  eq(g.geomParamsOf(c).y, 300, 'C\'s top edge restored');
  deepEq(done.session.corrections.map(a=>a.status), ['IMPROVED','IMPROVED'], 'both attempts improved');
});

test('L-14: the audit trail — the attempt carries the transactionId and the plan carries the §11 expectedImprovement (metric position.x, from 130 to 100); the HistoryManager is untouched by session bookkeeping', async ()=>{
  const f=await lFixture({ equalHeightStrength:'required' });
  const attempt=f.done.session.corrections[0];
  expect(attempt.transactionId && attempt.transactionId.startsWith('atx-'), 'the attempt names its transaction');
  const plan=attempt.plan;
  deepEq(plan.expectedImprovement, { metric:'position.x', from:130, to:100, delta:-30, direction:'TOWARD_TARGET' }, 'the expected improvement record');
  eq(f.g.historyManager.size(), f.g.historyAfterCreation+2, 'no session bookkeeping pushed history');
  eq(attempt.iteration, 1, 'the iteration index');
});

console.log('=== PHASE 3.16 Category M: Golden Scenario + Properties + Final Scans (17 tests) ===');

// The canonical trace projection (disclosed): the substrate's creation uuids
// and the content-derived digests that embed them are identity entropy, not
// 3.16 output. Every UUID-format token and every fixed-width hex digest is
// replaced by a placeholder; everything else (statuses, numbers, structure,
// ordering, message text) must be byte-identical across runs.
function canonicalizeTrace(json){
  return json
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '«uuid»')
    .replace(/\b[a-z][a-z0-9]*-[0-9a-f]{8}\b/g, '«digest»');
}

// The compact deterministic evidence projection of a golden run.
async function mGoldenEvidence(){
  const m=await mGolden();
  const g=m.g;
  const dev=m.initialEvaluation.deviations[0];
  return {
    initialGeometry: m.initialGeometry.map(p=>({ x:p.x, y:p.y, width:p.width, height:p.height })),
    inference: {
      houseTypes: m.inference.proposals.map(p=>p.houseType),
      objectCount: m.inference.proposals.map(p=>p.objectIds.length),
      unmatched: m.inference.unmatched
    },
    accepted: m.accepted.map(r=>({ type:r.type, strength:r.strength, enabled:r.enabled, source:r.source })),
    drift: { beforeHistory: m.historyAfterCreation, afterHistory: g.historyManager.size(), id: m.drift.id },
    initialEvaluation: {
      status: m.initialEvaluation.status,
      deviation: { property: dev.property, expected: dev.expected, actual: dev.actual, delta: dev.delta, objectId: dev.objectId },
      constraintDeviations: m.initialEvaluation.metadata.constraintDeviations.map(c=>({ type:c.type, property:c.property, expected:c.expected, actual:c.actual, violatedObjectId:c.violatedObjectId }))
    },
    critique: {
      proposalCount: m.critique.length,
      intent: m.critique[0] ? m.critique[0].intent : null
    },
    agenda: { category: m.agendaTarget.category, metric: m.agendaTarget.metric, observedValue: m.agendaTarget.observedValue, targetValue: m.agendaTarget.targetValue },
    loop: {
      status: m.done.status, terminationReason: m.done.terminationReason,
      executedAttempts: m.done.executedAttempts,
      trail: m.done.session.visitedStates,
      correctionStatuses: m.done.session.corrections.map(a=>a.status),
      convergence: m.done.convergence.kind
    },
    correctionTransactionIdPrefix: typeof m.correctionTxId==='string' ? m.correctionTxId.slice(0,4) : null,
    reEvaluation: { status: m.reEvaluation.status, deviationCount: m.reEvaluation.deviations.length,
      constraintDeviations: m.reEvaluation.metadata.constraintDeviations.length },
    finalGeometry: g.objectIds.map(id=>{ const p=g.geomParamsOf(id); return { x:p.x, y:p.y, width:p.width, height:p.height }; }),
    historySize: g.historyManager.size(),
    storeSnapshotChangedFromCreation: g.snapshot()===m.creationSnapshot
  };
}

test('M-1 (§67 golden): the END-TO-END loop — document -> T19 -> accepted records -> planner pipeline -> drift transaction -> evaluation -> critic -> correction loop -> correction transaction -> re-evaluation -> VERIFIED, with all eleven evidence items live', async ()=>{
  const m=await mGolden();
  const g=m.g;
  // ① the initial document state: the committed column (post-creation, pre-inference)
  eq(m.initialGeometry.length, 3, '① three committed rects');
  for(let i=0;i<3;i++){
    eq(m.initialGeometry[i].x, 100, `① rect ${i} left edge at x=100`);
    eq(m.initialGeometry[i].width, 80, `① rect ${i} width 80`);
    eq(m.initialGeometry[i].height, 60, `① rect ${i} height 60`);
  }
  // ② the T19 proposal set
  deepEq(m.inference.proposals.map(p=>p.houseType), ['equalWidth','equalHeight','alignLeft'], '② the three inferred constraints in table order');
  for(const p of m.inference.proposals) expect(isUUIDFormat(p.id), '② content-derived UUID ids');
  // ③ the accepted constraint records (LIVE ConstraintStore)
  eq(g.constraintStore.size(), 3, '③ three accepted records');
  deepEq(m.accepted.map(r=>r.type), ['equalWidth','equalHeight','alignLeft'], '③ the accepted types');
  deepEq(m.accepted.map(r=>r.strength), ['strong','required','strong'], '③ T19 inferred strong; the fixture\'s user act hardened equalHeight');
  // ④ the Planner output (ExpectedState + Plan per creation intent, validated)
  for(const r of g.rects){
    eq(r.expectedState.status, 'requested', '④ the planner ExpectedState');
    eq(gValidatePlan(r.plan, gPlanningContext({ artboard:G3_ARTBOARD, objects:{} })).valid, true, '④ the creation plan validates');
    deepEq(r.plan.steps.map(s=>s.toolId), ['T01','T07'], '④ the documented T01->T07 slice');
  }
  // ⑤ the first post-acceptance transaction: the drift
  eq(m.drift.after, m.historyAfterCreation+1, '⑤ the drift committed as its own transaction');
  eq(m.drift.id, 'tx-drift-g3', '⑤ the drift transaction id');
  eq(m.driftGeometry[2].x, 130, '⑤ the drift moved the third rect to x=130');
  // ⑥ the EvaluationResult: deviations + metadata.constraintDeviations
  eq(m.initialEvaluation.status, 'DEVIATION', '⑥ the pre-loop evaluation deviates');
  eq(m.initialEvaluation.deviations.length, 1, '⑥ exactly one §13 deviation');
  eq(m.initialEvaluation.deviations[0].property, 'position.x', '⑥ the pinned-axis class');
  eq(m.initialEvaluation.metadata.constraintDeviations.length, 1, '⑥ the constraint provenance in metadata');
  eq(m.initialEvaluation.metadata.constraintDeviations[0].constraintId, m.accepted[2].id, '⑥ the provenance names the accepted record');
  // ⑦ the Critic proposals (the constraint rule inside the §23 rule engine)
  eq(m.critique.length, 1, '⑦ one correction proposal');
  eq(gValidateProposal(m.critique[0]).valid, true, '⑦ a valid §25 record');
  deepEq(m.critique[0].intent, { type:'transform', targets:[g.objectIds[2]], operation:'translate', params:{ x:-30, y:0 } }, '⑦ the translate correction');
  // ⑧ the Correction Loop outcome
  eq(m.done.status, 'TERMINATED', '⑧ terminated');
  eq(m.done.terminationReason, 'VERIFIED', '⑧ the VERIFIED outcome');
  eq(m.done.executedAttempts, 1, '⑧ one attempt');
  // ⑨ the independent correction transaction
  expect(m.correctionTxId && m.correctionTxId.startsWith('atx-'), `⑨ the content-derived attempt transaction id: ${m.correctionTxId}`);
  expect(m.correctionTxId!==m.drift.id && m.correctionTxId!==m.request.rootTransactionId, '⑨ independent of root and drift');
  expect(g.historyManager.getAll().some(t=>t.id===m.correctionTxId), '⑨ the correction transaction is in the linear history');
  // ⑩ the re-evaluation result
  eq(m.reEvaluation.status, 'PASS', '⑩ the re-evaluation is clean');
  eq(m.reEvaluation.deviations.length, 0, '⑩ zero deviations');
  eq(m.reEvaluation.metadata.constraintDeviations.length, 0, '⑩ zero constraint violations');
  // ⑪ the final verdict + the restored substrate
  eq(g.geomParamsOf(g.objectIds[2]).x, 100, '⑪ the left edge restored');
  eq(g.historyManager.size(), m.historyAfterCreation+2, '⑪ creations + drift + correction — linear');
});

test('M-2 (§67 golden determinism): two full golden runs produce byte-identical canonical evidence traces (the disclosed identity-entropy projection)', async ()=>{
  const a=canonicalizeTrace(jsonOf(await mGoldenEvidence()));
  const b=canonicalizeTrace(jsonOf(await mGoldenEvidence()));
  eq(a, b, 'the canonical traces are byte-identical');
  expect(a.includes('«uuid»'), 'the projection is real: identity entropy was present and normalized');
});

test('M-3 (P-1 Determinism): the whole 3.16 chain is deterministic — identical substrate state yields byte-identical evaluation JSON, inference, and critique (Invariant 17)', async ()=>{
  const g=await g3Column();
  g3Accept(g, T19.inferConstraints({ utterance:'equal width, equal height, align the left edges', objects:g3ObjectSpecs(g) }).proposals);
  g3Drift(g, 30, 0);
  const c1=g3Critic(g), c2=g3Critic(g);
  const e1=c1.evaluate(g.docContext, g.docEvalContext());
  const e2=c2.evaluate(g.docContext, g.docEvalContext());
  deepEq(jsonOf(e1), jsonOf(e2), 'byte-identical §12 records (ids included)');
  const inf1=T19.inferConstraints({ utterance:'equal width', objects:g3ObjectSpecs(g) });
  const inf2=T19.inferConstraints({ utterance:'equal width', objects:g3ObjectSpecs(g) });
  deepEq(jsonOf(inf1), jsonOf(inf2), 'byte-identical inference');
  deepEq(jsonOf(regularProposeCorrections(e1)), jsonOf(regularProposeCorrections(e2)), 'byte-identical critique');
});

test('M-4 (P-2 Identity): the same logical constraint yields the same stable content-derived id across paraphrases, runs, and the acceptance chain; any logical change moves the id', ()=>{
  const objects=[{id:'a', x:1, y:1},{id:'b', x:1, y:2}];
  const idPhrase1=T19.inferConstraints({ utterance:'equal width', objects }).proposals[0].id;
  const idPhrase2=T19.inferConstraints({ utterance:'same width', objects }).proposals[0].id;
  const idRerun=T19.inferConstraints({ utterance:'equal width', objects:clone(objects) }).proposals[0].id;
  eq(idPhrase1, idPhrase2, 'paraphrase identity');
  eq(idPhrase1, idRerun, 'run identity');
  eq(T19.toHouseConstraintRecord(T19.inferConstraints({ utterance:'equal width', objects }).proposals[0]).id, idPhrase1, 'the acceptance chain preserves the id');
  const idDifferentObjects=T19.inferConstraints({ utterance:'equal width', objects:[{id:'a'},{id:'c'}] }).proposals[0].id;
  expect(idDifferentObjects!==idPhrase1, 'a different participant set moves the id');
  const idDifferentType=T19.inferConstraints({ utterance:'equal height', objects }).proposals[0].id;
  expect(idDifferentType!==idPhrase1, 'a different logical constraint moves the id');
});

test('M-5 (P-3 Scope): constraint evaluation reads ONLY the referenced objects — a constraint over [A,B] is blind to C, at the compliance arm AND at the safety gate', async ()=>{
  const doc=mDoc(G3_SPECS);
  const drifted=mDoc([{id:UA, x:100, y:100, width:80, height:60},{id:UB, x:100, y:200, width:80, height:60},{id:UC, x:500, y:900, width:999, height:999}]);
  const abOnly=[mConstraint('alignLeft',[UA,UB],{id:'c-ab'})];
  const clean=jEvaluate(doc, abOnly);
  const stillClean=jEvaluate(drifted, abOnly);
  deepEq(jsonOf(clean.deviations), jsonOf(stillClean.deviations), 'no bleed: C\'s wild drift cannot change the [A,B] deviations');
  deepEq(jsonOf(clean.metadata.constraintResults), jsonOf(stillClean.metadata.constraintResults), 'no bleed at the verdict level');
  // the gate face: a C-targeted fix is judged only by constraints TOUCHING C
  const t05={ toolId:'T05', input:{ objectIds:[UC], delta:{ x:-30, y:0 } } };
  const bystander=[mConstraint('equalWidth',[UA,UB],{strength:'required', id:'c-ab-hard'})];
  const gateAway=evaluateCorrectionSafety([UC], [t05], bystander);
  eq(gateAway.status, 'PRESERVED', 'the bystander hard constraint does not reject a C-targeted fix');
  deepEq(gateAway.hardConstraintsPreserved, [], 'and it is not claimed as preserved either (it was never considered)');
  const touching=[mConstraint('equalWidth',[UA,UC],{strength:'required', id:'c-ac-hard'})];
  const gateTouch=evaluateCorrectionSafety([UC], [t05], touching);
  eq(gateTouch.status, 'PRESERVED', 'the touching constraint pins width — a pure translation preserves it');
  deepEq(gateTouch.hardConstraintsPreserved, ['c-ac-hard'], 'and it IS claimed as preserved');
});

test('M-6 (P-4 Non-Mutation): the 3.16 chain mutates NOTHING outside transactions — the canonical store snapshot is byte-identical across inference, compliance, and critique', async ()=>{
  const g=await g3Column();
  const before=g.snapshot();
  const inference=T19.inferConstraints({ utterance:'equal width, equal height, align the left edges', objects:g3ObjectSpecs(g) });
  eq(g.snapshot(), before, 'inference mutated nothing');
  g3Accept(g, inference.proposals);
  const critic=g3Critic(g);
  const evalRecord=critic.evaluate(g.docContext, g.docEvalContext());
  eq(g.snapshot(), before, 'the compliance evaluation mutated nothing');
  regularProposeCorrections(evalRecord);
  eq(g.snapshot(), before, 'the critique pass mutated nothing');
});

test('M-7 (P-5 Hard Constraint): accepted hard constraints are never silently degraded — the gate REJECTS the conflicting fix (L-3 face), PRESERVES the non-conflicting hard record (golden face), and the store records survive the loop byte-identical', async ()=>{
  // REJECTED face (L-3 mechanism, exercised directly on the gate)
  const hardLeft=mConstraint('alignLeft',[UA,UC],{strength:'required', id:'c-hard-left'});
  const t05={ toolId:'T05', input:{ objectIds:[UC], delta:{ x:-30, y:0 } } };
  const verdict=evaluateCorrectionSafety([UC], [t05], [hardLeft]);
  eq(verdict.status, 'REJECTED', 'the hard conflict rejects');
  eq(verdict.context.hardConstraintViolation, true, 'the violation is explicit');
  // PRESERVED face: the golden loop's hard equalHeight rides through untouched
  const m=await mGolden();
  const plan=m.done.iterationLedger[0].plan;
  const hardId=m.accepted.find(r=>r.type==='equalHeight').id;
  expect(plan.riskAssessment.constraints.hardConstraintsPreserved.includes(hardId), 'the hard record preserved through the loop');
  // the store face: every accepted record byte-identical after the loop
  deepEq(m.g.constraintStore.list(), m.accepted, 'the accepted regime unchanged');
});

test('M-8 (P-6 Transaction): every store mutation in the golden is inside a committed transaction — the linear history covers creations + drift + correction and the arms hold no write path', async ()=>{
  const m=await mGolden();
  const g=m.g;
  const h=g.historyManager;
  eq(h.size(), m.historyAfterCreation+2, 'exactly the expected transactions');
  const ids=h.getAll().map(t=>t.id);
  expect(ids.includes(m.drift.id), 'the drift is a committed transaction');
  expect(ids.includes(m.correctionTxId), 'the correction is a committed transaction');
  for(const tx of h.getAll()) eq(tx.status, 'committed', 'every entry committed');
  // the net document effect of the whole loop is the RESTORATION; the
  // transaction trail above proves both intermediate mutations were committed
  eq(g.geomParamsOf(g.objectIds[2]).x, 100, 'ended restored through the transaction trail');
});

test('M-9 (P-7 History): constraint corrections never produce non-linear history — undo restores without appending, and a post-undo push TRUNCATES the undone attempt (the invariant-13 signature)', async ()=>{
  const m=await mGolden();
  const g=m.g;
  const h=g.historyManager;
  const sizeAfterLoop=h.size();
  // undo the correction transaction: the executor's own undo (inverse + moveBack, never an append)
  g.transactionManager.undo();
  eq(h.size(), sizeAfterLoop, 'undo never appends');
  eq(h.getCurrentIndex(), sizeAfterLoop-2, 'the cursor moved back');
  eq(g.geomParamsOf(g.objectIds[2]).x, 130, 'the correction was undone exactly');
  // a new push TRUNCATES the undone transaction out of the linear array
  const replacement=new TransactionBuilder().begin({ source:'fixture', description:'post-undo re-drift', id:'tx-post-undo' })
    .addCommand(createMoveObjectCommand({ objectId: g.objectIds[2], dx:5, dy:0 })).build();
  g.transactionManager.execute(replacement);
  eq(h.size(), sizeAfterLoop, 'the push replaced the undone tail entry (truncate-then-push)');
  expect(!h.getAll().some(t=>t.id===m.correctionTxId), 'the undone tx is gone from the linear array');
  eq(g.geomParamsOf(g.objectIds[2]).x, 135, 'the replacement transaction is the new tail');
});

// ---- the final architecture scans (the whole 3.16 surface) ------------------
// Surface: the 4 production files of the 3.16 work (constraint-inference.js +
// the three modified hosts) + THIS test file's import discipline. The loop
// executor (correction.js) is the FROZEN 3.15 module — pinned by sha below,
// never rescanned here (the 3.15 G-suite owns it).
const SURFACE_FILES=['constraint-inference.js','ai.js','evaluation.js','critic.js'];
function surfaceSrc(f){ return readFileSync(new URL('../src-js/'+f, import.meta.url), 'utf-8'); }
const SURFACE_SRC=Object.fromEntries(SURFACE_FILES.map(f=>[f, surfaceSrc(f)]));
const SURFACE_STRIPPED=Object.fromEntries(SURFACE_FILES.map(f=>[f, stripCommentsAndStrings(SURFACE_SRC[f])]));
const TEST_FILE_SRC=readFileSync(new URL(import.meta.url), 'utf-8');
function surfaceWordHits(f, w){ return SURFACE_STRIPPED[f].match(new RegExp('\\b'+w+'\\b','g'))||[]; }
const TRANSACTION_JS_SHA='5ec1369b16c1294101e19d45bece4250be5fdcb1d1878eb07d6de87e5c0ea5e4';
const CORRECTION_JS_SHA='9e31da8dff4be9b5eedea67dd2f7e425ada7e53d9338bef6e083bdeae2a00fe2';
function shaOfSrc(src){ return createHash('sha256').update(src).digest('hex'); }

test('M-10: FINAL SCAN — no fetch / HTTP / network anywhere in the 3.16 surface (stripped code bodies of all four production files + the test file imports only relative or declared node: builtins)', ()=>{
  for(const f of SURFACE_FILES){
    for(const w of ['fetch','XMLHttpRequest','WebSocket']){
      eq(surfaceWordHits(f, w).join(','), '', `${f}: no ${w}`);
    }
    expect(!/\bhttps?:\/\//.test(SURFACE_STRIPPED[f]), `${f}: no raw URL in the code body`);
  }
  // the test file's own escape surface: every import specifier is relative or a declared node builtin
  const specs=importSpecifiersOfAll(TEST_FILE_SRC);
  expect(specs.length>10, 'the sweep is non-vacuous');
  for(const s of specs){
    expect(s.startsWith('./')||s.startsWith('../')||['node:fs','node:crypto'].includes(s), `the test file imports '${s}' — only relative src-js modules and the two declared node builtins are allowed`);
  }
});

test('M-11: FINAL SCAN — no fs access in the 3.16 production surface (stripped bodies: no fs, no require, no node: specifier) — the test file\'s node:fs import is the declared harness exception', ()=>{
  for(const f of SURFACE_FILES){
    eq(surfaceWordHits(f, 'fs').join(','), '', `${f}: no fs`);
    eq(surfaceWordHits(f, 'require').join(','), '', `${f}: no require`);
    expect(!/node:/.test(SURFACE_STRIPPED[f]), `${f}: no node: specifier in the code body`);
    for(const s of importSpecifiersOf(SURFACE_SRC[f])){
      expect(s.startsWith('./')||s.startsWith('../'), `${f}: import '${s}' is relative`);
    }
  }
});

test('M-12: FINAL SCAN — no LLM API vocabulary anywhere in the 3.16 surface (stripped bodies: openai, anthropic, llm, completion, embedding, api_key, apikey, chat/completions routes; the test file imports no such module)', ()=>{
  const llmWords=['openai','anthropic','llm','completion','completions','embedding','api_key','apikey'];
  for(const f of SURFACE_FILES){
    for(const w of llmWords){
      eq(surfaceWordHits(f, w).join(','), '', `${f}: no ${w}`);
    }
  }
  for(const s of importSpecifiersOfAll(TEST_FILE_SRC)){
    expect(!/openai|anthropic|sdk/i.test(s), `the test file imports '${s}' — no AI-vendor SDK`);
  }
});

test('M-13: FINAL SCAN — no direct Store writes in the 3.16 surface: the stripped production bodies carry no store-mutation call form and no store/SceneGraph constructor vocabulary (the arms are pure; the ONLY writer is the transaction pipeline)', ()=>{
  for(const f of SURFACE_FILES){
    const mut=[...SURFACE_STRIPPED[f].matchAll(T19_MUT_RE)].map(m=>m[0]);
    eq(mut.join(','), '', `${f}: no mutation-method call form`);
    for(const w of ['new ConstraintStore','new SceneGraph','new GeometryStore','new AppearanceStore','new ObjectStore']){
      expect(!SURFACE_STRIPPED[f].includes(w), `${f}: no store construction (${w})`);
    }
  }
});

test('M-14: FINAL SCAN — no direct SceneGraph mutation in the 3.16 surface: no node-creation/reparenting/removal vocabulary in the stripped production bodies', ()=>{
  for(const f of SURFACE_FILES){
    for(const w of ['createNode','deleteNode','removeNode','reparentNode','moveNode','appendChild','setParent','insertBefore']){
      eq(surfaceWordHits(f, w).join(','), '', `${f}: no ${w}`);
    }
  }
});

test('M-15: FINAL SCAN — no Transaction bypass in the 3.16 surface: the arms never execute, commit, or undo — the engine (frozen, sha-pinned) owns every execution', ()=>{
  for(const f of SURFACE_FILES){
    for(const w of ['TransactionBuilder','TransactionExecutor','transactionManager','ToolRegistry']){
      eq(surfaceWordHits(f, w).join(','), '', `${f}: no ${w}`);
    }
    const exec=[...SURFACE_STRIPPED[f].matchAll(/\.(execute|commit|undo|redo)\s*\(/g)].map(m=>m[0]);
    eq(exec.join(','), '', `${f}: no execution call form`);
  }
});

test('M-16: FINAL SCAN — no History DAG in the 3.16 surface: no HistoryManager reference in the stripped production bodies; transaction.js and correction.js remain byte-identical to their 3.15 accepted shas (the linear push-truncation implementation is untouched)', ()=>{
  for(const f of SURFACE_FILES){
    for(const w of ['HistoryManager','historyManager']){
      eq(surfaceWordHits(f, w).join(','), '', `${f}: no ${w}`);
    }
    expect(!/\bDAG\b/.test(SURFACE_STRIPPED[f]), `${f}: no DAG vocabulary`);
  }
  eq(shaOfSrc(surfaceSrc('transaction.js')), TRANSACTION_JS_SHA, 'transaction.js is byte-identical to the 3.15 accepted state');
  eq(shaOfSrc(surfaceSrc('correction.js')), CORRECTION_JS_SHA, 'correction.js is byte-identical to the 3.15 G-pristine');
});

test('M-17: FINAL SCAN — no nested transactions: the production surface never opens a builder; the ONE-attempt-ONE-transaction contract is the engine\'s (frozen) and is proven live in L-7', ()=>{
  for(const f of SURFACE_FILES){
    const begins=[...SURFACE_STRIPPED[f].matchAll(/\bbegin\s*\(/g)].map(m=>m[0]);
    eq(begins.join(','), '', `${f}: no transaction-begin call`);
  }
  eq(shaOfSrc(surfaceSrc('transaction.js')), TRANSACTION_JS_SHA, 'transaction.js unchanged — the builder cannot nest');
  eq(shaOfSrc(surfaceSrc('correction.js')), CORRECTION_JS_SHA, 'the engine unchanged — one attempt, one transaction');
});

// ---- M-18: the spec §93 module-README pin (DoD §96 item 31) -----------------
// spec §93 mandates module documentation per the repository convention and
// enumerates exactly 14 topics; DoD §96 item 31 ("Documentation complete",
// governing section §93) is closed by src-js/constraint-inference.README.md
// (the 3.14/3.15 module-README convention: evaluation.README.md,
// critic.README.md, correction.README.md). This test pins the README's
// existence AND its §93 topic coverage so the documentation cannot silently
// regress. RED-first evidence:
// scripts/phase3.16-evidence/3.16-HFINAL-m18-red.txt (106/107 with this test
// the ONLY failure, captured before the README existed).
const README_TOPICS = Object.freeze([
  'Mission', 'T19 role', 'Proposal lifecycle', 'Constraint vocabulary',
  'Planner integration', 'Evaluation integration', 'Critic integration',
  'Correction integration', 'Hard/soft semantics', 'Transaction boundary',
  'History linearity', 'Determinism', 'Failure behavior', 'Known limitations'
]);
test('M-18: FINAL SCAN — src-js/constraint-inference.README.md exists and covers the 14 spec §93 topics (the DoD §96 item 31 pin)', ()=>{
  const readme = readFileSync(new URL('../src-js/constraint-inference.README.md', import.meta.url), 'utf-8');
  expect(readme.length > 1000, 'the README is a real document, not a stub');
  for(const topic of README_TOPICS){
    expect(readme.includes(topic), `the README is missing the spec §93 topic: ${topic}`);
  }
  expect(readme.includes('constraint-inference.js'), 'the README names its module');
});

Promise.all(pending).then(()=>{
  console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
  if(failed>0) process.exit(1);
});
