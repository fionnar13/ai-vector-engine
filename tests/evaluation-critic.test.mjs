// PHASE 3.14 — CHECKPOINT A + B + C + D tests (spec §10-§14/§21-§22/§54-§55/§23-§35/§42/§57, §62-§65).
// Harness mirrors tests/ai.test.mjs (counted-suite protocol: final
// "Tests: N total, M passed, F failed" line, exit 1 on failure).
//
// Scope (Checkpoint A, spec §54): ActualState / EvaluationResult / Deviation
// data model + validators + read-only snapshot construction.
// Scope (Checkpoint B, spec §55): the deterministic evaluation engine —
// E1 existence, E2 geometry (tolerance-based), E3 appearance (hex -> RGBA
// normalization via the LOCAL normalizer), E4 placement (WorldBBox center vs
// artboard center; MISSING_PARAMETER when the artboard is absent — never an
// invented expectation), E5 structure, E6 semantic (dormant — nothing may be
// invented), E7 transform (dormant when expectations are null; per-key
// comparison when set), §22 determinism (declared deviation order:
// target-major, then fixed category rank, then fixed property order).
// Scope (Checkpoint C, spec §23-§35/§56): the Critic core — proposeCorrections
// consumes a valid EvaluationResult and produces CorrectionProposal[] through
// a deterministic capability-backed rule engine: geometry -> create-rebuild
// intent (desired-state projection), appearance fill/opacity -> T07 appearance
// intent, placement center + transform tx/ty -> translate intent (delta
// semantics, ai.js:777-779), and NO proposal wherever no safe existing
// capability maps the deviation (existence, structure, semantic, bbox edges,
// matrix keys — §28: never bypass). Proposals are inert frozen data (§26);
// dedup collapses identical corrections safely; ordering follows the deviation
// order (§30) with priority = deviation index.
//   - Independent ActualState shape, NOT ExpectedState with a different
//     status (§10/§08/§09); the 'measured' token must never appear in the
//     implementation (§07, gate 3) — asserted by the A-era source guard.
//   - Deterministic content-derived ids only (§12/§22): no Date.now(), no
//     random UUIDs — asserted by determinism tests + source guard.
//   - targetRef is mandatory in Deviation (§13, gate 7).
//   - WorldBBox composed from public pure pieces (§10/§17/§51): the tests
//     compute the expected value with the same public pieces (geometry.js
//     bbox fns + bbox.js transform) and require equality.
// Scope (Checkpoint D, spec §42/§57): the Evaluation + Critic integration —
// evaluateAndCritique(expectedState, documentContext, evaluationContext) is a
// single thin read-only orchestrator returning { evaluationResult, proposals }.
// Verified: the §57 connection (ExpectedState + observed state ->
// EvaluationResult -> CorrectionProposal[]), targetRef flow integrity (every
// deviation.targetRef set and carried EXACTLY onto its proposal; plan-level
// null refs yield plan-level proposals or no proposal per rule), determinism
// of the composed output (byte-identical JSON + sha256 across repeated runs,
// and orchestrator output === manual two-step composition), and the §42
// four-layer immutability proof on the integrated path (Layer 1 stores
// untouched by the full pipeline, Layer 2 ActualState deep-frozen, Layer 3
// critique mutates neither stores nor the result, Layer 4 proposals are inert
// plain data with no execution authority). The orchestrator consumes a
// documentContext (the injected read surface), NOT a pre-built ActualState —
// per §11 the ActualState must be constructed inside the pipeline by
// buildActualState from the authoritative stores.
// A-era source guard mirrors the 3.13 precedent (tests/ai.test.mjs:225
// static scans). The full comment/string-aware G-pattern suite is
// implemented below (Checkpoint G, spec §60) and AUGMENTS these A-era
// scans, which are retained as accepted-checkpoint evidence.

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildExpectedState, createExpectedState, createPlan, validateIntent, validatePlan, compilePlanToDSL, createPlanningContext } from '../src-js/ai.js';
import { GeometryStore, AppearanceStore, ObjectStore } from '../src-js/stores.js';
import { SceneGraph } from '../src-js/scenegraph.js';
import { rectBBox, ellipseBBox } from '../src-js/geometry.js';
import * as BBox from '../src-js/bbox.js';
import { parseDSL, validateDSL, compileToIR, DSLExecutor } from '../src-js/dsl.js';
import { TransactionExecutor, HistoryManager, EventBus } from '../src-js/transaction.js';
import { createCoreToolRegistry } from '../src-js/tools.js';
import {
  EvaluationErrorCodes, EvaluationError,
  DEVIATION_CATEGORIES, DEVIATION_SEVERITIES,
  buildActualState, validateActualState,
  createDeviation, validateDeviation,
  createEvaluationResult, validateEvaluationResult,
  evaluate, EVALUATION_TOLERANCES
} from '../src-js/evaluation.js';
import {
  CriticErrorCodes, CriticError,
  createCorrectionProposal, validateCorrectionProposal,
  proposeCorrections, evaluateAndCritique
} from '../src-js/critic.js';
import * as EvaluationNS from '../src-js/evaluation.js';
import * as CriticNS from '../src-js/critic.js';

let total=0, passed=0, failed=0;
const pending=[];
function test(name, fn){ total++; try{ const r=fn(); if(r&&typeof r.then==='function'){ pending.push(r.then(()=>{passed++; console.log(`✓ ${name}`);}, e=>{failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);})); } else { passed++; console.log(`✓ ${name}`);} }catch(e){ failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }
function eq(a,b,msg){ if(a!==b) throw new Error(`${msg||'eq failed'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function throwsWithCode(fn, code, msg){
  let threw=null;
  try{ fn(); }catch(e){ threw=e; }
  expect(threw, `${msg||'expected throw'}: nothing was thrown`);
  expect(threw instanceof EvaluationError, `${msg||'expected EvaluationError'}: got ${threw && threw.constructor && threw.constructor.name}: ${threw}`);
  eq(threw.code, code, `${msg||'error code'} — message: ${threw.message}`);
}

// ---------------------------------------------------------------------------
// Fixture: the 3.13 vertical-slice document shape (red rounded rectangle,
// 200x100, rx=ry=12) expressed through the canonical stores + SceneGraph.
// Fixed deterministic UUID literals (stores validate UUID format; no random
// ids anywhere in the harness — §22 discipline).
// ---------------------------------------------------------------------------
const OID='11111111-1111-4111-8111-111111111111';
const GID='22222222-2222-4222-8222-222222222222';
const AID='33333333-3333-4333-8333-333333333333';
const EOID='44444444-4444-4444-8444-444444444444';
const EGID='55555555-5555-4555-8555-555555555555';
const EAID='66666666-6666-4666-8666-666666666666';
const SGID='77777777-7777-4777-8777-777777777777';

function makeDoc(opts={}){
  const { width=200, height=100, rx=12, ry=12, tx=0, ty=0, withFill=true,
          fillColor={r:255, g:0, b:0, a:1}, fillKind='solid', fillOpacity=1, fillEnabled=true } = opts;
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore();
  geometryStore.create(GID, {isParametric:true, type:'rect', params:{x:0, y:0, width, height, rx, ry}});
  const stack = withFill
    ? [{id:'fill-item-1', type:'fill', enabled:fillEnabled, data:{kind:fillKind, color:fillColor, opacity:fillOpacity}}]
    : [];
  appearanceStore.create(AID, {id:AID, stack});
  objectStore.create({id:OID, geometryRef:GID, appearanceRef:AID});
  const sceneGraph=new SceneGraph({hasObject:(id)=>objectStore.has(id)});
  const nodeId=sceneGraph.createNode(OID, null, {a:1, b:0, c:0, d:1, tx, ty}).id;
  return { geometryStore, appearanceStore, objectStore, sceneGraph, nodeId };
}

function docContext(doc){
  return { objectStore: doc.objectStore, geometryStore: doc.geometryStore, appearanceStore: doc.appearanceStore, sceneGraph: doc.sceneGraph };
}

function evalContext(targets){
  return { targets: targets || [{objectId:OID, targetRef:'$step-1'}] };
}

function captureStores(doc){
  const read=(store)=>store.listIds().sort().map((id)=>store.get(id));
  return JSON.stringify({
    objects: read(doc.objectStore),
    geometries: read(doc.geometryStore),
    appearances: read(doc.appearanceStore),
    nodes: doc.sceneGraph.getAllNodes()
  });
}

// ---------------------------------------------------------------------------
// Checkpoint B fixtures (spec §14-§22/§55): the 3.13 vertical-slice intent
// (red rounded rectangle, 200x100, r12) on a 400x300 artboard. Centered
// execution state = node transform tx:100/ty:100 (plan-time centering, ai.js
// Rule B), giving worldBBox 100..300 / 100..200 centered exactly on (200,150).
// ---------------------------------------------------------------------------
const B_ARTBOARD={ width:400, height:300, centerX:200, centerY:150 };
function bExpected(overrides={}){
  const intent={ type:'create', objectType:'rect', width:200, height:100, rx:12, ry:12, fill:'#FF0000', placement:'center', ...overrides };
  return buildExpectedState(intent);
}
function bContext(targets){
  return { targets: targets || [{objectId:OID, targetRef:'$step-1'}], artboard: B_ARTBOARD };
}
function makeEllipseDoc(){
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore();
  geometryStore.create(EGID, {isParametric:true, type:'ellipse', params:{cx:0, cy:0, rx:30, ry:40}});
  appearanceStore.create(EAID, {id:EAID, stack:[]});
  objectStore.create({id:EOID, geometryRef:EGID, appearanceRef:EAID});
  const sceneGraph=new SceneGraph({hasObject:(id)=>objectStore.has(id)});
  sceneGraph.createNode(EOID, null, {a:1, b:0, c:0, d:1, tx:0, ty:0});
  return { geometryStore, appearanceStore, objectStore, sceneGraph };
}
function makeGroupedDoc(opts={}){
  const { width=200, height=100, rx=12, ry=12, tx=0, ty=0 } = opts;
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore();
  geometryStore.create(GID, {isParametric:true, type:'rect', params:{x:0, y:0, width, height, rx, ry}});
  appearanceStore.create(AID, {id:AID, stack:[{id:'fill-item-1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255, g:0, b:0, a:1}, opacity:1}}]});
  objectStore.create({id:OID, geometryRef:GID, appearanceRef:AID});
  const sceneGraph=new SceneGraph({hasObject:(id)=>objectStore.has(id)});
  const groupId=sceneGraph.createGroup(null, {a:1, b:0, c:0, d:1, tx:0, ty:0}).id;
  const nodeId=sceneGraph.createNode(OID, groupId, {a:1, b:0, c:0, d:1, tx, ty}).id;
  return { geometryStore, appearanceStore, objectStore, sceneGraph, nodeId, groupId };
}
function categoryPropertySeq(result){
  return result.deviations.map((d)=>`${d.category}:${d.property}`);
}
function sha256(s){ return createHash('sha256').update(s).digest('hex'); }

console.log('=== PHASE 3.14 Checkpoint A: error model (spec §54; house style) ===');
test('A-1: evaluation error codes exist and EvaluationError behaves like PlanningError', ()=>{
  for(const code of ['INVALID_DOCUMENT_CONTEXT','INVALID_EVALUATION_CONTEXT','INVALID_ACTUAL_STATE','INVALID_DEVIATION','INVALID_EVALUATION_RESULT','INVALID_EXPECTED_STATE']){
    eq(EvaluationErrorCodes[code], code, `missing code ${code}`);
  }
  const err=new EvaluationError('INVALID_DEVIATION','bad deviation',{at:1});
  expect(err instanceof Error, 'EvaluationError is an Error');
  eq(err.code, 'INVALID_DEVIATION');
  eq(err.name, 'EvaluationError');
  eq(err.details && err.details.at, 1);
});
test('A-2: deviation category + severity vocabularies are exactly the §13 enums', ()=>{
  eq(DEVIATION_CATEGORIES.join(','), 'existence,geometry,appearance,placement,structure,transform,semantic', '§13 category enum');
  eq(DEVIATION_SEVERITIES.join(','), 'error,warning', '§13 severity enum');
});

console.log('=== PHASE 3.14 Checkpoint A: ActualState construction (spec §10/§11) ===');
test('A-3: existing rect object is observed read-only with geometry, fill, placement, structure', ()=>{
  const doc=makeDoc();
  const state=buildActualState(docContext(doc), evalContext());
  eq(state.objects.length, 1, 'one entry for one target');
  const e=state.objects[0];
  eq(e.objectId, OID);
  eq(e.targetRef, '$step-1');
  eq(e.exists, true);
  eq(e.geometryRef, GID);
  eq(e.appearanceRef, AID);
  eq(e.geometry.type, 'rect');
  eq(e.geometry.params.width, 200);
  eq(e.geometry.params.height, 100);
  eq(e.geometry.params.rx, 12);
  eq(e.geometry.params.ry, 12);
  eq(JSON.stringify(e.worldTransform), JSON.stringify({a:1,b:0,c:0,d:1,tx:0,ty:0}));
  eq(JSON.stringify(e.worldBBox), JSON.stringify({minX:0,minY:0,maxX:200,maxY:100}));
  eq(e.parentNodeId, null, 'root node has no parent');
  eq(e.parentIsGroup, null);
  eq(JSON.stringify(e.childrenNodeIds), '[]');
  eq(JSON.stringify(e.fill), JSON.stringify({kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1, enabled:true}));
});
test('A-4: missing object is observed as exists:false with null observation fields (§21 substrate)', ()=>{
  const doc=makeDoc();
  const state=buildActualState(docContext(doc), evalContext([{objectId:EOID, targetRef:'$doc:'+EOID}]));
  const e=state.objects[0];
  eq(e.exists, false);
  eq(e.geometryRef, null);
  eq(e.appearanceRef, null);
  eq(e.geometry, null);
  eq(e.worldTransform, null);
  eq(e.worldBBox, null);
  eq(e.parentNodeId, null);
  eq(e.parentIsGroup, null);
  eq(JSON.stringify(e.childrenNodeIds), '[]');
  eq(e.fill, null);
});
test('A-5: WorldBBox = geometryBBox ⊕ BBox.transform(local, worldTransform) via public pure pieces (§17/§51)', ()=>{
  const doc=makeDoc({tx:50, ty:25});
  const state=buildActualState(docContext(doc), evalContext());
  const local=rectBBox({x:0, y:0, width:200, height:100, rx:12, ry:12});
  const wt={a:1, b:0, c:0, d:1, tx:50, ty:25};
  const expectedWorld=BBox.transform(local, wt);
  eq(JSON.stringify(state.objects[0].worldBBox), JSON.stringify(expectedWorld),
    'observed WorldBBox must equal the composition of the same public pieces');
  eq(state.objects[0].worldBBox.minX, 50);
  eq(state.objects[0].worldBBox.maxX, 250);
  eq(state.objects[0].worldBBox.minY, 25);
  eq(state.objects[0].worldBBox.maxY, 125);
  const c=BBox.center(state.objects[0].worldBBox);
  eq(c.x, 150); eq(c.y, 75);
});
test('A-6: ellipse geometry observed with center-anchor params (T02 contract)', ()=>{
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore();
  geometryStore.create(EGID, {isParametric:true, type:'ellipse', params:{cx:10, cy:20, rx:30, ry:40}});
  appearanceStore.create(EAID, {id:EAID, stack:[]});
  objectStore.create({id:EOID, geometryRef:EGID, appearanceRef:EAID});
  const sceneGraph=new SceneGraph({hasObject:(id)=>objectStore.has(id)});
  sceneGraph.createNode(EOID, null, {a:1, b:0, c:0, d:1, tx:0, ty:0});
  const state=buildActualState({objectStore, geometryStore, appearanceStore, sceneGraph},
    {targets:[{objectId:EOID, targetRef:'$step-1'}]});
  const e=state.objects[0];
  eq(e.geometry.type, 'ellipse');
  eq(JSON.stringify(e.geometry.params), JSON.stringify({cx:10, cy:20, rx:30, ry:40}));
  const expectedWorld=BBox.transform(ellipseBBox({cx:10, cy:20, rx:30, ry:40}), {a:1,b:0,c:0,d:1,tx:0,ty:0});
  eq(JSON.stringify(e.worldBBox), JSON.stringify(expectedWorld));
  eq(e.worldBBox.minX, -20); eq(e.worldBBox.maxX, 40);
});
test('A-7: unsupported geometry type is observed verbatim with worldBBox null — no invented measurement', ()=>{
  const doc=makeDoc();
  doc.geometryStore.update(GID, {isParametric:true, type:'star', params:{center:{x:0,y:0}, outerRadius:10, innerRadius:5, points:5, rotationDegrees:0}});
  const state=buildActualState(docContext(doc), evalContext());
  const e=state.objects[0];
  eq(e.geometry.type, 'star');
  eq(e.geometry.params.outerRadius, 10);
  eq(e.worldBBox, null, 'worldBBox stays null for types the local pure dispatcher does not cover');
});
test('A-8: appearance stack without a fill item observes fill:null (§16 substrate honesty)', ()=>{
  const doc=makeDoc({withFill:false});
  const state=buildActualState(docContext(doc), evalContext());
  eq(state.objects[0].fill, null);
});

test('A-9: buildActualState is deterministic — identical stores yield byte-identical snapshots (§22)', ()=>{
  const docA=makeDoc();
  const docB=makeDoc();
  const a=buildActualState(docContext(docA), evalContext());
  const b=buildActualState(docContext(docB), evalContext());
  eq(JSON.stringify(a), JSON.stringify(b), 'same logical document + same context => identical snapshot JSON');
});
test('A-10: buildActualState does not mutate the canonical stores (§42 Layer 1; gate 25 substrate)', ()=>{
  const doc=makeDoc({tx:33, ty:-7});
  const before=captureStores(doc);
  buildActualState(docContext(doc), evalContext());
  const after=captureStores(doc);
  eq(after, before, 'store + hierarchy JSON must be untouched by snapshot construction');
});
test('A-11: ActualState is an immutable snapshot — deep-frozen root, entries, and nested values (§10/§42 Layer 2)', ()=>{
  const doc=makeDoc();
  const state=buildActualState(docContext(doc), evalContext());
  expect(Object.isFrozen(state), 'root frozen');
  expect(Object.isFrozen(state.objects), 'objects array frozen');
  const e=state.objects[0];
  expect(Object.isFrozen(e), 'entry frozen');
  expect(Object.isFrozen(e.geometry), 'geometry projection frozen');
  expect(Object.isFrozen(e.geometry.params), 'geometry params frozen');
  expect(Object.isFrozen(e.worldBBox), 'worldBBox frozen');
  expect(Object.isFrozen(e.fill), 'fill projection frozen');
  expect(Object.isFrozen(e.fill.color), 'fill color frozen');
  let threw=null;
  try{ e.exists=false; }catch(err){ threw=err; }
  expect(threw instanceof TypeError, 'strict-mode assignment into the frozen snapshot must throw TypeError');
});
test('A-12: buildActualState rejects a non-conforming document context (duck-typed read surface)', ()=>{
  const doc=makeDoc();
  throwsWithCode(()=>buildActualState({geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, evalContext()),
    'INVALID_DOCUMENT_CONTEXT', 'missing objectStore');
  throwsWithCode(()=>buildActualState({objectStore:doc.objectStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, evalContext()),
    'INVALID_DOCUMENT_CONTEXT', 'missing geometryStore');
  throwsWithCode(()=>buildActualState({objectStore:doc.objectStore, geometryStore:doc.geometryStore, sceneGraph:doc.sceneGraph}, evalContext()),
    'INVALID_DOCUMENT_CONTEXT', 'missing appearanceStore');
  throwsWithCode(()=>buildActualState({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore}, evalContext()),
    'INVALID_DOCUMENT_CONTEXT', 'missing sceneGraph');
  throwsWithCode(()=>buildActualState({objectStore:{}, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, evalContext()),
    'INVALID_DOCUMENT_CONTEXT', 'objectStore without get()');
  throwsWithCode(()=>buildActualState({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:{findNodeByObjectId:doc.sceneGraph.findNodeByObjectId}},
    evalContext()),
    'INVALID_DOCUMENT_CONTEXT', 'sceneGraph without world transform read');
});
test('A-13: buildActualState rejects invalid evaluation contexts (§13 reference grammar, deterministic ambiguity refusal)', ()=>{
  const doc=makeDoc();
  const ctx=docContext(doc);
  throwsWithCode(()=>buildActualState(ctx, undefined), 'INVALID_EVALUATION_CONTEXT', 'context required');
  throwsWithCode(()=>buildActualState(ctx, {}), 'INVALID_EVALUATION_CONTEXT', 'targets required');
  throwsWithCode(()=>buildActualState(ctx, {targets:[]}), 'INVALID_EVALUATION_CONTEXT', 'targets non-empty');
  throwsWithCode(()=>buildActualState(ctx, {targets:[{objectId:7, targetRef:'$step-1'}]}), 'INVALID_EVALUATION_CONTEXT', 'objectId must be a string');
  throwsWithCode(()=>buildActualState(ctx, {targets:[{objectId:OID, targetRef:'step-1'}]}), 'INVALID_EVALUATION_CONTEXT', "targetRef must be null or '$'-prefixed (§13 grammar)");
  throwsWithCode(()=>buildActualState(ctx, {targets:[{objectId:OID, targetRef:'$step-1'},{objectId:OID, targetRef:'$step-1'}]}), 'INVALID_EVALUATION_CONTEXT', 'duplicate objectId is ambiguous');
  throwsWithCode(()=>buildActualState(ctx, {targets:[{objectId:OID, targetRef:'$doc:'+OID},{objectId:EOID, targetRef:'$doc:'+OID}]}), 'INVALID_EVALUATION_CONTEXT', 'duplicate targetRef is ambiguous');
});

console.log('=== PHASE 3.14 Checkpoint A: validateActualState ===');
test('A-14: snapshots validate; corrupted variants fail with INVALID_ACTUAL_STATE', ()=>{
  const doc=makeDoc();
  const state=buildActualState(docContext(doc), evalContext());
  eq(validateActualState(state).valid, true, 'round-trip: built snapshot passes its own validator');
  const corrupt=(fn)=>{
    const clone=JSON.parse(JSON.stringify(state));
    fn(clone);
    const v=validateActualState(clone);
    expect(v.valid===false, `expected invalid for ${fn.toString().slice(0,60)}`);
    expect(v.errors.every((e)=>e.code==='INVALID_ACTUAL_STATE'), 'all errors carry INVALID_ACTUAL_STATE');
  };
  corrupt((s)=>{ delete s.objects; });
  corrupt((s)=>{ s.objects=[]; });
  corrupt((s)=>{ delete s.objects[0].objectId; });
  corrupt((s)=>{ s.objects[0].exists='yes'; });
  corrupt((s)=>{ s.objects[0].geometry={type:'', params:{}}; });
  corrupt((s)=>{ s.objects[0].geometry={type:'rect', params:'nope'}; });
  corrupt((s)=>{ s.objects[0].worldBBox={minX:NaN,minY:0,maxX:1,maxY:1}; });
  corrupt((s)=>{ s.objects[0].worldTransform={a:1,b:0,c:0,d:'x',tx:0,ty:0}; });
  corrupt((s)=>{ s.objects[0].targetRef='step-1'; });
  corrupt((s)=>{ s.objects[0].childrenNodeIds=[3]; });
  corrupt((s)=>{ s.objects[0].fill={kind:123, color:{r:255,g:0,b:0,a:1}, opacity:1, enabled:true}; });
  corrupt((s)=>{ s.objects[0].parentIsGroup='no'; });
  const fnState=JSON.parse(JSON.stringify(state));
  fnState.objects[0].geometry.params.toString=()=> 'x';
  const v=validateActualState(fnState);
  expect(v.valid===false, 'function values are rejected (plain-data discipline)');
});
test('A-15: validateActualState rejects non-object input and empty-object entries', ()=>{
  eq(validateActualState(null).valid, false);
  eq(validateActualState('x').valid, false);
  eq(validateActualState({objects:[{}]}).valid, false, 'entry without the observed fields is invalid');
});

console.log('=== PHASE 3.14 Checkpoint A: Deviation (spec §13) ===');
test('A-16: createDeviation returns a frozen structured record with a content-derived id (§13/§12)', ()=>{
  const d=createDeviation({
    category:'geometry', property:'width', expected:200, actual:190,
    delta:-10, tolerance:0.01, severity:'error', objectId:OID, targetRef:'$step-1',
    message:'width differs from the requested value'
  });
  const keys=Object.keys(d).sort().join(',');
  eq(keys, 'actual,category,delta,expected,id,message,objectId,property,severity,targetRef,tolerance', 'exactly the 11 §13 fields');
  expect(typeof d.id==='string' && /^dev-[0-9a-f]{8}$/.test(d.id), `content-derived id shape, got ${d.id}`);
  expect(Object.isFrozen(d), 'deviation frozen');
});
test('A-17: deviation id is content-derived — identical content yields identical id, content change moves the id (§22, gate 8)', ()=>{
  const content={category:'geometry', property:'width', expected:200, actual:190, delta:-10, tolerance:0.01, severity:'error', objectId:OID, targetRef:'$step-1', message:'width differs'};
  const a=createDeviation(content);
  const b=createDeviation({...content});
  eq(a.id, b.id, 'same content => same id');
  const c=createDeviation({...content, property:'height'});
  expect(a.id!==c.id, 'content change => different id');
  const d=createDeviation({...content, message:'width differs from requested'});
  expect(a.id!==d.id, 'message is part of the content hash (deterministic, not random)');
});
test('A-18: absent optional deviation fields normalize to null; all 11 keys stay present', ()=>{
  const d=createDeviation({category:'existence', property:'object', severity:'error', message:'expected object was not found'});
  eq(d.expected, null);
  eq(d.actual, null);
  eq(d.delta, null);
  eq(d.tolerance, null);
  eq(d.objectId, null);
  eq(d.targetRef, null, 'plan-level existence deviation may bind no reference (§21)');
  eq(Object.keys(d).length, 11);
});
test('A-19: createDeviation enforces the §13 content contract (deterministic refusals)', ()=>{
  const base={category:'geometry', property:'width', expected:200, actual:190, severity:'error', message:'width differs'};
  throwsWithCode(()=>createDeviation({...base, category:'vibes'}), 'INVALID_DEVIATION', 'category enum');
  throwsWithCode(()=>createDeviation({...base, severity:'fatal'}), 'INVALID_DEVIATION', 'severity enum');
  throwsWithCode(()=>createDeviation({...base, property:''}), 'INVALID_DEVIATION', 'property non-empty');
  throwsWithCode(()=>createDeviation({...base, message:''}), 'INVALID_DEVIATION', 'message non-empty');
  throwsWithCode(()=>createDeviation({...base, delta:NaN}), 'INVALID_DEVIATION', 'delta finite or null');
  throwsWithCode(()=>createDeviation({...base, tolerance:-1}), 'INVALID_DEVIATION', 'tolerance >= 0 or null');
  throwsWithCode(()=>createDeviation({...base, expected:()=>1}), 'INVALID_DEVIATION', 'plain-data expected');
  throwsWithCode(()=>createDeviation({...base, targetRef:'step-1'}), 'INVALID_DEVIATION', "targetRef null or '$'-prefixed");
  throwsWithCode(()=>createDeviation({...base, objectId:''}), 'INVALID_DEVIATION', 'objectId null or non-empty');
});
test('A-20: validateDeviation — valid records pass; every missing §13 key fails; targetRef key is mandatory (gate 7)', ()=>{
  const d=createDeviation({category:'appearance', property:'fill.color', expected:'#FF0000', actual:{kind:'solid', color:{r:0,g:0,b:255,a:1}}, severity:'error', objectId:OID, targetRef:'$doc:'+OID, message:'fill color differs'});
  eq(validateDeviation(d).valid, true, 'round-trip: built deviation passes');
  for(const key of ['id','category','property','expected','actual','delta','tolerance','severity','objectId','targetRef','message']){
    const clone=JSON.parse(JSON.stringify(d));
    delete clone[key];
    const v=validateDeviation(clone);
    expect(v.valid===false, `deleting key ${key} must invalidate the deviation`);
    expect(v.errors.every((e)=>e.code==='INVALID_DEVIATION'), `key ${key}: errors carry INVALID_DEVIATION`);
  }
  eq(validateDeviation(null).valid, false);
  const badFn=JSON.parse(JSON.stringify(d));
  badFn.actual.render=()=>1;
  eq(validateDeviation(badFn).valid, false, 'function values rejected');
});
test('A-21: both §13 reference kinds are accepted in targetRef ($doc: and $stepId)', ()=>{
  const base={category:'placement', property:'center', severity:'warning', message:'center differs from artboard center'};
  eq(validateDeviation(createDeviation({...base, targetRef:'$doc:'+OID})).valid, true, '$doc:<id> kind');
  eq(validateDeviation(createDeviation({...base, targetRef:'$step-1'})).valid, true, '$stepId kind');
  eq(validateDeviation(createDeviation({...base, targetRef:null})).valid, true, 'plan-level null kind (§21)');
});

console.log('=== PHASE 3.14 Checkpoint A: EvaluationResult (spec §12) ===');
function resultFixture(doc, deviations){
  const intent={type:'create', objectType:'rect', width:200, height:100, rx:12, ry:12, fill:'#FF0000', placement:'center'};
  const context=createPlanningContext({artboard:{width:400, height:300, centerX:200, centerY:150}, objects:{}});
  const expected=buildExpectedState(intent, context);
  const actual=buildActualState(docContext(doc), evalContext());
  return {expected, actual, deviations: deviations||[], evaluated:['geometry','appearance','placement']};
}
test('A-22: PASS result — zero deviations => status PASS exactly (gate 5)', ()=>{
  const doc=makeDoc();
  const fx=resultFixture(doc);
  const r=createEvaluationResult(fx);
  eq(r.status, 'PASS');
  eq(r.deviations.length, 0);
  eq(JSON.stringify(r.expected), JSON.stringify(fx.expected), 'expected is carried, not rebuilt');
  eq(r.evaluated.join(','), 'geometry,appearance,placement');
  expect(Object.isFrozen(r), 'result frozen');
  expect(Object.isFrozen(r.metadata), 'metadata frozen');
  expect(Object.isFrozen(r.deviations), 'deviations array frozen');
});
test('A-23: DEVIATION result — one deviation => status DEVIATION exactly (gate 5, other direction)', ()=>{
  const doc=makeDoc();
  const dev=createDeviation({category:'geometry', property:'width', expected:200, actual:190, delta:-10, tolerance:0.01, severity:'error', objectId:OID, targetRef:'$step-1', message:'width differs'});
  const r=createEvaluationResult(resultFixture(doc, [dev]));
  eq(r.status, 'DEVIATION');
  eq(r.deviations.length, 1);
  eq(r.deviations[0].id, dev.id, 'deviation carried by identity of content');
});
test('A-24: metadata is optional, defaults to a frozen empty object, and carries caller content verbatim (deterministic only)', ()=>{
  const doc=makeDoc();
  const r1=createEvaluationResult(resultFixture(doc));
  eq(JSON.stringify(r1.metadata), '{}');
  const r2=createEvaluationResult({...resultFixture(doc), metadata:{tolerances:{width:0.01}, ruleSet:'mvp-a'}});
  eq(JSON.stringify(r2.metadata), JSON.stringify({tolerances:{width:0.01}, ruleSet:'mvp-a'}));
});
test('A-25: createEvaluationResult rejects invalid inputs with the §54 error model', ()=>{
  const doc=makeDoc();
  const ok=resultFixture(doc);
  throwsWithCode(()=>createEvaluationResult({...ok, expected:{status:'requested'}}), 'INVALID_EXPECTED_STATE', 'expected must carry the five sections');
  throwsWithCode(()=>createEvaluationResult({...ok, expected:{...ok.expected, geometry:'nope'}}), 'INVALID_EXPECTED_STATE', 'sections are plain objects');
  throwsWithCode(()=>createEvaluationResult({...ok, actual:{objects:'nope'}}), 'INVALID_ACTUAL_STATE', 'actual must be a valid snapshot');
  throwsWithCode(()=>createEvaluationResult({...ok, deviations:'nope'}), 'INVALID_EVALUATION_RESULT', 'deviations must be an array');
  throwsWithCode(()=>createEvaluationResult({...ok, deviations:[{id:'x'}]}), 'INVALID_EVALUATION_RESULT', 'each element must be a valid deviation');
  throwsWithCode(()=>createEvaluationResult({...ok, evaluated:[]}), 'INVALID_EVALUATION_RESULT', 'evaluated non-empty (§12)');
  throwsWithCode(()=>createEvaluationResult({...ok, evaluated:['geometry', 3]}), 'INVALID_EVALUATION_RESULT', 'evaluated entries are strings');
  throwsWithCode(()=>createEvaluationResult({...ok, metadata:{at:()=>1}}), 'INVALID_EVALUATION_RESULT', 'metadata is plain data (no Date.now-style content)');
});
test('A-26: validateEvaluationResult enforces the status/length equivalence in BOTH directions (gate 5 enforcement)', ()=>{
  const doc=makeDoc();
  const dev=createDeviation({category:'geometry', property:'width', expected:200, actual:190, delta:-10, tolerance:0.01, severity:'error', objectId:OID, targetRef:'$step-1', message:'width differs'});
  const fake1={...resultFixture(doc), status:'PASS', deviations:[dev], metadata:{}};
  const v1=validateEvaluationResult(fake1);
  expect(v1.valid===false, 'PASS with deviations is invalid');
  expect(v1.errors.some((e)=>/status/.test(e.message)), 'error names the status rule');
  const fake2={...resultFixture(doc), status:'DEVIATION', deviations:[], metadata:{}};
  const v2=validateEvaluationResult(fake2);
  expect(v2.valid===false, 'DEVIATION without deviations is invalid');
  const r=createEvaluationResult(resultFixture(doc, [dev]));
  eq(validateEvaluationResult(r).valid, true, 'round-trip: DEVIATION result validates');
  const p=createEvaluationResult(resultFixture(doc));
  eq(validateEvaluationResult(p).valid, true, 'round-trip: PASS result validates');
  eq(validateEvaluationResult({}).valid, false, 'missing required fields');
});

console.log('=== PHASE 3.14 Checkpoint A: determinism (§22, gates 10/13/14) ===');
test('A-27: repeated evaluation-model runs over identical state produce identical JSON — and no wall-clock entropy exists', ()=>{
  const doc=makeDoc({tx:10, ty:10});
  const dev=createDeviation({category:'geometry', property:'width', expected:200, actual:190, delta:-10, tolerance:0.01, severity:'error', objectId:OID, targetRef:'$step-1', message:'width differs'});
  const mk=()=>{
    const r=createEvaluationResult(resultFixture(doc, [dev]));
    return JSON.stringify(r);
  };
  const a=mk(); const b=mk();
  eq(a, b, 'byte-identical results for identical inputs');
});
test('A-28: the model layer contains no entropy sources — Date.now / random-UUID tokens absent from evaluation.js (gates 9/10)', ()=>{
  const src=readFileSync(new URL('../src-js/evaluation.js', import.meta.url), 'utf-8');
  expect(!/Date\.now\(/.test(src), 'no Date.now()');
  expect(!/Math\.random\(/.test(src), 'no Math.random()');
  expect(!/crypto\.(random|getRandom)/.test(src), 'no random crypto');
  expect(!/uuid\(/.test(src), 'no uuid() generator');
});

console.log('=== PHASE 3.14 Checkpoint A: A-era source guard (3.13 precedent ai.test.mjs:225; full G-pattern suite = Checkpoint G, spec §60) ===');
const A14_SRC=readFileSync(new URL('../src-js/evaluation.js', import.meta.url), 'utf-8');
function importSpecifiersOf(src){
  return src.split('\n').filter((l)=>/^\s*import\b/.test(l)).map((l)=>{
    const m=l.match(/from\s+['"]([^'"]+)['"]/);
    return m?m[1]:l.trim();
  });
}
test('A-29: import contract — evaluation.js imports exactly the two public pure-piece modules, all specifiers relative', ()=>{
  const specs=importSpecifiersOf(A14_SRC).sort();
  eq(specs.length, 2, `exactly two import lines, got ${JSON.stringify(specs)}`);
  for(const s of specs){
    expect(s.startsWith('.'), `specifier '${s}' must be relative`);
  }
  const sorted=[...specs].sort();
  eq(JSON.stringify(sorted), JSON.stringify(['./bbox.js','./geometry.js']), 'the exact two-module contract: geometry bbox pieces + bbox transform (§51)');
});
test('A-30: forbidden capability surfaces are absent from evaluation.js source (raw-scan A-era)', ()=>{
  const patterns=[
    [/\bwindow\b/, 'window'], [/\bdocument\b/, 'document'], [/\bfetch\s*\(/, 'fetch('],
    [/\beval\s*\(/, 'eval('], [/\bnew\s+Function\b/, 'new Function'], [/\brequire\s*\(/, 'require('],
    [/\bimport\s*\(/, 'import('], [/\bglobalThis\b/, 'globalThis'], [/\bprocess\b/, 'process'],
    [/\blocalStorage\b/, 'localStorage']
  ];
  for(const [pat, name] of patterns){
    expect(!pat.test(A14_SRC), `evaluation.js must not reference ${name} (A-era raw scan)`);
  }
});
test('A-31: no mutation-surface calls in evaluation.js — stores are read via get/has/list only (§52, gates 25-27 substrate)', ()=>{
  const patterns=[
    [/\.create\s*\(/, '.create('], [/\.update\s*\(/, '.update('], [/\.delete\s*\(/, '.delete('],
    [/\.set[A-Z]\w*\s*\(/, '.setX('], [/\.commit\s*\(/, '.commit('], [/\.execute\s*\(/, '.execute('],
    [/\.register\s*\(/, '.register('], [/\.unregister\s*\(/, '.unregister('], [/\.insert\s*\(/, '.insert('],
    [/\.remove\s*\(/, '.remove('], [/\.render\s*\(/, '.render('], [/\.rollback\s*\(/, '.rollback(']
  ];
  for(const [pat, name] of patterns){
    expect(!pat.test(A14_SRC), `evaluation.js must not call ${name} — read-only by construction`);
  }
});
test('A-32: gate 3 — the measured-status escape hatch is not used: the token never appears in evaluation.js (§07/§62)', ()=>{
  expect(!A14_SRC.includes('measured'), "the token 'measured' must not appear anywhere in evaluation.js");
});
test('A-33: the evaluation module does not import the Planner or any store class — document context is injected (§06/§10/§11)', ()=>{
  expect(!A14_SRC.includes("from './ai.js'"), 'no Planner import — ExpectedState is consumed as plain data');
  expect(!A14_SRC.includes("from './stores.js'"), 'no store class import — document context is injected');
  expect(!A14_SRC.includes("from './tools.js'"), 'no tool registry import — evaluation never touches the registry');
  expect(!A14_SRC.includes("from './transaction.js'"), 'no transaction import — evaluation never touches the transaction layer');
});

console.log('=== PHASE 3.14 Checkpoint B: entry contract (spec §12/§55) ===');
test('B-1: vertical slice PASS — perfect execution yields status PASS, zero deviations, no false deviations (§37)', ()=>{
  const doc=makeDoc({tx:100, ty:100});
  const expected=bExpected();
  const result=evaluate(expected, docContext(doc), bContext());
  eq(result.status, 'PASS');
  eq(result.deviations.length, 0);
  eq(result.evaluated.join(','), 'existence,geometry,appearance,placement,structure');
  eq(JSON.stringify(result.expected), JSON.stringify(expected), 'expected is carried, not rebuilt');
  eq(validateEvaluationResult(result).valid, true, 'round-trip: built result passes its own validator');
  expect(Object.isFrozen(result), 'result frozen');
  const c=BBox.center(result.actual.objects[0].worldBBox);
  eq(c.x, 200); eq(c.y, 150);
});
test('B-2: evaluate refuses malformed expected input — shape, desired-status marker, transform section contract', ()=>{
  const doc=makeDoc({tx:100, ty:100});
  throwsWithCode(()=>evaluate(null, docContext(doc), bContext()), 'INVALID_EXPECTED_STATE', 'expected required');
  throwsWithCode(()=>evaluate({status:'requested'}, docContext(doc), bContext()), 'INVALID_EXPECTED_STATE', 'five sections required');
  throwsWithCode(()=>evaluate({...bExpected(), status:'pending'}, docContext(doc), bContext()), 'INVALID_EXPECTED_STATE', 'desired-state marker enforced');
  throwsWithCode(()=>evaluate({...bExpected(), transform:'nope'}, docContext(doc), bContext()), 'INVALID_EXPECTED_STATE', 'transform must be null or plain object');
  throwsWithCode(()=>evaluate({...bExpected(), transform:{scale:2}}, docContext(doc), bContext()), 'INVALID_EXPECTED_STATE', 'unsupported transform key refused');
  throwsWithCode(()=>evaluate({...bExpected(), transform:{tx:'x'}}, docContext(doc), bContext()), 'INVALID_EXPECTED_STATE', 'transform values null or finite');
});
test('B-3: centered expectation without an artboard is MISSING_PARAMETER — the artboard is never guessed (§17); bbox-only expectations need no artboard', ()=>{
  const doc=makeDoc({tx:100, ty:100});
  throwsWithCode(()=>evaluate(bExpected(), docContext(doc), {targets:[{objectId:OID, targetRef:'$step-1'}]}),
    'MISSING_PARAMETER', 'artboard required for centered expectation');
  throwsWithCode(()=>evaluate(bExpected(), docContext(doc), {targets:[{objectId:OID, targetRef:'$step-1'}], artboard:{width:400, height:300, centerX:200}}),
    'MISSING_PARAMETER', 'centerY missing');
  throwsWithCode(()=>evaluate(bExpected(), docContext(doc), {targets:[{objectId:OID, targetRef:'$step-1'}], artboard:{centerX:NaN, centerY:150}}),
    'MISSING_PARAMETER', 'non-finite centerX');
  throwsWithCode(()=>evaluate(bExpected(), docContext(doc), {targets:[{objectId:OID, targetRef:'$step-1'}], artboard:'nope'}),
    'MISSING_PARAMETER', 'artboard must be a plain object');
  const bboxOnly={ ...bExpected({placement:'origin', x:100, y:100}), spatial:{aligned:null, centered:false, bbox:{minX:0, minY:0, maxX:200, maxY:100}} };
  const r=evaluate(bboxOnly, docContext(makeDoc()), {targets:[{objectId:OID, targetRef:'$step-1'}]});
  eq(r.status, 'PASS', 'bbox-only expectation evaluates without any artboard');
  eq(r.deviations.length, 0);
});
test('B-4: evaluate propagates the injected-context contracts (doc read surface + evaluation context)', ()=>{
  const doc=makeDoc({tx:100, ty:100});
  throwsWithCode(()=>evaluate(bExpected(), {geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, bContext()),
    'INVALID_DOCUMENT_CONTEXT', 'missing objectStore read');
  throwsWithCode(()=>evaluate(bExpected(), docContext(doc), {targets:[], artboard:B_ARTBOARD}), 'INVALID_EVALUATION_CONTEXT', 'targets required');
  throwsWithCode(()=>evaluate(bExpected(), docContext(doc), {targets:'x', artboard:B_ARTBOARD}), 'INVALID_EVALUATION_CONTEXT', 'targets array required');
});

console.log('=== PHASE 3.14 Checkpoint B: E1 existence (spec §21) ===');
test('B-5: missing object produces exactly one existence deviation with the target binding; deeper checks short-circuit (§21)', ()=>{
  const doc=makeDoc();
  const result=evaluate(bExpected(), docContext(doc), bContext([{objectId:EOID, targetRef:'$doc:'+EOID}]));
  eq(result.status, 'DEVIATION');
  eq(result.deviations.length, 1);
  const d=result.deviations[0];
  eq(d.category, 'existence');
  eq(d.property, 'exists');
  eq(d.expected, true);
  eq(d.actual, false);
  eq(d.delta, null);
  eq(d.tolerance, null);
  eq(d.severity, 'error');
  eq(d.objectId, EOID);
  eq(d.targetRef, '$doc:'+EOID);
  expect(/^dev-[0-9a-f]{8}$/.test(d.id), 'content-derived id shape');
  expect(d.message.length>0, 'deterministic human-readable message present');
  eq(result.evaluated.join(','), 'existence', 'nothing beyond existence is checkable for a missing object');
  eq(validateEvaluationResult(result).valid, true);
});
test('B-6: deviation order is target-major — the existing target\u2019s deviations precede the missing target\u2019s existence deviation', ()=>{
  const doc=makeDoc({width:190, tx:105, ty:100}); // 105 + 190/2 = 200: still artboard-centered
  const result=evaluate(bExpected(), docContext(doc),
    bContext([{objectId:OID, targetRef:'$step-1'},{objectId:EOID, targetRef:'$doc:'+EOID}]));
  eq(categoryPropertySeq(result).join(','), 'geometry:width,geometry:area,existence:exists');
  eq(result.deviations.map((d)=>d.objectId).join(','), `${OID},${OID},${EOID}`);
});

console.log('=== PHASE 3.14 Checkpoint B: E2 geometry (spec §15, tolerance §14) ===');
test('B-7: ellipse geometry evaluates through the builder\u2019s own formulas (rx/ry/area=PI*rx*ry/symmetric)', ()=>{
  const expected=buildExpectedState({type:'create', objectType:'ellipse', rx:30, ry:40});
  const doc=makeEllipseDoc();
  const result=evaluate(expected, docContext(doc), {targets:[{objectId:EOID, targetRef:'$step-e'}], artboard:B_ARTBOARD});
  eq(result.status, 'PASS');
  eq(result.deviations.length, 0, 'perfect ellipse execution produces no deviations');
  eq(result.evaluated.join(','), 'existence,geometry,structure');
});
test('B-8: width deviation carries expected/actual/delta(actual-expected)/tolerance; derived area follows (§38 shapes)', ()=>{
  const doc=makeDoc({width:190, tx:105, ty:100}); // re-centered for the observed width
  const result=evaluate(bExpected(), docContext(doc), bContext());
  eq(categoryPropertySeq(result).join(','), 'geometry:width,geometry:area');
  const d=result.deviations[0];
  eq(d.expected, 200); eq(d.actual, 190); eq(d.delta, -10);
  eq(d.tolerance, EVALUATION_TOLERANCES.geometry);
  eq(d.severity, 'error'); eq(d.objectId, OID); eq(d.targetRef, '$step-1');
  const a=result.deviations[1];
  eq(a.expected, 20000); eq(a.actual, 19000); eq(a.delta, -1000);
});
test('B-9: tolerance boundary — within 1e-9 no deviation, beyond it a deviation (§14/§15: abs(actual-expected) <= tolerance)', ()=>{
  // origin placement isolates geometry from placement checks (a drifted width
  // would otherwise also shift the world-bbox center of a centered fixture)
  const near=evaluate(bExpected({placement:'origin'}), docContext(makeDoc({width:200+5e-12})), bContext());
  eq(near.deviations.filter((d)=>d.category==='geometry').length, 0, '5e-12 drift (and its 5e-10 area echo) stay within the contract tolerance');
  const W=200.0000001;
  const far=evaluate(bExpected({placement:'origin'}), docContext(makeDoc({width:W})), bContext());
  eq(categoryPropertySeq(far).join(','), 'geometry:width,geometry:area');
  eq(far.deviations[0].actual, W);
  eq(far.deviations[0].delta, W-200);
});
test('B-10: ry and derived symmetric deviations fire in fixed property order', ()=>{
  const doc=makeDoc({ry:14, tx:100, ty:100});
  const result=evaluate(bExpected(), docContext(doc), bContext());
  eq(categoryPropertySeq(result).join(','), 'geometry:ry,geometry:symmetric');
  eq(result.deviations[0].expected, 12); eq(result.deviations[0].actual, 14); eq(result.deviations[0].delta, 2);
  eq(result.deviations[1].expected, true); eq(result.deviations[1].actual, false);
  eq(result.deviations[1].tolerance, null, 'boolean comparison carries no tolerance');
});
test('B-11: observed counterpart missing (params without rx/ry) reports actual:null with tolerance:null — never invented', ()=>{
  const doc=makeDoc({tx:100, ty:100});
  doc.geometryStore.update(GID, {isParametric:true, type:'rect', params:{x:0, y:0, width:200, height:100}});
  const result=evaluate(bExpected(), docContext(doc), bContext());
  eq(categoryPropertySeq(result).join(','), 'geometry:rx,geometry:ry,geometry:symmetric');
  for(const d of result.deviations){
    eq(d.actual, null); eq(d.tolerance, null); eq(d.delta, null);
  }
});

console.log('=== PHASE 3.14 Checkpoint B: E3 appearance (spec §16/§50) ===');
test('B-12: hex normalization — #FF0000, #f00 and #ff0000 all match the canonical substrate RGBA (no representation mismatch)', ()=>{
  for(const fill of ['#FF0000', '#f00', '#ff0000']){
    const result=evaluate(bExpected({fill}), docContext(makeDoc()), bContext());
    eq(result.deviations.filter((d)=>d.category==='appearance').length, 0, `fill ${fill} must match r255 g0 b0 a1`);
  }
});
test('B-13: fill color deviation compares in canonical RGBA space on BOTH sides (§39)', ()=>{
  const result=evaluate(bExpected(), docContext(makeDoc({fillColor:{r:0, g:0, b:255, a:1}, tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(result).join(','), 'appearance:fill.color');
  const d=result.deviations[0];
  eq(JSON.stringify(d.expected), JSON.stringify({r:255, g:0, b:0, a:1}));
  eq(JSON.stringify(d.actual), JSON.stringify({r:0, g:0, b:255, a:1}));
  eq(d.delta, null);
  eq(d.tolerance, EVALUATION_TOLERANCES.appearance);
});
test('B-14: expected fill with no observed fill item is a deviation (expected hex, actual null)', ()=>{
  const result=evaluate(bExpected(), docContext(makeDoc({withFill:false, tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(result).join(','), 'appearance:fill');
  eq(result.deviations[0].expected, '#FF0000');
  eq(result.deviations[0].actual, null);
  eq(result.deviations[0].tolerance, null);
});
test('B-15: non-solid observed fill kind is a deviation (hex expectation corresponds to solid, §16)', ()=>{
  const result=evaluate(bExpected(), docContext(makeDoc({fillKind:'gradient', tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(result).join(','), 'appearance:fill.kind');
  eq(result.deviations[0].expected, 'solid');
  eq(result.deviations[0].actual, 'gradient');
  eq(result.deviations[0].tolerance, null);
});
test('B-16: an inert (disabled) fill does not satisfy the fill expectation — one fill.enabled deviation, no color noise', ()=>{
  const result=evaluate(bExpected(), docContext(makeDoc({fillEnabled:false, tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(result).join(','), 'appearance:fill.enabled');
  eq(result.deviations[0].expected, true);
  eq(result.deviations[0].actual, false);
  eq(result.deviations[0].tolerance, null);
});
test('B-17: opacity compares against the observed fill item opacity with the appearance tolerance', ()=>{
  const ok=evaluate(bExpected({opacity:0.5}), docContext(makeDoc({fillOpacity:0.5})), bContext());
  eq(ok.deviations.filter((d)=>d.category==='appearance').length, 0, 'matching opacity passes');
  const off=evaluate(bExpected({opacity:0.5}), docContext(makeDoc({tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(off).join(','), 'appearance:opacity');
  eq(off.deviations[0].expected, 0.5);
  eq(off.deviations[0].actual, 1);
  eq(off.deviations[0].delta, 0.5);
  eq(off.deviations[0].tolerance, EVALUATION_TOLERANCES.appearance);
});
test('B-18: stroke expectation is self-reported as unevaluated, never silently dropped and never invented into a deviation (§16 MVP)', ()=>{
  const expected={ ...bExpected(), appearance:{fill:null, stroke:'#00FF00', opacity:null} };
  const result=evaluate(expected, docContext(makeDoc({tx:100, ty:100})), bContext());
  eq(result.status, 'PASS');
  eq(result.deviations.length, 0);
  eq(result.evaluated.join(','), 'existence,geometry,placement,structure', 'appearance not claimed as checked');
  eq(JSON.stringify(result.metadata.unevaluatedExpectations), JSON.stringify(['appearance.stroke']));
});

console.log('=== PHASE 3.14 Checkpoint B: E4 placement (spec §17) ===');
test('B-19: centered placement — matching center passes; drifted center yields one center deviation vs the artboard center', ()=>{
  const ok=evaluate(bExpected(), docContext(makeDoc({tx:100, ty:100})), bContext());
  eq(ok.deviations.filter((d)=>d.category==='placement').length, 0, 'world bbox center (200,150) === artboard center');
  const off=evaluate(bExpected(), docContext(makeDoc({tx:120, ty:100})), bContext());
  eq(categoryPropertySeq(off).join(','), 'placement:center');
  const d=off.deviations[0];
  eq(JSON.stringify(d.expected), JSON.stringify({x:200, y:150}));
  eq(JSON.stringify(d.actual), JSON.stringify({x:220, y:150}));
  eq(d.delta, null);
  eq(d.tolerance, EVALUATION_TOLERANCES.placement);
});
test('B-20: centered expectation with an unmeasurable geometry (worldBBox null) reports actual:null — honest, not invented', ()=>{
  const doc=makeDoc();
  doc.geometryStore.update(GID, {isParametric:true, type:'star', params:{center:{x:0, y:0}, outerRadius:10, innerRadius:5, points:5, rotationDegrees:0}});
  const result=evaluate(bExpected(), docContext(doc), bContext());
  const d=result.deviations.find((x)=>x.category==='placement' && x.property==='center');
  expect(d, 'center deviation present');
  eq(JSON.stringify(d.expected), JSON.stringify({x:200, y:150}));
  eq(d.actual, null);
  eq(d.tolerance, null);
});
test('B-21: bbox expectation — four-edge comparison with per-edge deltas; artboard not required for bbox-only placement', ()=>{
  const doc=makeDoc({tx:100, ty:100});
  const base={ ...bExpected({placement:'origin', x:100, y:100}), spatial:{aligned:null, centered:false, bbox:{minX:100, minY:100, maxX:300, maxY:200}} };
  const ok=evaluate(base, docContext(doc), {targets:[{objectId:OID, targetRef:'$step-1'}]});
  eq(ok.status, 'PASS');
  eq(ok.deviations.length, 0);
  const off={ ...base, spatial:{...base.spatial, bbox:{...base.spatial.bbox, minX:101}} };
  const result=evaluate(off, docContext(doc), {targets:[{objectId:OID, targetRef:'$step-1'}]});
  eq(categoryPropertySeq(result).join(','), 'placement:bbox.minX');
  eq(result.deviations[0].expected, 101);
  eq(result.deviations[0].actual, 100);
  eq(result.deviations[0].delta, -1);
  eq(result.deviations[0].tolerance, EVALUATION_TOLERANCES.placement);
});

console.log('=== PHASE 3.14 Checkpoint B: E5 structure (spec §18) ===');
test('B-22: grouped expectation compares both directions against the observed parent-is-group fact', ()=>{
  const grouped=makeGroupedDoc({tx:100, ty:100});
  const r1=evaluate({...bExpected(), structure:{grouped:true}}, docContext(grouped), bContext());
  eq(r1.status, 'PASS');
  eq(r1.deviations.length, 0, 'grouped object satisfies grouped:true');
  eq(r1.evaluated.includes('structure'), true);
  const root=evaluate({...bExpected(), structure:{grouped:true}}, docContext(makeDoc({tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(root).join(','), 'structure:grouped');
  eq(root.deviations[0].expected, true);
  eq(root.deviations[0].actual, null, 'root object observes parentIsGroup null — reported verbatim');
  const ungroup=evaluate(bExpected(), docContext(makeGroupedDoc({tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(ungroup).join(','), 'structure:grouped');
  eq(ungroup.deviations[0].expected, false);
  eq(ungroup.deviations[0].actual, true);
});

console.log('=== PHASE 3.14 Checkpoint B: E6 semantic (spec §20) ===');
test('B-23: a semantic expectation section is self-reported unevaluated — no semantic deviation is ever invented (§20)', ()=>{
  const expected={ ...bExpected(), semantic:{role:'background'} };
  const result=evaluate(expected, docContext(makeDoc({tx:100, ty:100})), bContext());
  eq(result.status, 'PASS');
  eq(result.deviations.length, 0);
  eq(result.evaluated.includes('semantic'), false, 'semantic is never claimed as checked in MVP');
  eq(JSON.stringify(result.metadata.unevaluatedExpectations), JSON.stringify(['semantic']));
});

console.log('=== PHASE 3.14 Checkpoint B: E7 transform (spec §19) ===');
test('B-24: null/absent transform expectations generate NO transform deviations (§19); malformed transform contracts are refused', ()=>{
  const doc=makeDoc({tx:100, ty:100});
  const absent=evaluate(bExpected(), docContext(doc), bContext());
  eq(absent.deviations.filter((d)=>d.category==='transform').length, 0, 'absent transform section stays dormant');
  eq(absent.evaluated.includes('transform'), false);
  const allNull=evaluate({...bExpected(), transform:{a:null, b:null, c:null, d:null, tx:null, ty:null}}, docContext(doc), bContext());
  eq(allNull.deviations.filter((d)=>d.category==='transform').length, 0, 'all-null transform expectations stay dormant (§19)');
  eq(allNull.evaluated.includes('transform'), false);
  eq(allNull.status, 'PASS');
  throwsWithCode(()=>evaluate({...bExpected(), transform:{unknown:1}}, docContext(doc), bContext()), 'INVALID_EXPECTED_STATE', 'unknown key refused');
});
test('B-25: non-null transform expectations compare per-key against the observed world transform', ()=>{
  const doc=makeDoc({tx:100, ty:100});
  const ok=evaluate({...bExpected(), transform:{a:1, b:0, c:0, d:1, tx:100, ty:100}}, docContext(doc), bContext());
  eq(ok.status, 'PASS');
  eq(ok.deviations.length, 0, 'matching transform passes');
  eq(ok.evaluated.includes('transform'), true);
  const originOnly={ ...bExpected({placement:'origin'}), transform:{tx:50} };
  const off=evaluate(originOnly, docContext(makeDoc()), {targets:[{objectId:OID, targetRef:'$step-1'}]});
  eq(categoryPropertySeq(off).join(','), 'transform:transform.tx');
  eq(off.deviations[0].expected, 50);
  eq(off.deviations[0].actual, 0);
  eq(off.deviations[0].delta, -50);
  eq(off.deviations[0].tolerance, EVALUATION_TOLERANCES.transform);
  const noMatrixDoc=makeDoc({placement:'origin'});
  noMatrixDoc.geometryStore.update(GID, {isParametric:true, type:'star', params:{center:{x:0, y:0}, outerRadius:10, innerRadius:5, points:5, rotationDegrees:0}});
  const noMatrix={ ...bExpected({placement:'origin'}), geometry:{width:null, height:null, rx:null, ry:null, area:null, symmetric:null}, transform:{a:null, tx:50} };
  const r=evaluate(noMatrix, docContext(noMatrixDoc), {targets:[{objectId:OID, targetRef:'$step-1'}]});
  eq(categoryPropertySeq(r).join(','), 'transform:transform');
  eq(JSON.stringify(r.deviations[0].expected), JSON.stringify({tx:50}));
  eq(r.deviations[0].actual, null);
  eq(r.deviations[0].tolerance, null);
});

console.log('=== PHASE 3.14 Checkpoint B: determinism, ordering, purity, contract (spec §22, §42) ===');
test('B-26: repeated evaluation over identical state is byte-identical (§22/§67)', ()=>{
  const doc=makeDoc({width:190, fillColor:{r:0, g:0, b:255, a:1}, tx:120, ty:100});
  const a=JSON.stringify(evaluate(bExpected(), docContext(doc), bContext()));
  const b=JSON.stringify(evaluate(bExpected(), docContext(doc), bContext()));
  eq(a, b, 'identical inputs => identical EvaluationResult JSON, deviation ids and messages included');
});
test('B-27: declared deviation order — target-major, category rank (existence..transform), fixed property order (gate 11)', ()=>{
  const doc=makeDoc({width:190, fillColor:{r:0, g:0, b:255, a:1}, tx:120, ty:100});
  const result=evaluate(bExpected(), docContext(doc), bContext());
  eq(categoryPropertySeq(result).join(','), 'geometry:width,geometry:area,appearance:fill.color,placement:center');
  eq(result.evaluated.join(','), 'existence,geometry,appearance,placement,structure');
  eq(validateEvaluationResult(result).valid, true);
});
test('B-28: evaluate does not mutate canonical stores or hierarchy (§42 Layer 1; gate 25)', ()=>{
  const doc=makeDoc({width:190, tx:33, ty:-7});
  const before=captureStores(doc);
  evaluate(bExpected(), docContext(doc), bContext());
  eq(captureStores(doc), before, 'stores + hierarchy JSON untouched by evaluation');
});
test('B-29: tolerance contract — EVALUATION_TOLERANCES exported, frozen, uniform 1e-9 (geometry kernel discipline, §14)', ()=>{
  expect(Object.isFrozen(EVALUATION_TOLERANCES), 'tolerances frozen');
  eq(JSON.stringify(Object.keys(EVALUATION_TOLERANCES)), JSON.stringify(['geometry','appearance','placement','transform']));
  for(const k of Object.keys(EVALUATION_TOLERANCES)) eq(EVALUATION_TOLERANCES[k], 1e-9, `${k} tolerance is 1e-9`);
});
test('B-30: source scan — fill normalization is local (no dsl import, no substrate-parser identifier), import contract unchanged (§50)', ()=>{
  const src=readFileSync(new URL('../src-js/evaluation.js', import.meta.url), 'utf-8');
  expect(!src.includes("from './dsl.js'"), 'no dsl module import — normalization lives here (§50)');
  expect(!src.includes('parseColor'), 'no coupling to the substrate-internal parser identifier');
  expect(src.includes('function hexToRgba'), 'the local normalizer is implemented in evaluation.js');
  eq(JSON.stringify(importSpecifiersOf(src).sort()), JSON.stringify(['./bbox.js','./geometry.js']), 'Checkpoint A import contract intact');
});

console.log('=== PHASE 3.14 Checkpoint C: entry contract (spec §23/§25/§56) ===');
function throwsCriticWithCode(fn, code, msg){
  let threw=null;
  try{ fn(); }catch(e){ threw=e; }
  expect(threw, `${msg||'expected throw'}: nothing was thrown`);
  expect(threw instanceof CriticError, `${msg||'expected CriticError'}: got ${threw && threw.constructor && threw.constructor.name}: ${threw}`);
  eq(threw.code, code, `${msg||'error code'} — message: ${threw.message}`);
}
test('C-1: proposeCorrections on a PASS EvaluationResult yields an empty frozen proposal array (§23)', ()=>{
  const doc=makeDoc({tx:100, ty:100});
  const result=evaluate(bExpected(), docContext(doc), bContext());
  eq(result.status, 'PASS');
  const proposals=proposeCorrections(result);
  eq(proposals.length, 0);
  expect(Object.isFrozen(proposals), 'proposals array frozen');
});
test('C-2: proposeCorrections refuses non-EvaluationResult input (consumes the §12 contract, not a shape guess)', ()=>{
  const doc=makeDoc({width:190, tx:105, ty:100});
  const good=evaluate(bExpected(), docContext(doc), bContext());
  throwsCriticWithCode(()=>proposeCorrections(null), 'INVALID_EVALUATION_RESULT', 'null input');
  throwsCriticWithCode(()=>proposeCorrections({}), 'INVALID_EVALUATION_RESULT', 'empty object');
  throwsCriticWithCode(()=>proposeCorrections({...good, status:'PASS'}), 'INVALID_EVALUATION_RESULT', 'status/length equivalence enforced by the §12 validator');
  throwsCriticWithCode(()=>proposeCorrections({...good, deviations:'x'}), 'INVALID_EVALUATION_RESULT', 'deviations must be an array');
});
test('C-3: source scan — critic.js imports exactly the evaluation contract, is read-only, and carries no entropy (§24/§29, gates 21/25-27 substrate)', ()=>{
  const src=readFileSync(new URL('../src-js/critic.js', import.meta.url), 'utf-8');
  eq(JSON.stringify(importSpecifiersOf(src).sort()), JSON.stringify(['./evaluation.js']), 'exactly one import: the evaluation contract validator');
  for(const banned of ["from './ai.js'", "from './stores.js'", "from './tools.js'", "from './transaction.js'", "from './dsl.js'", "from './scenegraph.js'"]){
    expect(!src.includes(banned), `critic.js must not import ${banned}`);
  }
  for(const [pat, name] of [[/Date\.now\(/, 'Date.now()'], [/Math\.random\(/, 'Math.random()'], [/crypto\.(random|getRandom)/, 'random crypto'], [/uuid\(/, 'uuid()'], [/\bprocess\b/, 'process'], [/\bdocument\b/, 'document'], [/\bwindow\b/, 'window'], [/\beval\s*\(/, 'eval(']]){
    expect(!pat.test(src), `critic.js must not reference ${name}`);
  }
  for(const [pat, name] of [/\.create\s*\(/, /\.update\s*\(/, /\.delete\s*\(/, /\.set[A-Z]\w*\s*\(/, /\.commit\s*\(/, /\.execute\s*\(/, /\.register\s*\(/, /\.unregister\s*\(/, /\.insert\s*\(/, /\.remove\s*\(/, /\.render\s*\(/, /\.rollback\s*\(/].map((p)=>[p, p.source])){
    expect(!pat.test(src), `critic.js must not call ${name} — proposal-only, never execution (§24/§26)`);
  }
  expect(!src.includes('measured'), "the dormant-status token must not appear anywhere in critic.js");
  expect(src.includes('function proposeCorrections'), 'the rule engine entry exists');
});

console.log('=== PHASE 3.14 Checkpoint C: rule engine — supported corrections (spec §27) ===');
test('C-4: geometry deviation -> ONE create-rebuild proposal from the desired-state projection; derived area deviation dedupes into it (§27)', ()=>{
  const doc=makeDoc({width:190, tx:105, ty:100});
  const result=evaluate(bExpected(), docContext(doc), bContext());
  eq(categoryPropertySeq(result).join(','), 'geometry:width,geometry:area');
  const proposals=proposeCorrections(result);
  eq(proposals.length, 1, 'width triggers the rebuild; the derived area deviation collapses into the same correction');
  const p=proposals[0];
  eq(p.deviationId, result.deviations[0].id, 'proposal names the deviation that caused it');
  eq(p.targetRef, '$step-1');
  eq(JSON.stringify(p.intent), JSON.stringify({type:'create', objectType:'rect', width:200, height:100, rx:12, ry:12, fill:'#FF0000', placement:'center'}));
  eq(p.confidence, 1);
  eq(p.priority, 0, 'priority = deviation index');
  expect(/^prop-[0-9a-f]{8}$/.test(p.id), 'content-derived id shape');
  expect(Object.isFrozen(p), 'proposal frozen');
  expect(typeof p.reason==='string' && p.reason.length>0, 'deterministic reason present');
});
test('C-5: ellipse geometry deviation rebuilds the ellipse create projection (rx/ry, no width/height)', ()=>{
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore();
  geometryStore.create(EGID, {isParametric:true, type:'ellipse', params:{cx:0, cy:0, rx:31, ry:40}});
  appearanceStore.create(EAID, {id:EAID, stack:[]});
  objectStore.create({id:EOID, geometryRef:EGID, appearanceRef:EAID});
  const sceneGraph=new SceneGraph({hasObject:(id)=>objectStore.has(id)});
  sceneGraph.createNode(EOID, null, {a:1, b:0, c:0, d:1, tx:0, ty:0});
  const expected=buildExpectedState({type:'create', objectType:'ellipse', rx:30, ry:40});
  const result=evaluate(expected, {objectStore, geometryStore, appearanceStore, sceneGraph}, {targets:[{objectId:EOID, targetRef:'$step-e'}]});
  const proposals=proposeCorrections(result);
  eq(proposals.length, 1);
  eq(JSON.stringify(proposals[0].intent), JSON.stringify({type:'create', objectType:'ellipse', rx:30, ry:40}));
});
test('C-6: fill.color deviation -> appearance proposal restoring the requested hex via T07 capability (§16/§27)', ()=>{
  const result=evaluate(bExpected(), docContext(makeDoc({fillColor:{r:0, g:0, b:255, a:1}, tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(result).join(','), 'appearance:fill.color');
  const proposals=proposeCorrections(result);
  eq(proposals.length, 1);
  eq(JSON.stringify(proposals[0].intent), JSON.stringify({type:'appearance', targets:[OID], fill:'#FF0000'}));
  eq(proposals[0].deviationId, result.deviations[0].id);
  eq(proposals[0].priority, 0);
});
test('C-7: fill.kind deviation -> the same appearance-fill correction (restoration value comes from the ExpectedState, not the deviation)', ()=>{
  const result=evaluate(bExpected(), docContext(makeDoc({fillKind:'gradient', tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(result).join(','), 'appearance:fill.kind');
  const proposals=proposeCorrections(result);
  eq(proposals.length, 1);
  eq(JSON.stringify(proposals[0].intent), JSON.stringify({type:'appearance', targets:[OID], fill:'#FF0000'}));
});
test('C-8: missing fill deviation -> appearance-fill proposal (the T07 capability covers the absent-fill case)', ()=>{
  const result=evaluate(bExpected(), docContext(makeDoc({withFill:false, tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(result).join(','), 'appearance:fill');
  const proposals=proposeCorrections(result);
  eq(proposals.length, 1);
  eq(JSON.stringify(proposals[0].intent), JSON.stringify({type:'appearance', targets:[OID], fill:'#FF0000'}));
});
test('C-9: opacity deviation -> appearance proposal carrying the requested opacity (T07 opacity-only, tools.js:375-378)', ()=>{
  const result=evaluate(bExpected({opacity:0.5}), docContext(makeDoc({tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(result).join(','), 'appearance:opacity');
  const proposals=proposeCorrections(result);
  eq(proposals.length, 1);
  eq(JSON.stringify(proposals[0].intent), JSON.stringify({type:'appearance', targets:[OID], opacity:0.5}));
});
test('C-10: placement center deviation -> translate proposal with delta = expected center - observed center (T05 delta semantics, ai.js:777-779)', ()=>{
  const result=evaluate(bExpected(), docContext(makeDoc({tx:120, ty:100})), bContext());
  eq(categoryPropertySeq(result).join(','), 'placement:center');
  const proposals=proposeCorrections(result);
  eq(proposals.length, 1);
  eq(JSON.stringify(proposals[0].intent), JSON.stringify({type:'transform', targets:[OID], operation:'translate', params:{x:-20, y:0}}));
});
test('C-11: transform tx deviation -> translate proposal ONLY when the ExpectedState carries the non-null expectation (user directive)', ()=>{
  const doc=makeDoc();
  const result=evaluate({...bExpected({placement:'origin'}), transform:{tx:50}}, docContext(doc), {targets:[{objectId:OID, targetRef:'$step-1'}]});
  eq(categoryPropertySeq(result).join(','), 'transform:transform.tx');
  const proposals=proposeCorrections(result);
  eq(proposals.length, 1);
  eq(JSON.stringify(proposals[0].intent), JSON.stringify({type:'transform', targets:[OID], operation:'translate', params:{x:50, y:0}}));
});

console.log('=== PHASE 3.14 Checkpoint C: rule engine — unsupported corrections produce NO proposal (spec §28, never bypass) ===');
test('C-12: existence deviations propose nothing — the ExpectedState carries no creation binding (§28)', ()=>{
  const doc=makeDoc();
  const result=evaluate(bExpected(), docContext(doc), bContext([{objectId:EOID, targetRef:'$doc:'+EOID}]));
  eq(result.deviations.length, 1);
  eq(proposeCorrections(result).length, 0);
});
test('C-13: structure deviations propose nothing in MVP — grouped:true needs >=2 targets (T10, ai.js:840-845); grouped:false targets a group NODE id the object-targeted intent grammar cannot carry (T11, ai.js:834/tools.js:517-525)', ()=>{
  const groupedOff=evaluate(bExpected(), docContext(makeGroupedDoc({tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(groupedOff).join(','), 'structure:grouped');
  eq(proposeCorrections(groupedOff).length, 0, 'expected grouped:false, observed grouped — no schedulable correction');
  const groupedOn=evaluate({...bExpected(), structure:{grouped:true}}, docContext(makeDoc({tx:100, ty:100})), bContext());
  eq(categoryPropertySeq(groupedOn).join(','), 'structure:grouped');
  eq(proposeCorrections(groupedOn).length, 0, 'expected grouped:true — a single-object group can never succeed');
});
test('C-14: semantic deviations propose nothing in MVP (no tool supports semantic mutation, §27)', ()=>{
  const doc=makeDoc({tx:100, ty:100});
  const result=evaluate({...bExpected(), semantic:{role:'background'}}, docContext(doc), bContext());
  eq(result.deviations.length, 0);
  const handBuilt=createEvaluationResult({
    expected: bExpected(),
    actual: buildActualState(docContext(makeDoc({tx:100, ty:100})), bContext()),
    deviations: [createDeviation({category:'semantic', property:'role', expected:'background', actual:null, delta:null, tolerance:null, severity:'error', objectId:OID, targetRef:'$step-1', message:'semantic role differs'})],
    evaluated: ['existence', 'semantic']
  });
  eq(proposeCorrections(handBuilt).length, 0);
});
test('C-15: transform deviations for matrix keys (a/b/c/d) propose nothing — no safe capability maps node-matrix components (§28)', ()=>{
  const doc=makeDoc();
  const result=evaluate({...bExpected({placement:'origin'}), transform:{a:2}}, docContext(doc), {targets:[{objectId:OID, targetRef:'$step-1'}]});
  eq(categoryPropertySeq(result).join(','), 'transform:transform.a');
  eq(proposeCorrections(result).length, 0);
});
test('C-16: the transform rule is dormant when the ExpectedState carries no transform expectations — no proposal despite a transform-shaped deviation', ()=>{
  const result=createEvaluationResult({
    expected: bExpected(),
    actual: buildActualState(docContext(makeDoc()), bContext()),
    deviations: [createDeviation({category:'transform', property:'transform.tx', expected:50, actual:0, delta:-50, tolerance:EVALUATION_TOLERANCES.transform, severity:'error', objectId:OID, targetRef:'$step-1', message:'transform.tx expected 50, observed 0'})],
    evaluated: ['existence', 'transform']
  });
  eq(proposeCorrections(result).length, 0, 'no non-null transform expectation in the ExpectedState -> dormant');
});
test('C-17: placement bbox-edge deviations propose nothing — the moving corner is ambiguous (§28); transform deviations with unobservable actual propose nothing', ()=>{
  const doc=makeDoc({tx:100, ty:100});
  const base={ ...bExpected({placement:'origin', x:100, y:100}), spatial:{aligned:null, centered:false, bbox:{minX:101, minY:100, maxX:300, maxY:200}} };
  const result=evaluate(base, docContext(doc), {targets:[{objectId:OID, targetRef:'$step-1'}]});
  eq(categoryPropertySeq(result).join(','), 'placement:bbox.minX');
  eq(proposeCorrections(result).length, 0);
  const noMatrix=createEvaluationResult({
    expected: {...bExpected({placement:'origin'}), transform:{tx:50}},
    actual: buildActualState(docContext(makeDoc({tx:100, ty:100})), bContext()),
    deviations: [createDeviation({category:'transform', property:'transform', expected:{tx:50}, actual:null, delta:null, tolerance:null, severity:'error', objectId:OID, targetRef:'$step-1', message:'transform expectations exist but no world transform is observable'})],
    evaluated: ['existence', 'transform']
  });
  eq(proposeCorrections(noMatrix).length, 0, 'delta unknowable without an observed matrix');
});

console.log('=== PHASE 3.14 Checkpoint C: dedup + ordering + determinism (spec §29/§30) ===');
test('C-18: deduplication — identical corrections for the same target collapse to the first deviation (§28-safe)', ()=>{
  const base={expected: bExpected(), actual: buildActualState(docContext(makeDoc({tx:100, ty:100})), bContext())};
  const kindDev=createDeviation({category:'appearance', property:'fill.kind', expected:'solid', actual:'gradient', delta:null, tolerance:null, severity:'error', objectId:OID, targetRef:'$step-1', message:'fill kind differs'});
  const colorDev=createDeviation({category:'appearance', property:'fill.color', expected:{r:255, g:0, b:0, a:1}, actual:{r:0, g:0, b:255, a:1}, delta:null, tolerance:EVALUATION_TOLERANCES.appearance, severity:'error', objectId:OID, targetRef:'$step-1', message:'fill color differs'});
  const proposals=proposeCorrections(createEvaluationResult({...base, deviations:[kindDev, colorDev], evaluated:['existence','appearance']}));
  eq(proposals.length, 1, 'both deviations map to the same T07 fill restoration');
  eq(proposals[0].deviationId, kindDev.id, 'the first deviation owns the proposal');
  const widthA=createDeviation({category:'geometry', property:'width', expected:200, actual:190, delta:-10, tolerance:EVALUATION_TOLERANCES.geometry, severity:'error', objectId:OID, targetRef:'$step-1', message:'width differs'});
  const widthB=createDeviation({category:'geometry', property:'width', expected:200, actual:190, delta:-10, tolerance:EVALUATION_TOLERANCES.geometry, severity:'error', objectId:OID, targetRef:'$step-1', message:'width differs'});
  const proposals2=proposeCorrections(createEvaluationResult({...base, deviations:[widthA, widthB], evaluated:['existence','geometry']}));
  eq(proposals2.length, 1, 'duplicate deviations collapse');
  eq(proposals2[0].deviationId, widthA.id);
});
test('C-19: proposal ordering follows the deviation order; priority = deviation index (§30: deviation order is the primary basis)', ()=>{
  const doc=makeDoc({width:190, fillColor:{r:0, g:0, b:255, a:1}, tx:120, ty:100});
  const result=evaluate(bExpected(), docContext(doc), bContext());
  eq(categoryPropertySeq(result).join(','), 'geometry:width,geometry:area,appearance:fill.color,placement:center');
  const proposals=proposeCorrections(result);
  eq(proposals.length, 3, 'geometry rebuild + fill restore + center translate');
  eq(proposals[0].deviationId, result.deviations[0].id);
  eq(proposals[0].priority, 0);
  eq(JSON.stringify(proposals[1].intent), JSON.stringify({type:'appearance', targets:[OID], fill:'#FF0000'}));
  eq(proposals[1].deviationId, result.deviations[2].id);
  eq(proposals[1].priority, 2);
  eq(proposals[2].deviationId, result.deviations[3].id);
  eq(proposals[2].priority, 3);
  eq(JSON.stringify(proposals[2].intent), JSON.stringify({type:'transform', targets:[OID], operation:'translate', params:{x:-15, y:0}}), 'delta = expected center - observed center (120 + 190/2 = 215, so 200-215 = -15)');
});
test('C-20: repeated critique over identical state is byte-identical (§29/§67)', ()=>{
  const doc=makeDoc({width:190, fillColor:{r:0, g:0, b:255, a:1}, tx:120, ty:100});
  const result=evaluate(bExpected(), docContext(doc), bContext());
  const a=JSON.stringify(proposeCorrections(result));
  const b=JSON.stringify(proposeCorrections(result));
  eq(a, b, 'identical inputs => identical ordered proposals, ids and reasons included');
});
test('C-21: the Critic does not mutate canonical stores (§24; gate 21)', ()=>{
  const doc=makeDoc({width:190, tx:105, ty:100});
  const result=evaluate(bExpected(), docContext(doc), bContext());
  const before=captureStores(doc);
  proposeCorrections(result);
  eq(captureStores(doc), before, 'stores + hierarchy JSON untouched by critique');
});

console.log('=== PHASE 3.14 Checkpoint C: CorrectionProposal validation (spec §25/§28) ===');
test('C-22: createCorrectionProposal builds a frozen 7-field record with a content-derived id; the intent vocabulary mirrors the planning capabilities', ()=>{
  const p=createCorrectionProposal({deviationId:'dev-12345678', targetRef:'$step-1', intent:{type:'appearance', targets:[OID], fill:'#FF0000'}, reason:'restore the requested fill', confidence:1, priority:0});
  eq(Object.keys(p).sort().join(','), 'confidence,deviationId,id,intent,priority,reason,targetRef', 'exactly the §25 fields');
  expect(/^prop-[0-9a-f]{8}$/.test(p.id), 'content-derived id shape');
  expect(Object.isFrozen(p), 'proposal frozen');
  expect(Object.isFrozen(p.intent), 'intent frozen');
  for(const type of ['create', 'transform', 'appearance', 'alignment', 'structure']){
    const q=createCorrectionProposal({deviationId:'dev-12345678', targetRef:null, intent:{type}, reason:'r', confidence:1, priority:0});
    eq(validateCorrectionProposal(q).valid, true, `planning capability '${type}' accepted`);
  }
  throwsCriticWithCode(()=>createCorrectionProposal({deviationId:'dev-12345678', targetRef:null, intent:{type:'semantic'}, reason:'r', confidence:1, priority:0}), 'INVALID_CORRECTION_PROPOSAL', 'non-planning intent type refused');
});
test('C-23: createCorrectionProposal enforces the §25/§28 content contract (deterministic refusals)', ()=>{
  const base={deviationId:'dev-12345678', targetRef:'$doc:'+OID, intent:{type:'appearance', targets:[OID], fill:'#FF0000'}, reason:'restore fill', confidence:1, priority:0};
  throwsCriticWithCode(()=>createCorrectionProposal({...base, deviationId:''}), 'INVALID_CORRECTION_PROPOSAL', 'deviationId non-empty');
  throwsCriticWithCode(()=>createCorrectionProposal({...base, deviationId:undefined}), 'INVALID_CORRECTION_PROPOSAL', 'deviationId required');
  throwsCriticWithCode(()=>createCorrectionProposal({...base, targetRef:'step-1'}), 'INVALID_CORRECTION_PROPOSAL', "targetRef null or '$'-prefixed");
  throwsCriticWithCode(()=>createCorrectionProposal({...base, intent:'resize it'}), 'INVALID_CORRECTION_PROPOSAL', 'intent plain object');
  throwsCriticWithCode(()=>createCorrectionProposal({...base, intent:{type:'appearance', targets:[OID], fill:'#FF0000', execute:()=>1}}), 'INVALID_CORRECTION_PROPOSAL', 'intent is inert data — no executable content (§26)');
  throwsCriticWithCode(()=>createCorrectionProposal({...base, reason:''}), 'INVALID_CORRECTION_PROPOSAL', 'reason non-empty');
  throwsCriticWithCode(()=>createCorrectionProposal({...base, confidence:1.5}), 'INVALID_CORRECTION_PROPOSAL', 'confidence in [0,1]');
  throwsCriticWithCode(()=>createCorrectionProposal({...base, confidence:NaN}), 'INVALID_CORRECTION_PROPOSAL', 'confidence finite');
  throwsCriticWithCode(()=>createCorrectionProposal({...base, priority:-1}), 'INVALID_CORRECTION_PROPOSAL', 'priority >= 0');
  throwsCriticWithCode(()=>createCorrectionProposal({...base, priority:Infinity}), 'INVALID_CORRECTION_PROPOSAL', 'priority finite');
  throwsCriticWithCode(()=>createCorrectionProposal({...base, intent:{type:'appearance', targets:[OID], fill:'#FF0000', extra:'x'}}), 'INVALID_CORRECTION_PROPOSAL', 'unknown intent keys refused — corrections stay within the planning vocabulary');
});
test('C-24: validateCorrectionProposal — every missing §25 key invalidates; round-trips validate', ()=>{
  const p=createCorrectionProposal({deviationId:'dev-12345678', targetRef:null, intent:{type:'transform', targets:[OID], operation:'translate', params:{x:1, y:2}}, reason:'restore center', confidence:1, priority:3});
  eq(validateCorrectionProposal(p).valid, true, 'round-trip');
  for(const key of ['id', 'deviationId', 'targetRef', 'intent', 'reason', 'confidence', 'priority']){
    const clone=JSON.parse(JSON.stringify(p));
    delete clone[key];
    const v=validateCorrectionProposal(clone);
    expect(v.valid===false, `deleting key ${key} must invalidate the proposal`);
    expect(v.errors.every((e)=>e.code==='INVALID_CORRECTION_PROPOSAL'), `key ${key}: errors carry the critic code`);
  }
  eq(validateCorrectionProposal(null).valid, false);
  const badFn=JSON.parse(JSON.stringify(p));
  badFn.intent.run=()=>1;
  eq(validateCorrectionProposal(badFn).valid, false, 'executable content rejected — proposals are data, never commands (§26)');
});
test('C-25: proposal ids are content-derived — identical content yields identical ids, any content change moves the id (§29, gate 9)', ()=>{
  const content={deviationId:'dev-12345678', targetRef:'$step-1', intent:{type:'appearance', targets:[OID], fill:'#FF0000'}, reason:'restore fill', confidence:1, priority:0};
  const a=createCorrectionProposal(content);
  const b=createCorrectionProposal({...content});
  eq(a.id, b.id, 'same content => same id');
  expect(a.id!==createCorrectionProposal({...content, reason:'restore the fill'}).id, 'reason change moves the id');
  expect(a.id!==createCorrectionProposal({...content, deviationId:'dev-99999999'}).id, 'deviation change moves the id');
  expect(a.id!==createCorrectionProposal({...content, priority:1}).id, 'priority change moves the id');
});

console.log('=== PHASE 3.14 Checkpoint D: Evaluation + Critic integration (spec §42/§57) ===');
// The shared deviation fixture: the 3.13 slice doc drifted three ways at once
// (width 190 -> geometry:width + geometry:area; blue fill -> appearance:fill.color;
// tx:120 -> placement:center). Proven deviation sequence: B-27/C-19.
const D_DRIFT={width:190, fillColor:{r:0, g:0, b:255, a:1}, tx:120, ty:100};
test('D-1: evaluateAndCritique is the single §57 entry — returns the frozen { evaluationResult, proposals } pair; PASS end-to-end', ()=>{
  const out=evaluateAndCritique(bExpected(), docContext(makeDoc({tx:100, ty:100})), bContext());
  eq(Object.keys(out).sort().join(','), 'evaluationResult,proposals', 'exactly the two contract fields');
  expect(validateEvaluationResult(out.evaluationResult).valid, 'evaluationResult satisfies the §12 validator');
  eq(out.evaluationResult.status, 'PASS');
  eq(out.evaluationResult.deviations.length, 0);
  eq(out.proposals.length, 0, 'perfect execution -> nothing to propose');
  expect(Object.isFrozen(out), 'the pair is frozen');
  expect(Object.isFrozen(out.evaluationResult), 'evaluationResult frozen (§12)');
  expect(Object.isFrozen(out.proposals), 'proposals array frozen (§25)');
});
test('D-2: DEVIATION end-to-end — every proposal references a deviation OF THE SAME result and carries its targetRef exactly', ()=>{
  const out=evaluateAndCritique(bExpected(), docContext(makeDoc(D_DRIFT)), bContext());
  eq(out.evaluationResult.status, 'DEVIATION');
  eq(categoryPropertySeq(out.evaluationResult).join(','), 'geometry:width,geometry:area,appearance:fill.color,placement:center');
  eq(out.proposals.length, 3, 'geometry rebuild + fill restore + center translate (C-19 rule mapping through the integrated path)');
  const byId=new Map(out.evaluationResult.deviations.map((d)=>[d.id, d]));
  for(const p of out.proposals){
    expect(byId.has(p.deviationId), `proposal ${p.id} references a deviation that exists in the SAME evaluationResult`);
    eq(p.targetRef, byId.get(p.deviationId).targetRef, 'proposal.targetRef === its deviation.targetRef');
  }
});
test('D-3: targetRef flow — every deviation.targetRef is SET (never undefined, §13 grammar) and flows onto its proposal unaltered', ()=>{
  const out=evaluateAndCritique(bExpected(), docContext(makeDoc(D_DRIFT)), bContext());
  const ids=new Set(out.evaluationResult.deviations.map((d)=>d.id));
  for(const d of out.evaluationResult.deviations){
    expect(Object.prototype.hasOwnProperty.call(d, 'targetRef'), 'targetRef is a present field, never an absent one');
    expect(d.targetRef!==undefined, 'targetRef is never undefined');
    expect(d.targetRef===null || (typeof d.targetRef==='string' && d.targetRef.startsWith('$')), `'$'-prefixed plan reference or null, got ${JSON.stringify(d.targetRef)}`);
  }
  for(const p of out.proposals){
    expect(ids.has(p.deviationId), 'no proposal without a deviation (§25: the proposal must identify its deviation)');
    const d=out.evaluationResult.deviations.find((x)=>x.id===p.deviationId);
    eq(p.targetRef, d.targetRef, 'exact carry — no normalization, no re-binding');
    eq(p.targetRef, '$step-1', 'the evaluationContext reference is the one that flows');
  }
  expect(out.proposals.every((p)=>typeof p.deviationId==='string' && p.deviationId.startsWith('dev-')), 'proposal.deviationId is a deviation id');
});
test('D-4: plan-level deviations (targetRef:null) -> plan-level proposals carrying null, or no proposal per rule (§13/§21/§28)', ()=>{
  const out=evaluateAndCritique(bExpected(), docContext(makeDoc({width:190, tx:105, ty:100})), {targets:[{objectId:OID, targetRef:null}], artboard:B_ARTBOARD});
  eq(out.evaluationResult.deviations.map((d)=>JSON.stringify(d.targetRef)).join(','), 'null,null', 'geometry width+area deviations bind no plan reference');
  eq(out.proposals.length, 1, 'the create-rebuild correction is object-independent -> one plan-level proposal');
  eq(out.proposals[0].targetRef, null, 'plan-level proposal carries targetRef:null === its deviation.targetRef');
  const missing=evaluateAndCritique(bExpected(), docContext(makeDoc()), {targets:[{objectId:EOID, targetRef:null}], artboard:B_ARTBOARD});
  eq(missing.evaluationResult.deviations.length, 1);
  eq(missing.evaluationResult.deviations[0].category, 'existence');
  eq(missing.evaluationResult.deviations[0].targetRef, null);
  eq(missing.proposals.length, 0, 'existence has no capability -> plan-level deviation yields NO proposal (per rule, §28)');
});
test('D-5: determinism of the composed output — repeated runs byte-identical (sha256-equal) and orchestrator === manual two-step composition (§29/§67)', ()=>{
  const doc=makeDoc(D_DRIFT);
  const a=JSON.stringify(evaluateAndCritique(bExpected(), docContext(doc), bContext()));
  const b=JSON.stringify(evaluateAndCritique(bExpected(), docContext(doc), bContext()));
  eq(a, b, 'identical inputs -> byte-identical composed output');
  eq(sha256(a), sha256(b), 'sha256 of the composed output is stable across runs');
  const manual={ evaluationResult: evaluate(bExpected(), docContext(doc), bContext()), proposals: null };
  manual.proposals=proposeCorrections(manual.evaluationResult);
  eq(JSON.stringify(manual), a, 'the orchestrator adds nothing: same bytes as evaluate() then proposeCorrections()');
  const calm=JSON.stringify(evaluateAndCritique(bExpected(), docContext(makeDoc({tx:100, ty:100})), bContext()));
  expect(sha256(a)!==sha256(calm), 'anti-vacuity: a different doc state moves the hash');
});
test('D-6: §42 Layer 1 on the integrated path — the full pipeline (evaluation + critique) leaves stores, hierarchy, and the ExpectedState input untouched', ()=>{
  const doc=makeDoc(D_DRIFT);
  const expected=bExpected();
  const expectedBefore=JSON.stringify(expected);
  const before=captureStores(doc);
  evaluateAndCritique(expected, docContext(doc), bContext());
  eq(captureStores(doc), before, 'stores + hierarchy JSON untouched by the full pipeline');
  eq(JSON.stringify(expected), expectedBefore, 'the ExpectedState input is not mutated by evaluation or critique');
});
test('D-7: §42 Layer 2 — the ActualState embedded in the integrated output is a deep-frozen immutable snapshot', ()=>{
  const out=evaluateAndCritique(bExpected(), docContext(makeDoc(D_DRIFT)), bContext());
  const actual=out.evaluationResult.actual;
  expect(validateActualState(actual).valid, 'snapshot satisfies the §10 validator');
  expect(Object.isFrozen(actual), 'ActualState frozen');
  for(const entry of actual.objects){
    expect(Object.isFrozen(entry), 'entry frozen');
    expect(Object.isFrozen(entry.geometry) && Object.isFrozen(entry.geometry.params), 'observed geometry frozen');
    expect(Object.isFrozen(entry.worldTransform) && Object.isFrozen(entry.worldBBox), 'observed placement frozen');
    expect(Object.isFrozen(entry.childrenNodeIds), 'observed structure frozen');
    if(entry.fill){ expect(Object.isFrozen(entry.fill) && Object.isFrozen(entry.fill.color), 'observed fill frozen'); }
  }
});
test('D-8: §42 Layer 3 — critique mutates neither the canonical stores nor the EvaluationResult it consumes', ()=>{
  const doc=makeDoc(D_DRIFT);
  const result=evaluate(bExpected(), docContext(doc), bContext());
  const before=captureStores(doc);
  const resultJson=JSON.stringify(result);
  const proposals=proposeCorrections(result);
  eq(captureStores(doc), before, 'stores + hierarchy untouched by critique');
  eq(JSON.stringify(result), resultJson, 'the EvaluationResult is immutable input to the Critic — no in-place annotation');
  expect(proposals.length>0, 'the critique ran on a deviation result');
  const pair=evaluateAndCritique(bExpected(), docContext(doc), bContext());
  eq(JSON.stringify(pair.evaluationResult), resultJson, 'the integrated pair embeds the byte-identical result');
});
test('D-9: §42 Layer 4 — CorrectionProposal is not execution authority: inert frozen plain data, planning vocabulary only', ()=>{
  const out=evaluateAndCritique(bExpected(), docContext(makeDoc(D_DRIFT)), bContext());
  expect(out.proposals.length>0, 'fixture must produce proposals for the inertness proof');
  const banned=['execute', 'apply', 'commit', 'toolId', 'command', 'transaction'];
  for(const p of out.proposals){
    expect(Object.isFrozen(p) && Object.isFrozen(p.intent), 'proposal and its intent are frozen');
    expect(validateCorrectionProposal(p).valid, 'proposal satisfies the §25 validator');
    eq(JSON.stringify(JSON.parse(JSON.stringify(p))), JSON.stringify(p), 'JSON round-trip is lossless — plain data, zero executable content');
    for(const k of Object.keys(p)) expect(!banned.includes(k), `no execution-authority key '${k}' on the proposal`);
    for(const k of Object.keys(p.intent)) expect(!banned.includes(k), `no execution-authority key '${k}' on the intent`);
    expect(['create', 'transform', 'appearance', 'alignment', 'structure'].includes(p.intent.type), 'intent.type is a planning capability — the only route back is the Planner (§26/§31)');
  }
  eq(JSON.stringify(JSON.parse(JSON.stringify(out))), JSON.stringify(out), 'the whole pair survives serialization losslessly');
});
test('D-10: honest empty-proposal integration — a missing target yields DEVIATION + existence deviation + zero proposals, end to end (§21/§28)', ()=>{
  const out=evaluateAndCritique(bExpected(), docContext(makeDoc()), bContext([{objectId:EOID, targetRef:'$doc:'+EOID}]));
  eq(out.evaluationResult.status, 'DEVIATION');
  eq(out.evaluationResult.deviations.length, 1);
  eq(out.evaluationResult.deviations[0].category, 'existence');
  eq(out.evaluationResult.deviations[0].targetRef, '$doc:'+EOID, 'the resolvable $doc reference is retained (§21)');
  eq(out.proposals.length, 0, 'no capability -> no proposal — the pair reports the honest outcome');
  expect(validateEvaluationResult(out.evaluationResult).valid, 'result still satisfies §12');
});

// ============================================================================
// PHASE 3.14 — CHECKPOINT E (spec §36-§41, §58): VERTICAL SLICE.
// ============================================================================
// The complete Phase 3.14 pipeline, end to end, over the Phase 3.13 canonical
// fixture (spec §36 — REUSED, not redesigned):
//
//   Intent -> ExpectedState -> Plan -> DSL -> IR -> Tool Registry
//          -> Transaction -> Commit -> ActualState -> Evaluation -> Critic
//
// The fixture values below are VERBATIM from the Phase 3.13 vertical slice
// (tests/ai.test.mjs:242-245): the red rounded rectangle 200x100, rx=ry=12,
// centered on the 800x600 artboard, fill '#FF0000'. No second geometry
// fixture is introduced; E-S1 asserts the ExpectedState projection of the
// canonical fixture before anything else.
//
// Per-slice discipline (spec §37-§41 + the Checkpoint E directive):
//   - REAL substrate execution: fresh stores + SceneGraph + EventBus +
//     HistoryManager + TransactionExecutor + execution-side registry —
//     exactly the 3.13 Checkpoint F harness assembly minus Renderer/
//     SpatialIndex (neither is part of the §58 pipeline). The harness is the
//     composition layer; NO src-js/ file is modified by Checkpoint E.
//   - Controlled post-execution deviations (§38 "construct a controlled
//     deviation after execution"): the drift is injected through the stores'
//     own public update APIs / SceneGraph.setLocalTransform AFTER the real
//     commit, then evaluated. Slices are ISOLATED: each drift touches exactly
//     one category (the slice-2/5 geometry drift re-centers x:305 so
//     placement stays perfect — the B-era isolation lesson).
//   - Read-only proof per slice (directive 4): canonical-store snapshots
//     before/after the Evaluation/Critic segment, byte-identical (§42). The
//     planning segment gets the same proof (the 3.13 F-S2 pattern).
//   - Determinism per slice (directive 5, §67/§22): the §67 intra-run
//     protocol (repeat evaluateAndCritique on the same state -> byte-identical
//     JSON) PLUS the cross-run protocol (every slice runs TWICE as two
//     independent pipelines). Cross-run comparison normalizes RUNTIME IDENTITY
//     ONLY — the substrate uuid() (tools.js:10) is Math.random-based, so
//     object/geometry/appearance/node/transaction ids are runtime identities,
//     not content (the exact exclusion discipline of the 3.13 F snapshots:
//     "substrate-owned uuid()/Date.now() envelopes"), and the content-derived
//     dev-/prop- ids hash that identity. EVERYTHING else — deviation fields,
//     expected/actual/delta, messages, order, proposal intents — must be
//     byte-identical.
//   - Slice 5 stops at the Planner handoff (§41): the proposal reaches
//     Planner INPUT (validateIntent + createPlan + validatePlan) and NOT ONE
//     STEP further — the full correction cycle is NOT implemented in Phase
//     3.14; executing a correction plan through Transaction -> Commit again
//     belongs to a future phase (§41 closing paragraph). The Critic's
//     non-execution is proven live (stores/history invariance) and
//     structurally (module surface scan).
// ============================================================================

console.log('=== PHASE 3.14 Checkpoint E: vertical slice (spec §36-§41/§58) ===');

// The §36 canonical fixture, verbatim from tests/ai.test.mjs:242-245.
const E_ARTBOARD={ width:800, height:600, centerX:400, centerY:300 };
const E_PLAN_CTX=createPlanningContext({ artboard:E_ARTBOARD, objects:[] });
const E_INTENT={ type:'create', objectType:'rectangle', width:200, height:100, rx:12, ry:12, fill:'#FF0000', placement:'center' };

// Slice specs (spec §37-§41). Slice 1 = no drift (perfect execution).
const E_SLICES={
  1: {},
  2: { geometryDrift:{ width:190, x:305 } },
  3: { fillDrift:{ r:0, g:0, b:255, a:1 } },
  4: { translateDrift:{ dx:30, dy:0 } },
  5: { geometryDrift:{ width:190, x:305 } }
};

// The §58 harness — the composition layer a real application provides, per
// slice spec. It assembles the REAL execution substrate (the 3.13 Checkpoint F
// assembly minus Renderer/SpatialIndex — neither is part of the §58 pipeline),
// runs the full pipeline, constructs the slice's controlled post-execution
// deviation, and returns every artifact + snapshot the E tests assert on.
// NO src-js/ file is modified: every piece comes from the existing modules.
//   [CHECKPOINT-E-SUBSTRATE] docContext carries transactionManager (the
//     TransactionExecutor) — the F-era [CHECKPOINT-F-SUBSTRATE] contract.
//   [CHECKPOINT-E-EXEC] execution goes through the real DSLExecutor with the
//     execution-side registry — Plan -> DSL -> IR -> Tool Registry ->
//     Transaction -> Commit (the F-era [CHECKPOINT-F-EXEC] contract).
async function runEVerticalSlice(sliceSpec){
  // ---- Step 0: fresh document + substrate assembly (3.13-F harness shape) --
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:id=>geometryStore.has(id), hasAppearance:id=>appearanceStore.has(id)});
  const sceneGraph=new SceneGraph();
  const stores={objectStore, geometryStore, appearanceStore, sceneGraph};
  const eventBus=new EventBus();
  const historyManager=new HistoryManager();
  const transactionExecutor=new TransactionExecutor(stores, eventBus, historyManager);
  const docContext={...stores, transactionManager: transactionExecutor}; // [CHECKPOINT-E-SUBSTRATE]
  const toolRegistry=createCoreToolRegistry(); // execution-side registry (the Planner keeps its own read-only projection)

  // ---- Step 1: BEFORE PLANNING ----------------------------------------------
  const snapBeforePlanning=captureStores(stores);
  const historyBeforePlanning=historyManager.size();

  // ---- Step 2: Intent -> ExpectedState -> Plan -> DSL -> IR (read-only) -----
  const expectedState=createExpectedState(E_INTENT, E_PLAN_CTX);
  const plan=createPlan(E_INTENT, E_PLAN_CTX);
  const planVerdict=validatePlan(plan, E_PLAN_CTX);
  const dslProgram=compilePlanToDSL(plan);
  const parsed=parseDSL(JSON.stringify(dslProgram));
  const dslVerdict=validateDSL(parsed.program, E_PLAN_CTX);
  const ir=compileToIR(parsed.program, E_PLAN_CTX);
  const snapAfterPlanning=captureStores(stores);

  // ---- Step 3: DSL -> IR -> Tool Registry -> Transaction -> Commit ----------
  const historyBeforeExecution=historyManager.size();
  const execution=await new DSLExecutor().execute(ir.ir, {toolRegistry, documentContext: docContext}); // [CHECKPOINT-E-EXEC]
  const historyAfterExecution=historyManager.size();

  // ---- Step 4: bind the CREATED object to its plan-step output reference ----
  const objectId=execution.outputs[0] && execution.outputs[0].output && execution.outputs[0].output.objectId;
  if(!objectId) throw new Error('E harness: T01 produced no objectId — '+JSON.stringify(execution.errors));
  const obj=objectStore.get(objectId);
  const evaluationContext={ targets:[{objectId, targetRef:'$step-1'}], artboard: E_ARTBOARD };

  // ---- Step 5: the controlled post-execution deviation (§38-§40) ------------
  // Injected through the stores' own public update APIs / the SceneGraph's
  // public transform API — the harness composition layer constructing exactly
  // the drift the slice names, never the Evaluation/Critic modules themselves.
  let driftApplied='none';
  if(sliceSpec.geometryDrift){
    const geom=geometryStore.get(obj.geometryRef);
    geometryStore.update(obj.geometryRef, {...geom, params:{...geom.params, ...sliceSpec.geometryDrift}});
    driftApplied='geometry:'+JSON.stringify(sliceSpec.geometryDrift);
  }
  if(sliceSpec.fillDrift){
    const app=appearanceStore.get(obj.appearanceRef);
    const stack=app.stack.map(it=> it.type==='fill' ? {...it, data:{...it.data, color:{...sliceSpec.fillDrift}}} : it);
    appearanceStore.update(obj.appearanceRef, {...app, stack});
    driftApplied='fill:'+JSON.stringify(sliceSpec.fillDrift);
  }
  if(sliceSpec.translateDrift){
    const node=sceneGraph.findNodeByObjectId(objectId);
    sceneGraph.setLocalTransform(node.id, {a:1, b:0, c:0, d:1, tx:sliceSpec.translateDrift.dx, ty:sliceSpec.translateDrift.dy});
    driftApplied='translate:'+JSON.stringify(sliceSpec.translateDrift);
  }

  // ---- Step 6: ActualState -> Evaluation -> Critic (read-only segment) ------
  const snapBeforeEvaluation=captureStores(stores);
  const outcome=evaluateAndCritique(expectedState, docContext, evaluationContext);
  const snapAfterEvaluation=captureStores(stores);

  // ---- Step 7: §67 determinism protocol (same state, second critique) -------
  const repeatJson=JSON.stringify(evaluateAndCritique(expectedState, docContext, evaluationContext));

  return {
    sliceSpec, driftApplied,
    expectedState, plan, planVerdict, parsed, dslVerdict, execution,
    historyBeforePlanning, historyBeforeExecution, historyAfterExecution,
    snapBeforePlanning, snapAfterPlanning, snapBeforeEvaluation, snapAfterEvaluation,
    objectId, evaluationContext, docContext,
    substrate: {objectStore, geometryStore, appearanceStore, sceneGraph, historyManager},
    evaluationResult: outcome.evaluationResult,
    proposals: outcome.proposals,
    outcomeJson: JSON.stringify(outcome),
    repeatJson
  };
}

// Every slice runs TWICE (two independent pipelines) — memoized per slice.
const E_SLICE_RUNS=new Map();
function getESliceRuns(n){
  if(!E_SLICE_RUNS.has(n)){
    E_SLICE_RUNS.set(n, (async()=>{
      const a=await runEVerticalSlice(E_SLICES[n]);
      const b=await runEVerticalSlice(E_SLICES[n]);
      return [a,b];
    })());
  }
  return E_SLICE_RUNS.get(n);
}

// Cross-run normalization: replace RUNTIME identity (substrate uuid() output
// wherever it appears — standalone ids and substrings of messages/reasons —
// plus the dev-/prop- content ids derived from it) with stable placeholders.
// Content is compared in full; §16 governs Planner/Evaluation outputs, not
// substrate runtime envelopes (the 3.13 F exclusion discipline).
function normalizeRuntimeIdentity(v){
  if(typeof v==='string') return v
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/^dev-[0-9a-f]{8}$/, '<devid>')
    .replace(/^prop-[0-9a-f]{8}$/, '<propid>');
  if(Array.isArray(v)) return v.map(normalizeRuntimeIdentity);
  if(v && typeof v==='object'){ const o={}; for(const k of Object.keys(v).sort()) o[k]=normalizeRuntimeIdentity(v[k]); return o; }
  return v;
}

// The normalized slice digest: everything the slice claims, in one canonical
// byte string (cross-run compared; digests matrixed in E-S7).
function eSliceDigest(run){
  return JSON.stringify(normalizeRuntimeIdentity({
    driftApplied: run.driftApplied,
    expectedState: run.expectedState,
    planToolIds: run.plan.steps.map(s=>s.toolId),
    planValid: run.planVerdict.valid,
    parseOk: run.parsed.success,
    dslValid: run.dslVerdict.valid,
    executionSuccess: run.execution.success,
    executionTools: run.execution.outputs.map(o=>({toolId:o.toolId, success:o.success})),
    historyDelta: run.historyAfterExecution - run.historyBeforeExecution,
    committedState: run.snapBeforeEvaluation,
    evaluationResult: run.evaluationResult,
    proposals: run.proposals
  }));
}

test('E-S1: vertical slice 1 — perfect execution: the REAL pipeline commits 3 steps and ExpectedState === ActualState -> PASS, zero deviations, zero proposals (§36/§37/§58)', async ()=>{
  const [a,b]=await getESliceRuns(1);
  const run=a;
  // §36 fixture contract — the canonical projection of the reused fixture.
  eq(JSON.stringify(run.expectedState.geometry), JSON.stringify({width:200,height:100,rx:12,ry:12,area:20000,symmetric:true}), 'ExpectedState geometry = the §36 canonical fixture');
  eq(run.expectedState.spatial.centered, true, 'centered on artboard');
  eq(run.expectedState.appearance.fill, '#FF0000', 'red fill expectation');
  eq(run.plan.steps.map(s=>s.toolId).join(','), 'T01,T07,T08', 'the §36 fixture plan: create + fill (T07) + center align (T08)');
  expect(run.planVerdict.valid, 'validatePlan: '+JSON.stringify(run.planVerdict.errors));
  expect(run.parsed.success, 'parseDSL: '+JSON.stringify(run.parsed.errors));
  expect(run.dslVerdict.valid, 'validateDSL: '+JSON.stringify(run.dslVerdict.errors));
  // §58 pipeline: the execution segment went through Tool Registry -> Transaction -> Commit.
  expect(run.execution.success, 'DSLExecutor success: '+JSON.stringify(run.execution.errors));
  eq(run.historyAfterExecution-run.historyBeforeExecution, 3, 'three plan steps -> three substrate commits');
  // §37 checklist — verified on the EvaluationResult over the committed state.
  expect(validateEvaluationResult(run.evaluationResult).valid, '§12-valid result');
  eq(run.evaluationResult.status, 'PASS', 'perfect execution evaluates to PASS');
  eq(run.evaluationResult.deviations.length, 0, 'zero deviations — no false deviations');
  eq(run.proposals.length, 0, 'perfect execution -> zero proposals');
  const entry=run.evaluationResult.actual.objects[0];
  eq(entry.exists, true, 'object exists');
  eq(entry.targetRef, '$step-1', 'the created object binds its plan-step output reference');
  eq(JSON.stringify(entry.geometry.params), JSON.stringify({x:300,y:250,width:200,height:100,rx:12,ry:12}), 'geometry matches (plan-time centered x/y)');
  eq(JSON.stringify(entry.fill), JSON.stringify({kind:'solid',color:{r:255,g:0,b:0,a:1},opacity:1,enabled:true}), 'fill matches — hex #FF0000 vs the canonical RGBA representation is NOT a deviation (§39 normalization)');
  eq(JSON.stringify(BBox.center(entry.worldBBox)), JSON.stringify({x:400,y:300}), 'WorldBBox center === artboard center');
  eq(JSON.stringify(run.evaluationResult.evaluated), JSON.stringify(['existence','geometry','appearance','placement','structure']), 'the intended evaluated categories ran (transform dormant — no transform expectations)');
  eq(JSON.stringify(run.evaluationResult.metadata.unevaluatedExpectations), '[]', 'nothing unverifiable was silently dropped or invented');
  // Read-only proof (planning segment + evaluation/critic segment).
  eq(run.snapBeforePlanning, run.snapAfterPlanning, 'planning segment: stores byte-identical (Planner read-only, F-S2 pattern)');
  eq(run.snapBeforeEvaluation, run.snapAfterEvaluation, 'evaluation+critic segment: stores byte-identical (§42)');
  // Determinism (§67 intra-run + cross-run).
  eq(run.outcomeJson, run.repeatJson, 'intra-run §67 protocol: byte-identical repeat');
  eq(eSliceDigest(a), eSliceDigest(b), 'cross-run: two independent pipelines, identical normalized slice digest');
});

test('E-S2: vertical slice 2 — geometry deviation: width 200 -> 190 caught with category/property/expected/actual/delta=-10/targetRef exactly, one capability-backed rebuild proposal (§38)', async ()=>{
  const [a,b]=await getESliceRuns(2);
  const run=a;
  expect(run.execution.success, 'the pipeline executed before the drift');
  eq(run.driftApplied, 'geometry:{"width":190,"x":305}', 'the controlled post-commit drift: width 190, re-centered x 305 (placement stays perfect)');
  eq(categoryPropertySeq(run.evaluationResult).join(','), 'geometry:width,geometry:area', 'exactly the two geometry deviations, in the declared order — no unrelated categories');
  const d=run.evaluationResult.deviations[0];
  eq(d.category, 'geometry', '§38 category');
  eq(d.property, 'width', '§38 property');
  eq(d.expected, 200, '§38 expected');
  eq(d.actual, 190, '§38 actual');
  eq(d.delta, -10, '§38 delta = actual - expected');
  eq(d.tolerance, EVALUATION_TOLERANCES.geometry, 'tolerance is part of the contract (§14)');
  eq(d.severity, 'error', 'severity');
  eq(d.targetRef, '$step-1', 'targetRef: the plan reference that bound the created object');
  eq(d.objectId, run.objectId, 'objectId: the committed object');
  eq(JSON.stringify(run.evaluationResult.actual.objects[0].geometry.params), JSON.stringify({x:305,y:250,width:190,height:100,rx:12,ry:12}), 'the observed canonical geometry record');
  // Critic: geometry -> create-rebuild, rebuilt ONLY from the desired-state record.
  eq(run.proposals.length, 1, 'width+area collapse to ONE proposal (same rebuild intent, dedup)');
  const p=run.proposals[0];
  expect(validateCorrectionProposal(p).valid, '§25-valid proposal');
  eq(p.deviationId, d.id, 'references the first deviation (first-deviation ownership)');
  eq(p.targetRef, '$step-1', 'targetRef carried exactly');
  eq(JSON.stringify(p.intent), JSON.stringify({type:'create',objectType:'rect',width:200,height:100,rx:12,ry:12,fill:'#FF0000',placement:'center'}), 'create-rebuild from the ExpectedState — restoration values never come from the observed side');
  eq(p.confidence, 1, 'rule-derived confidence');
  eq(p.priority, 0, 'priority = deviation index');
  eq(run.snapBeforeEvaluation, run.snapAfterEvaluation, 'evaluation+critic segment: stores byte-identical');
  eq(run.outcomeJson, run.repeatJson, 'intra-run §67 protocol: byte-identical repeat');
  eq(eSliceDigest(a), eSliceDigest(b), 'cross-run: identical normalized slice digest');
});

test('E-S3: vertical slice 3 — appearance deviation: the hex expectation is normalized to RGBA and compared against the canonical AppearanceStore representation (§39)', async ()=>{
  const [a,b]=await getESliceRuns(3);
  const run=a;
  eq(categoryPropertySeq(run.evaluationResult).join(','), 'appearance:fill.color', 'exactly the fill.color deviation');
  const d=run.evaluationResult.deviations[0];
  eq(JSON.stringify(d.expected), JSON.stringify({r:255,g:0,b:0,a:1}), 'expected side: #FF0000 NORMALIZED to canonical RGBA — representations are never compared as strings');
  eq(JSON.stringify(d.actual), JSON.stringify({r:0,g:0,b:255,a:1}), 'actual side: the canonical AppearanceStore color record, verbatim');
  eq(d.delta, null, 'a non-numeric comparison carries no delta (§13)');
  eq(d.tolerance, EVALUATION_TOLERANCES.appearance, 'appearance tolerance');
  eq(d.targetRef, '$step-1', 'targetRef');
  eq(run.proposals.length, 1, 'one capability-backed proposal');
  const p=run.proposals[0];
  eq(JSON.stringify(p.intent), JSON.stringify({type:'appearance',targets:[run.objectId],fill:'#FF0000'}), 'T07 appearance intent — the restoration hex comes from the ExpectedState');
  eq(p.deviationId, d.id, 'references its deviation');
  eq(p.targetRef, '$step-1', 'targetRef carried exactly');
  eq(run.snapBeforeEvaluation, run.snapAfterEvaluation, 'stores byte-identical across the evaluation+critic segment');
  eq(run.outcomeJson, run.repeatJson, 'intra-run §67 protocol');
  eq(eSliceDigest(a), eSliceDigest(b), 'cross-run determinism');
});

test('E-S4: vertical slice 4 — placement deviation: the observed WorldBBox is composed from public pure pieces (geometryBBox + world transform) and the center drift is caught deterministically (§40)', async ()=>{
  const [a,b]=await getESliceRuns(4);
  const run=a;
  eq(categoryPropertySeq(run.evaluationResult).join(','), 'placement:center', 'exactly the placement:center deviation');
  const entry=run.evaluationResult.actual.objects[0];
  eq(JSON.stringify(entry.worldTransform), JSON.stringify({a:1,b:0,c:0,d:1,tx:30,ty:0}), 'the controlled drift lives in the node world transform');
  // §40/§51: recompute the observed WorldBBox from the SAME public pure pieces.
  const recomposed=BBox.transform(rectBBox(entry.geometry.params), entry.worldTransform);
  eq(JSON.stringify(entry.worldBBox), JSON.stringify(recomposed), 'observed WorldBBox === rectBBox(geometry params) ⊕ BBox.transform(world transform)');
  eq(JSON.stringify(entry.worldBBox), JSON.stringify({minX:330,minY:250,maxX:530,maxY:350}), 'the drifted world bbox');
  eq(JSON.stringify(BBox.center(entry.worldBBox)), JSON.stringify({x:430,y:300}), 'the observed center');
  const d=run.evaluationResult.deviations[0];
  eq(JSON.stringify(d.expected), JSON.stringify({x:400,y:300}), 'expected: the artboard center from the evaluation context (never guessed)');
  eq(JSON.stringify(d.actual), JSON.stringify({x:430,y:300}), 'actual: the observed world-bbox center');
  eq(d.delta, null, 'the center comparison carries no numeric delta (§13)');
  eq(d.tolerance, EVALUATION_TOLERANCES.placement, 'placement tolerance');
  eq(d.targetRef, '$step-1', 'targetRef');
  eq(run.proposals.length, 1, 'one capability-backed proposal');
  const p=run.proposals[0];
  eq(JSON.stringify(p.intent), JSON.stringify({type:'transform',targets:[run.objectId],operation:'translate',params:{x:-30,y:0}}), 'T05 translate delta = expected center - observed center (delta semantics, ai.js:764-779)');
  eq(p.deviationId, d.id, 'references its deviation');
  // tools.js remains unchanged: the placement check consumed only the injected read
  // surface and the public pure pieces (geometry.js bbox fns ⊕ bbox.js transform —
  // the A-29 import contract); the hash baselines in the evidence directory cover it.
  eq(run.snapBeforeEvaluation, run.snapAfterEvaluation, 'stores byte-identical across the evaluation+critic segment');
  eq(run.outcomeJson, run.repeatJson, 'intra-run §67 protocol');
  eq(eSliceDigest(a), eSliceDigest(b), 'cross-run determinism');
});

test('E-S5: vertical slice 5 — correction handoff: the proposal reaches Planner INPUT (validateIntent + createPlan + validatePlan) and NOTHING executes; the loop terminates (§41)', async ()=>{
  const [run]=await getESliceRuns(5);
  expect(run.execution.success, 'the pipeline executed');
  eq(run.proposals.length, 1, 'the geometry drift yields exactly one CorrectionProposal');
  const p=run.proposals[0];
  expect(validateCorrectionProposal(p).valid, '§25-valid proposal at the boundary');
  // (1) The proposal reaches Planner input: the Planner's OWN gate accepts it.
  expect(validateIntent(p.intent).valid, 'proposal.intent passes the Planner intent validation — the handoff input is well-formed');
  const correctionPlan=createPlan(p.intent, E_PLAN_CTX);
  eq(correctionPlan.steps.map(s=>s.toolId).join(','), 'T01,T07,T08', 'the rebuild intent re-plans exactly like the original §36 fixture intent');
  expect(validatePlan(correctionPlan, E_PLAN_CTX).valid, 'the correction plan validates — the handoff produces a REAL plan');
  // (2) The Critic did NOT execute: critique + re-planning mutate nothing.
  const snapAtBoundary=captureStores(run.substrate);
  const reProposed=proposeCorrections(run.evaluationResult);
  createPlan(p.intent, E_PLAN_CTX);
  eq(captureStores(run.substrate), snapAtBoundary, 'critique + re-planning executed NOTHING — stores byte-identical (§24/§26)');
  eq(run.substrate.historyManager.size(), run.historyAfterExecution, 'history unchanged — no correction was ever committed');
  // (3) No uncontrolled loop: repeated critique is stateless, finite, non-growing (§31/§32).
  eq(JSON.stringify(reProposed), JSON.stringify(run.proposals), 're-critique of the same result is byte-identical — no accumulation');
  const triple=[1,2,3].map(()=>JSON.stringify(evaluateAndCritique(run.expectedState, run.docContext, run.evaluationContext)));
  eq(new Set(triple).size, 1, 'three consecutive critique cycles terminate identically — no ratchet, no escalation');
  expect(triple[0].includes('"proposals":[]')===false, 'the loop proof runs on a non-empty critique (anti-vacuity)');
  // (4) Structural non-execution: the critic module surface has no execution authority.
  eq(Object.keys(CriticNS).sort().join(','), 'CriticError,CriticErrorCodes,createCorrectionProposal,evaluateAndCritique,proposeCorrections,validateCorrectionProposal', 'the critic exports ONLY data/verdict surfaces — no execute/apply/commit (the C-3 static scan re-proven live)');
  // Documented boundary (§41): the full correction cycle is NOT implemented —
  // executing the correction plan through Transaction -> Commit again belongs to a
  // future phase. This test STOPS at the Planner handoff, exactly as mandated.
});

test('E-S6: the §31/§32 loop boundary holds across slices — stateless critique, invariant history, no execution authority on either 3.14 module surface', async ()=>{
  const [run]=await getESliceRuns(2);
  eq(run.substrate.historyManager.size(), run.historyAfterExecution, 'no commits beyond the three pipeline commits, end to end');
  const json=JSON.stringify(evaluateAndCritique(run.expectedState, run.docContext, run.evaluationContext));
  eq(sha256(json), sha256(run.outcomeJson), 'a critique cycle on the committed state reproduces the slice outcome byte-for-byte');
  for(const name of Object.keys(EvaluationNS)) expect(!/execute|commit|apply|perform|run\b/i.test(name), `evaluation surface export '${name}' carries no execution authority`);
  for(const name of Object.keys(CriticNS)) expect(!/execute|commit|apply|perform|run\b/i.test(name), `critic surface export '${name}' carries no execution authority`);
  eq(Object.keys(EvaluationNS).length, 12, 'evaluation surface: the 12 A/B-era exports, nothing new');
  eq(Object.keys(CriticNS).length, 6, 'critic surface: the 6 C/D-era exports, nothing new');
});

test('E-S7: determinism matrix — every slice twice byte-identical; different controlled deviations provably move the digest; the same drift in two slices is byte-identical (§67/§22)', async ()=>{
  const digests={};
  for(const n of [1,2,3,4,5]){
    const [x,y]=await getESliceRuns(n);
    eq(eSliceDigest(x), eSliceDigest(y), `slice ${n}: two independent pipelines, identical normalized digest`);
    eq(x.outcomeJson, x.repeatJson, `slice ${n}: intra-run §67 protocol byte-identical`);
    digests[n]=eSliceDigest(x);
  }
  expect(digests[1]!==digests[2] && digests[1]!==digests[3] && digests[1]!==digests[4] && digests[2]!==digests[3] && digests[2]!==digests[4] && digests[3]!==digests[4], 'anti-vacuity: different controlled deviations move the digest — the slices are not vacuously identical');
  eq(digests[5], digests[2], 'slice 5 reuses the slice-2 drift spec: independent pipelines running the SAME controlled deviation produce byte-identical outcomes');
});

// ============================================================================
// PHASE 3.14 — CHECKPOINT F: CORRECTION BOUNDARY (spec §32/§33/§41/§59)
// ============================================================================
// The §59 mandate: verify
//     CorrectionProposal -> Planner
// WITHOUT
//     CorrectionProposal -> Tool
// The loop must stop at the planning boundary unless an explicit future phase
// invokes another execution cycle. Checkpoint E demonstrated the boundary
// inside the vertical slice (E-S5); Checkpoint F makes it EXPLICIT and tests
// it at the MODULE level, over the same REAL proposals the slices produced.
//
// The five directive requirements and where each is proven:
//   1. Proposal -> Planner handoff (validateIntent + createPlan + validatePlan)
//      over >= 2 proposal types -> F-1 (geometry + appearance + placement);
//      the resulting Plan is a NEW plan (not a mutation of the old plan)
//      -> F-2.
//   2. No Tool execution after a proposal: static scan of critic.js (no
//      tool/transaction execution surface) + the directive's runtime proof
//      (history.size() unchanged after critique) + a mutation-access spy over
//      the injected read surface -> F-3; per-handoff history proofs in F-1/F-2.
//   3. No uncontrolled loop (§32): the correction boundary is a single
//      explicit invocation; loops are NOT implemented in the MVP; explicit
//      re-invocation terminates identically, without accumulation -> F-4.
//   4. No-progress boundary DEFINED (§33): materially identical deviation
//      content across cycles, made detectable by a deterministic content
//      fingerprint; the MVP documents the boundary as a test and implements
//      NO autonomous looping -> F-5.
//   5. Read-only boundary: the CorrectionProposal is inert plain frozen data
//      with no execution-authority key surface; JSON round-trip is lossless
//      -> F-6.
//
// Proposal sources: the memoized Checkpoint E slice runs (real pipeline
// commits, real drift, real Critic output) — slices 2/3/4 yield the geometry,
// appearance, and placement proposal types. Transform-keyed proposals stay
// dormant in the MVP flow (the ExpectedState model carries no transform
// section for create intents, so critic.js transformProposal returns null),
// which is why the directive's suggested pairs reduce to geometry +
// appearance (+ the placement translate) — all three exercised here.
//
// RED-first: Checkpoint F adds NO production exports (the boundary already
// exists — F verifies it), so the harness-anchor pattern applies (the 3.13-F
// / 3.14-E precedent, user-approved at Checkpoint E): the tests are written
// against the F boundary-probe harness, which is deliberately not built at
// RED time and throws '[CHECKPOINT-F-HARNESS] RED'.
// ============================================================================

console.log('=== PHASE 3.14 Checkpoint F: correction boundary (spec §32/§33/§41/§59) ===');

// The F boundary-probe harness (test-side composition layer; no production
// export is added — the boundary already exists, F verifies it).
//   - objectCtx(objectId): a frozen PlanningContext whose objects snapshot
//     contains the COMMITTED runtime object id — the planning shape for
//     target-bearing (appearance / transform) proposal intents (ai.js
//     resolveDocRefs resolves '$doc:<objectId>' against context.objects).
//   - spy(doc): a mutation-access spy over the injected read surface. It
//     records EVERY method call and property set performed through the
//     document context during a critique. The mutation vocabulary covers the
//     stores'/scene graph's own public mutation method names (stores.js
//     create/update/delete/clear; scenegraph createRoot/createNode/
//     createGroup/removeNode/insertChild/removeChild/setLocalTransform/
//     setDependencies) plus a generic safety net, and any property SET.
//   - fingerprint(evaluationResult): the §33 deviation-content fingerprint —
//     sha256 over the key-sorted canonical JSON of the deviations with
//     RUNTIME IDENTITY normalized away (substrate uuids and the dev-/prop-
//     ids derived from them — the declared 3.13-F exclusion discipline).
//     Content is compared in full; identity envelopes are not content.
//   - hasFunction(value): deep function-path scan (the inert-data probe;
//     mirrors the validators' own plain-data rule). Returns the path or null.
//   - catchPlanningError(fn): captures a Planner refusal at the handoff gate.
let F_TOOLKIT=null;
function fHarness(){
  if(F_TOOLKIT) return F_TOOLKIT;
  const objectCtx=(objectId)=>createPlanningContext({ artboard:E_ARTBOARD, objects:{ [objectId]:{} } });
  const MUT=/^(create|update|delete|clear|remove|insert|set|move|upsert|apply|write|commit|execute|perform)/;
  function spy(doc){
    const calls=[];
    const wrap=(name, obj)=>new Proxy(obj, {
      get(t, prop){
        const v=t[prop];
        if(typeof v==='function') return (...args)=>{ calls.push({store:name, method:String(prop)}); return v.apply(t, args); };
        return v;
      },
      set(t, prop, v){ calls.push({store:name, method:'[property-set]'+String(prop)}); t[prop]=v; return true; }
    });
    const ctx={
      objectStore: wrap('objectStore', doc.objectStore),
      geometryStore: wrap('geometryStore', doc.geometryStore),
      appearanceStore: wrap('appearanceStore', doc.appearanceStore),
      sceneGraph: wrap('sceneGraph', doc.sceneGraph),
      transactionManager: wrap('transactionManager', doc.transactionManager)
    };
    return {
      ctx, calls,
      get mutationCalls(){ return calls.filter(c=>MUT.test(c.method)); },
      get transactionCalls(){ return calls.filter(c=>c.store==='transactionManager'); }
    };
  }
  const fingerprint=(evaluationResult)=>sha256(JSON.stringify(normalizeRuntimeIdentity(evaluationResult.deviations)));
  function hasFunction(value, path=''){
    if(typeof value==='function') return path||'(root)';
    if(Array.isArray(value)){
      for(let i=0;i<value.length;i++){ const hit=hasFunction(value[i], path+'['+i+']'); if(hit) return hit; }
      return null;
    }
    if(value && typeof value==='object'){
      for(const k of Object.keys(value)){ const hit=hasFunction(value[k], path+'.'+k); if(hit) return hit; }
    }
    return null;
  }
  const catchPlanningError=(fn)=>{ try{ fn(); }catch(e){ return {name:e.name, code:e.code, message:e.message}; } return null; };
  F_TOOLKIT={ objectCtx, spy, fingerprint, hasFunction, catchPlanningError };
  return F_TOOLKIT;
}

test('F-1: correction handoff at module level — proposal.intent is valid Planner input (validateIntent -> createPlan -> validatePlan) for the geometry + appearance + placement proposal types, and the handoff is a GATE the Planner owns (§26/§41/§59)', async ()=>{
  const H=fHarness();
  const [r2]=await getESliceRuns(2);
  const [r3]=await getESliceRuns(3);
  const [r4]=await getESliceRuns(4);
  const pGeo=r2.proposals[0], pApp=r3.proposals[0], pPlace=r4.proposals[0];
  expect(validateCorrectionProposal(pGeo).valid, 'geometry proposal is §25-valid');
  expect(validateCorrectionProposal(pApp).valid, 'appearance proposal is §25-valid');
  expect(validateCorrectionProposal(pPlace).valid, 'placement proposal is §25-valid');
  eq(pGeo.intent.type, 'create', 'proposal type 1: geometry -> create-rebuild');
  eq(pApp.intent.type, 'appearance', 'proposal type 2: appearance -> T07');
  eq(pPlace.intent.type, 'transform', 'proposal type 3: placement -> T05 translate');
  // (a) validateIntent — the Planner intent gate accepts every proposal intent.
  for(const [name, p] of [['geometry', pGeo], ['appearance', pApp], ['placement', pPlace]]){
    const v=validateIntent(p.intent);
    expect(v.valid, name+' proposal.intent passes validateIntent: '+JSON.stringify(v.errors));
  }
  // (b) createPlan + validatePlan — the handoff produces REAL plans.
  const geoPlan=createPlan(pGeo.intent, E_PLAN_CTX);
  eq(geoPlan.steps.map(s=>s.toolId).join(','), 'T01,T07,T08', 'the geometry rebuild re-plans through the create capability exactly like the §36 fixture');
  expect(validatePlan(geoPlan, E_PLAN_CTX).valid, 'the geometry correction plan validates');
  const appCtx=H.objectCtx(r3.objectId);
  const appPlan=createPlan(pApp.intent, appCtx);
  eq(appPlan.steps.map(s=>s.toolId).join(','), 'T07', 'the appearance proposal plans through T07 only');
  eq(JSON.stringify(appPlan.steps[0].input), JSON.stringify({objectIds:['$doc:'+r3.objectId], fill:{kind:'solid', color:'#FF0000'}}), 'the T07 input carries the restoration fill from the ExpectedState and the $doc reference');
  expect(validatePlan(appPlan, appCtx).valid, 'the appearance correction plan validates');
  const placeCtx=H.objectCtx(r4.objectId);
  const placePlan=createPlan(pPlace.intent, placeCtx);
  eq(placePlan.steps.map(s=>s.toolId).join(','), 'T05', 'the placement proposal plans through T05 translate');
  eq(JSON.stringify(placePlan.steps[0].input), JSON.stringify({objectIds:['$doc:'+r4.objectId], delta:{x:-30, y:0}}), 'the T05 input carries the proposal translate delta (expected center - observed center)');
  expect(validatePlan(placePlan, placeCtx).valid, 'the placement correction plan validates');
  // (c) The handoff committed NOTHING — on every slice substrate.
  eq(r2.substrate.historyManager.size(), r2.historyAfterExecution, 'geometry handoff: history unchanged');
  eq(r3.substrate.historyManager.size(), r3.historyAfterExecution, 'appearance handoff: history unchanged');
  eq(r4.substrate.historyManager.size(), r4.historyAfterExecution, 'placement handoff: history unchanged');
  // (d) The gate is REAL: the Planner — not the Critic — owns validation at
  // the boundary. The same appearance intent against a planning snapshot
  // whose objects map is well-formed but does NOT contain the target is
  // refused: the Planner never guesses identities (§13). A proposal is
  // input, not authority.
  const gate=H.catchPlanningError(()=>createPlan(pApp.intent, createPlanningContext({ artboard:E_ARTBOARD, objects:{} })));
  expect(gate, 'the Planner refuses the appearance intent against a snapshot without the target object');
  eq(gate.name, 'PlanningError', 'the refusal is a PlanningError');
  eq(gate.code, 'INVALID_PARAMETER', 'refusal code');
  expect(gate.message.includes('not found in PlanningContext.objects'), 'the refusal names the identity-resolution failure: '+gate.message);
});

test('F-2: the correction Plan is a NEW plan — a fresh deep-frozen object from an independent createPlan invocation, never a mutation of or an alias to the executed plan (§26/§59)', async ()=>{
  const H=fHarness();
  const [r2]=await getESliceRuns(2);
  const [r3]=await getESliceRuns(3);
  // -- The appearance case: correction content DIFFERS from the executed plan.
  const original=r3.plan;
  const originalJson=JSON.stringify(original);
  const correction=createPlan(r3.proposals[0].intent, H.objectCtx(r3.objectId));
  expect(correction!==original, 'a distinct object — createPlan never returns (or aliases) the executed plan');
  eq(correction.steps.length, 1, 'the correction plan carries ONE T07 step');
  eq(original.steps.length, 3, 'the executed plan carried three steps (T01,T07,T08) — the plans genuinely differ');
  expect(correction.id!==original.id, 'content-derived plan ids differ — different content, different identity');
  eq(JSON.stringify(original), originalJson, 'the executed plan is byte-identical after the handoff — the new plan is NOT a mutation of it');
  expect(Object.isFrozen(correction) && Object.isFrozen(correction.steps) && Object.isFrozen(correction.steps[0]) && Object.isFrozen(correction.expectedState), 'the correction plan is deep-frozen inert data — mutation is structurally impossible, so a NEW plan is the only semantics available');
  // -- The geometry edge: the rebuild re-plans the SAME canonical capability
  //    sequence, yet is still a fresh object, and the identity fields move
  //    with the raw intent content (the Critic states objectType in the
  //    canonical vocabulary 'rect'; the fixture intent said 'rectangle').
  const original2Json=JSON.stringify(r2.plan);
  const rebuild=createPlan(r2.proposals[0].intent, E_PLAN_CTX);
  expect(rebuild!==r2.plan, 'even a byte-equivalent re-plan is a fresh object — no aliasing to the executed plan');
  eq(JSON.stringify(rebuild.steps), JSON.stringify(r2.plan.steps), 'the rebuild yields the same canonical step sequence — the planning OUTCOME is reproducible from the proposal');
  eq(JSON.stringify({...rebuild.expectedState, intentId:null}), JSON.stringify({...r2.plan.expectedState, intentId:null}), 'the ExpectedState projection is identical except intentId, which hashes the raw intent');
  expect(rebuild.id!==r2.plan.id && rebuild.intentId!==r2.plan.intentId, 'plan/intent identities move with the raw intent content (§16 content-derived identity)');
  eq(JSON.stringify(r2.plan), original2Json, 'the executed geometry plan remains byte-identical after the re-plan');
  // -- Neither handoff committed anything.
  eq(r2.substrate.historyManager.size(), r2.historyAfterExecution, 'geometry re-plan committed nothing');
  eq(r3.substrate.historyManager.size(), r3.historyAfterExecution, 'appearance handoff committed nothing');
});

test('F-3: no tool/transaction execution surface — critic.js statically carries none, and at runtime the critique reads the stores through the injected surface while committing nothing and touching no mutation method (§24/§26/§59)', async ()=>{
  const H=fHarness();
  // (a) STATIC: critic.js carries no tool/transaction execution surface.
  const src=readFileSync(new URL('../src-js/critic.js', import.meta.url), 'utf-8');
  eq(JSON.stringify(importSpecifiersOf(src).sort()), JSON.stringify(['./evaluation.js']), 'exactly one import: the evaluation contract validator — no tools/transaction/dsl/planner module');
  for(const banned of ['toolRegistry','ToolRegistry','TransactionExecutor','DSLExecutor','createCoreToolRegistry','.execute(','.commit(','import(','require(']){
    expect(!src.includes(banned), 'critic.js must not contain \''+banned+'\'');
  }
  const [r2]=await getESliceRuns(2);
  // (b) RUNTIME (the directive's proof): history.size() unchanged after critique.
  eq(r2.substrate.historyManager.size(), r2.historyAfterExecution, 'history.size() unchanged after critique — no tool ran, nothing committed');
  // (c) RUNTIME (stronger): a mutation-access spy over the injected read
  // surface — the critique READS the read surfaces and NEVER touches a
  // mutation method, a property setter, or the transaction manager.
  const spy=H.spy(r2.docContext);
  const out=evaluateAndCritique(r2.expectedState, spy.ctx, r2.evaluationContext);
  eq(spy.mutationCalls.length, 0, 'zero mutation-vocabulary calls through the document context during critique: '+JSON.stringify(spy.mutationCalls));
  eq(spy.transactionCalls.length, 0, 'the critique never touches the transaction manager');
  const reads=new Set(spy.calls.map(c=>c.store+'.'+c.method));
  for(const need of ['objectStore.get','geometryStore.get','appearanceStore.get','sceneGraph.findNodeByObjectId','sceneGraph.getWorldTransform']){
    expect(reads.has(need), 'anti-vacuity: the read surface was genuinely exercised ('+need+' observed)');
  }
  eq(out.evaluationResult.status, 'DEVIATION', 'anti-vacuity: the spied critique is the real drifted outcome, not an empty shell');
  eq(out.proposals.length, 1, 'anti-vacuity: the spied critique still proposes the real correction');
});

test('F-4: no uncontrolled loop (§32) — the correction boundary is a single EXPLICIT invocation; no self-scheduling machinery exists on either 3.14 module; explicit re-invocations terminate identically without accumulation (§31)', async ()=>{
  const H=fHarness();
  // (a) STATIC: no autonomous-loop machinery on either 3.14 module surface.
  const sources=[
    ['critic.js', readFileSync(new URL('../src-js/critic.js', import.meta.url), 'utf-8')],
    ['evaluation.js', readFileSync(new URL('../src-js/evaluation.js', import.meta.url), 'utf-8')]
  ];
  for(const banned of ['setInterval','setTimeout','setImmediate','queueMicrotask','requestAnimationFrame','addEventListener','import(']){
    for(const [mod, src] of sources){
      expect(!src.includes(banned), 'module '+mod+' must not contain \''+banned+'\'');
    }
  }
  const [r2]=await getESliceRuns(2);
  // (b) RUNTIME: cycles happen ONLY because the caller explicitly re-invokes.
  // Three explicit invocations: byte-identical outcomes, one proposal per
  // cycle, no growth, no ratchet.
  const outcomes=[1,2,3].map(()=>JSON.stringify(evaluateAndCritique(r2.expectedState, r2.docContext, r2.evaluationContext)));
  eq(new Set(outcomes).size, 1, 'three EXPLICIT cycles terminate byte-identically — stateless, no escalation, no accumulation');
  expect(!outcomes[0].includes('"proposals":[]'), 'anti-vacuity: the loop proof runs on a non-empty proposal set');
  eq(JSON.parse(outcomes[0]).proposals.length, 1, 'exactly one proposal per cycle — the proposal set never grows across cycles');
  // (c) The boundary holds per invocation: no commit follows any cycle.
  eq(r2.substrate.historyManager.size(), r2.historyAfterExecution, 'no commit follows any cycle — the loop stops at the planning boundary');
  // DOCUMENTED (§32): the MVP does NOT implement "while (deviation exists)".
  // evaluateAndCritique is ONE invocation returning ONE frozen
  // { evaluationResult, proposals } pair; a next cycle happens ONLY if the
  // application layer explicitly invokes again — exactly what this test does
  // — and nothing in the 3.14 modules or the substrate self-schedules,
  // listens, or ticks toward that next cycle (assertion (a)).
});

test('F-5: the no-progress boundary is DEFINED and detectable (§33) — materially identical deviation content across cycles is fingerprinted deterministically; the MVP response is defined, bounded, and non-escalating; no autonomous looping is implemented (§33 mandate)', async ()=>{
  const H=fHarness();
  const [r1]=await getESliceRuns(1);
  const [r2]=await getESliceRuns(2);
  const [r3]=await getESliceRuns(3);
  const [r4]=await getESliceRuns(4);
  const [r5]=await getESliceRuns(5);
  // THE BOUNDARY CONDITION (§33, documented): a no-progress condition occurs
  // when repeated evaluation produces MATERIALLY IDENTICAL DEVIATION CONTENT.
  // The detector input is the canonical deviation content (runtime identity
  // normalized away — the declared 3.13-F exclusion discipline); the
  // fingerprint is its deterministic sha256. A future correction loop must
  // STOP when cycle N's fingerprint equals cycle N-1's.
  const fp=(run)=>H.fingerprint(run.evaluationResult);
  // (a) The condition is REAL and detectable: three explicit cycles on the
  // UNCORRECTED drifted state produce materially identical deviation content.
  const cycleFps=[1,2,3].map(()=>H.fingerprint(evaluateAndCritique(r2.expectedState, r2.docContext, r2.evaluationContext).evaluationResult));
  eq(new Set(cycleFps).size, 1, 'three cycles on the uncorrected state: identical deviation fingerprints — the §33 no-progress condition fires deterministically');
  eq(cycleFps[0], fp(r2), 'the fingerprint matches the memoized slice outcome — the deviation content is stable across every observation');
  // (b) Anti-vacuity: the fingerprint is non-degenerate — materially DIFFERENT
  // deviation contents provably move it (a future loop would not false-positive
  // no-progress across genuinely different deviations).
  const f1=fp(r1), f2=fp(r2), f3=fp(r3), f4=fp(r4);
  eq(new Set([f1,f2,f3,f4]).size, 4, 'perfect execution + three different drifts -> four distinct fingerprints');
  eq(fp(r5), f2, 'the same controlled drift (slice 5 = slice 2 spec) fingerprints identically — the fingerprint is content-addressed, not run-addressed');
  // (c) The MVP response to the condition is defined and bounded: NOTHING
  // executes the correction (so nothing can endlessly re-execute it), and
  // repeated critique does not escalate.
  eq(r2.substrate.historyManager.size(), r2.historyAfterExecution, 'no execution follows the proposals — the system cannot endlessly execute what never executes');
  const c1=JSON.stringify(evaluateAndCritique(r2.expectedState, r2.docContext, r2.evaluationContext).proposals);
  const c2=JSON.stringify(evaluateAndCritique(r2.expectedState, r2.docContext, r2.evaluationContext).proposals);
  eq(c1, c2, 'repeated critique: byte-identical proposals — no confidence/priority/count escalation across cycles');
  const firstProposal=JSON.parse(c1)[0];
  expect(firstProposal, 'anti-vacuity: the escalation proof runs on a non-empty proposal set');
  eq(firstProposal.confidence, 1, 'confidence stays the rule-derived constant — no cycle-count dependence');
  eq(firstProposal.priority, 0, 'priority stays the deviation index — no ratchet');
  // DOCUMENTED (§33): the boundary is DEFINED for the future correction loop —
  // STOP when the deviation fingerprint of cycle N equals cycle N-1's — and
  // the MVP implements NO loop (§32): it stops at the planning boundary
  // (§41/§59), so the condition can never be violated by autonomous
  // execution. When progress IS possible it requires an actual document
  // change, and the only state-changing authority is the execution
  // architecture (Plan -> DSL -> Transaction -> Commit) — outside the
  // read-only Critic.
});

test('F-6: the read-only boundary — the CorrectionProposal is inert data: exactly the 7 §25 keys, no execution-authority key surface, plain deep-frozen data, and a lossless JSON round-trip (§25/§26/§59)', async ()=>{
  const H=fHarness();
  const [r2]=await getESliceRuns(2);
  const [r3]=await getESliceRuns(3);
  const [r4]=await getESliceRuns(4);
  const all=[['geometry', r2.proposals[0]], ['appearance', r3.proposals[0]], ['placement', r4.proposals[0]]];
  eq(all.filter(([, p])=>p).length, 3, 'anti-vacuity: three real proposals across the three proposal types');
  for(const [name, p] of all){
    expect(validateCorrectionProposal(p).valid, name+' proposal is §25-valid');
    eq(Object.keys(p).sort().join(','), 'confidence,deviationId,id,intent,priority,reason,targetRef', name+': exactly the 7 §25 keys — no extra surface');
    for(const k of Object.keys(p)){
      expect(!/execute|commit|apply|transaction|command|tool|perform|dispatch/i.test(k), name+': proposal key \''+k+'\' carries no execution authority');
    }
    eq(H.hasFunction(p), null, name+': plain data only — no function values at any depth');
    expect(Object.isFrozen(p) && Object.isFrozen(p.intent), name+': the proposal and its intent are frozen inert data');
    // JSON round-trip: lossless, and the copy is still a valid proposal.
    const rt=JSON.parse(JSON.stringify(p));
    eq(JSON.stringify(rt), JSON.stringify(p), name+': the JSON round-trip is byte-identical');
    for(const k of Object.keys(p)){
      eq(JSON.stringify(rt[k]), JSON.stringify(p[k]), name+'.'+k+' survives the round trip verbatim');
    }
    expect(validateCorrectionProposal(rt).valid, name+': the round-tripped copy is still a §25-valid CorrectionProposal');
  }
});

// ============================================================================
// PHASE 3.14 — CHECKPOINT G: ARCHITECTURE TESTS (spec §52/§60)
// ============================================================================
// Static architecture scans of src-js/evaluation.js and src-js/critic.js,
// superseding the A-era raw scans (A-29/A-30/A-31 above, which are RETAINED as
// accepted-checkpoint evidence — the G suite AUGMENTS, not replaces) with the
// full comment/string-aware G-pattern suite. Precedents: tests/ai.test.mjs
// Checkpoint G (3.13, spec §26/§41-G) and scripts/probe-3.14-checkpointG-scan.mjs
// (pre-embedding validation: zero false positives on the clean modules, all
// positive controls fire — probe evidence scripts/phase3.14-evidence/3.14-G-probe.txt).
//
// WHY A COMMENT/STRING-STRIPPING CODE-BODY SCAN (honesty note): the modules
// legitimately CONTAIN forbidden words in prose — e.g. critic.js comments say
// "the tool registry" (:13) and "no tool supports semantic mutation" (:58).
// A raw word scan would false-positive on both; §52/§60 forbid REACHING these
// surfaces from CODE, not naming them in documentation. The stripper (verbatim
// 3.13 copy, tests/ai.test.mjs:1351) removes // and /* */ comments and the
// TEXT of '…' / "…" / `…` literals while preserving ${…} interpolation code,
// keeping character and line counts 1:1 with the source. G-7 proves it cannot
// over-strip (code tokens survive) or under-strip (the documented comment
// occurrences vanish; 1:1 char/line mapping).
//
// ALIAS-FORM DISCIPLINE (the 3.13 G KILL-2 gap discovery, here made permanent):
// capability words are scanned as BARE WORD-BOUNDARY patterns, not paren-call
// forms — `const x = eval; x(...)` is a capability reference the A-era paren
// scans (/\beval\s*\(/, /\bnew\s+Function\b/) structurally cannot see. G-2/G-5
// embed the contrast as a counted in-test control. Two words are scanned in
// call-form-only BY NECESSITY, documented here: `import(` (bare `import` is
// declaration syntax — pinned by the import contracts in G-1/G-4 — and the
// keyword cannot be aliased: `const x = import` is a SyntaxError) and `node:`
// (a module-specifier prefix that can only occur inside specifier strings,
// which are stripped; it is therefore scanned at the import-contract level on
// RAW import lines in G-1/G-4/G-8).
//
// DISCLOSED SUPERSETS of the literal §52/§60 scan lists (all zero-hit on the
// clean modules — probe-validated):
//   - capability words: globalThis / process / localStorage beside the literal
//     fs / fetch / window / document / eval / Function / require (dynamic-code
//     + environment escape hatches; mirrors the 3.13 G-3 disclosure);
//   - mutation-method surface: the full substrate vocabulary
//     (write|set|execute|commit|rollback|register|unregister|insert|remove|
//     update|delete|create|render|invalidate + .setX) beside the literal
//     Store.write / .set / .delete / Transaction.execute / Tool.execute /
//     History.write — `.set` is split from `.setX` so `.settle(` can never
//     match. Deliberate NON-denials (3.13 precedent): .get/.has/.list (reads),
//     .push (own-array growth) — the modules legitimately read stores through
//     the injected read surface and build plain-data results.
//   - the tool-execution surface scan (toolRegistry/TransactionExecutor/
//     TransactionBuilder/DSLExecutor/createCoreToolRegistry/ToolContext/
//     execute/commit) is applied to evaluation.js too (G-3), beside the
//     §52-critical critic.js scan (G-6) — both modules are read-only.
//
// SRC/CORE FREEZE (G-9): a 178-file recursive hash manifest (aggregate sha256
// 137327739471ff095325854c296a82aa84afde0258b396ad6902b22de3e21e56) generated
// from a git-clean src/core tree at Checkpoint-G GREEN time (probe evidence).
// The frozen files are NEVER modified for stub-kill purposes; the manifest
// aggregation's sensitivity is proven in-test on synthetic trees instead.
//
// STUB-KILL surface: src-js/evaluation.js and src-js/critic.js (per the §60
// directive), restored via sha256 after each kill. package.json (G-8) is
// killed as a disclosed bonus; src/core is not (frozen).
// ============================================================================

let gHarnessMemo = null;
function gHarness(){
  if (gHarnessMemo) return gHarnessMemo;
  // Verbatim copy of the 3.13 Checkpoint G stripper (tests/ai.test.mjs:1351):
  // comments and string/template TEXT are replaced by same-length whitespace
  // placeholders; interpolation code (${…}), the code body, and all newlines
  // survive 1:1. Validated pre-embedding by scripts/probe-3.14-checkpointG-scan.mjs.
  function stripCommentsAndStrings(src){
    let out = '';
    let mode = 'code'; // code | line | block | squote | dquote | template
    const frames = []; // template-literal interpolation stack: {braceDepth}
    const n = src.length;
    let i = 0;
    while (i < n){
      const c = src[i];
      const d = i + 1 < n ? src[i + 1] : '';
      if (mode === 'code'){
        if (c === '/' && d === '/'){ mode = 'line'; out += '  '; i += 2; continue; }
        if (c === '/' && d === '*'){ mode = 'block'; out += '  '; i += 2; continue; }
        if (c === "'"){ mode = 'squote'; out += ' '; i += 1; continue; }
        if (c === '"'){ mode = 'dquote'; out += ' '; i += 1; continue; }
        if (c === '`'){ mode = 'template'; out += ' '; i += 1; continue; }
        if (frames.length > 0){
          if (c === '{'){ frames[frames.length - 1].braceDepth += 1; }
          else if (c === '}'){
            const f = frames[frames.length - 1];
            if (f.braceDepth === 0){ frames.pop(); mode = 'template'; out += ' '; i += 1; continue; }
            f.braceDepth -= 1;
          }
        }
        out += c; i += 1; continue;
      }
      if (mode === 'line'){
        if (c === '\n'){ mode = 'code'; out += '\n'; } else { out += ' '; }
        i += 1; continue;
      }
      if (mode === 'block'){
        if (c === '*' && d === '/'){ mode = 'code'; out += '  '; i += 2; }
        else { out += (c === '\n' ? '\n' : ' '); i += 1; }
        continue;
      }
      // string modes: squote / dquote / template-literal text
      if (c === '\\'){ out += '  '; i += 2; continue; }
      if (mode === 'squote' && c === "'"){ mode = 'code'; out += ' '; i += 1; continue; }
      if (mode === 'dquote' && c === '"'){ mode = 'code'; out += ' '; i += 1; continue; }
      if (mode === 'template'){
        if (c === '`'){ mode = 'code'; out += ' '; i += 1; continue; }
        if (c === '$' && d === '{'){ frames.push({ braceDepth: 0 }); mode = 'code'; out += '  '; i += 2; continue; }
        out += (c === '\n' ? '\n' : ' '); i += 1; continue;
      }
      // squote / dquote regular content char: placeholder + advance.
      out += (c === '\n' ? '\n' : ' '); i += 1;
    }
    return out;
  }
  // 3.13 verbatim import-line helpers (tests/ai.test.mjs:1400-1410).
  function collectImportLines(src){
    return src.split('\n').filter(l => /^\s*import\b/.test(l) || /\brequire\s*\(/.test(l) || /\bimport\s*\(/.test(l));
  }
  function importSpecifiers(lines){
    const specs = [];
    for (const line of lines){
      const m = line.match(/from\s*['"]([^'"]+)['"]/) || line.match(/import\s+['"]([^'"]+)['"]/);
      if (m) specs.push(m[1]);
    }
    return specs;
  }
  const evalSrc = readFileSync(new URL('../src-js/evaluation.js', import.meta.url), 'utf-8');
  const criticSrc = readFileSync(new URL('../src-js/critic.js', import.meta.url), 'utf-8');
  const H = {
    evalSrc, criticSrc,
    evalStripped: stripCommentsAndStrings(evalSrc),
    criticStripped: stripCommentsAndStrings(criticSrc),
    // capability vocabulary (bare word-boundary form = alias-aware; see the
    // G header note for the two call-form-only words import( and node:)
    CAP_WORDS: ['window', 'document', 'fetch', 'eval', 'Function', 'globalThis', 'process', 'fs', 'localStorage', 'require'],
    // substrate mutation-method surface (`.set` split from `.setX` so
    // `.settle(` can never match — see the G header note)
    MUT1: /\.(write|set|execute|commit|rollback|register|unregister|insert|remove|update|delete|create|render|invalidate)\s*\(/g,
    MUT2: /\.set[A-Z]\w*\s*\(/g,
    // tool/transaction execution surface (bare execute/commit subsume the
    // .execute(/.commit( call forms — alias-aware)
    TOOL_WORDS: ['toolRegistry', 'ToolRegistry', 'TransactionExecutor', 'TransactionBuilder', 'DSLExecutor', 'createCoreToolRegistry', 'ToolContext', 'execute', 'commit'],
    wordHits(text, w){ return text.match(new RegExp('\\b' + w + '\\b', 'g')) || []; },
    callHits(text, re){ return text.match(new RegExp(re.source, 'g')) || []; },
    importSpecifiersOf(src){ return importSpecifiers(collectImportLines(src)); },
    pkg: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')),
    srcJsFiles(){ return readdirSync(new URL('../src-js/', import.meta.url)).filter(f => f.endsWith('.js')); },
    readSrcJs(f){ return readFileSync(new URL('../src-js/' + f, import.meta.url), 'utf-8'); },
    // path-sorted "relpath:sha256(content)" manifest -> aggregate sha256
    aggregateManifest(entries){
      const sorted = [...entries].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
      return sha256(sorted.map(([p, c]) => p + ':' + sha256(c)).join('\n'));
    },
    coreManifest(){
      const rootUrl = new URL('../src/core/', import.meta.url);
      const entries = [];
      (function walk(dirUrl, prefix){
        for (const e of readdirSync(dirUrl, { withFileTypes: true })){
          const rel = prefix ? prefix + '/' + e.name : e.name;
          if (e.isDirectory()) walk(new URL(e.name + '/', dirUrl), rel);
          else entries.push(['src/core/' + rel, readFileSync(new URL(e.name, dirUrl), 'utf-8')]);
        }
      })(rootUrl, '');
      return { count: entries.length, aggregate: H.aggregateManifest(entries), topEntries: readdirSync(rootUrl).sort() };
    }
  };
  gHarnessMemo = H;
  return H;
}

console.log('=== PHASE 3.14 Checkpoint G: Architecture Tests (spec §52/§60) ===');

test('G-1: evaluation.js forbidden-import surface — the import contract is exactly the two public pure-piece modules, every specifier relative (no fs, no node:, no bare npm), and the code body carries no dynamic module-escape call (§52/§60)', ()=>{
  const H=gHarness();
  const specs=H.importSpecifiersOf(H.evalSrc);
  for(const s of specs){
    expect(s.startsWith('./')||s.startsWith('../'), `evaluation.js import specifier '${s}' is non-relative — fs / node: builtins / bare npm specifiers are forbidden (§52/§60)`);
  }
  eq(JSON.stringify([...specs].sort()), JSON.stringify(['./bbox.js','./geometry.js']), 'the pinned two-module import contract (Checkpoint A; §51) — any added specifier (fs, node:*, npm) breaks it');
  const dyn=[...H.callHits(H.evalStripped, /\brequire\s*\(/g), ...H.callHits(H.evalStripped, /\bimport\s*\(/g)];
  eq(dyn.join(','), '', `no dynamic module-escape call in the evaluation.js code body (require( / import() — got ${JSON.stringify(dyn)})`);
});

test('G-2: evaluation.js code body reaches no browser/DOM global, no network, no dynamic-code or Node escape hatch — window, document, fetch, eval, Function, require, globalThis, process, fs, localStorage scanned on the comment/string-stripped body in ALIAS-FORM-AWARE word-boundary form (§52/§60)', ()=>{
  const H=gHarness();
  for(const w of H.CAP_WORDS){
    eq(H.wordHits(H.evalStripped, w).join(','), '', `evaluation.js code body must not reference ${w} (§52/§60)`);
  }
  // alias-form controls + the paren-scan contrast (the 3.13 G KILL-2 discovery,
  // here made a permanent counted regression guard).
  const alias='const evalAlias = eval; const fnAlias = Function; const fetchAlias = fetch; void evalAlias; void fnAlias; void fetchAlias;';
  const contrasts=[['eval', /\beval\s*\(/], ['fetch', /\bfetch\s*\(/], ['Function', /\bnew\s+Function\b/]];
  for(const [w, parenRe] of contrasts){
    eq(H.wordHits(alias, w).length, 1, `alias-form control: the word-boundary scan must catch the bare capability reference 'const x = ${w};'`);
    expect(!parenRe.test(alias), `contrast: the A-era paren-based form ${parenRe} cannot see the '${w}' alias — the G word scan can (3.13 G KILL-2)`);
  }
});

test('G-3: evaluation.js calls no substrate mutation method and reaches no tool/transaction execution surface — Store.write, .set, .delete, Transaction.execute, Tool.execute, History.write and the full disclosed mutation vocabulary are structurally absent from the stripped body (§52/§60: the only mutation path is Plan -> DSL -> Tool Registry -> Transaction -> Commit, never the evaluator)', ()=>{
  const H=gHarness();
  const mut=[...H.callHits(H.evalStripped, H.MUT1), ...H.callHits(H.evalStripped, H.MUT2)];
  eq(mut.join(','), '', `evaluation.js mutation-method calls are FORBIDDEN (§52/§60) — matched ${JSON.stringify(mut)}`);
  for(const w of H.TOOL_WORDS){
    eq(H.wordHits(H.evalStripped, w).join(','), '', `evaluation.js must not reference the tool/transaction execution surface (${w}) — disclosed superset: the §52 critic-only scan applied to the evaluator too`);
  }
});

test('G-4: critic.js forbidden-import surface — the import contract is exactly the evaluation contract module, every specifier relative (no fs, no node:, no bare npm), and the code body carries no dynamic module-escape call (§52/§60)', ()=>{
  const H=gHarness();
  const specs=H.importSpecifiersOf(H.criticSrc);
  for(const s of specs){
    expect(s.startsWith('./')||s.startsWith('../'), `critic.js import specifier '${s}' is non-relative — fs / node: builtins / bare npm specifiers are forbidden (§52/§60)`);
  }
  eq(JSON.stringify(specs), JSON.stringify(['./evaluation.js']), 'the pinned one-module import contract (Checkpoint C; F-3) — the Critic reads only the EvaluationResult contract');
  const dyn=[...H.callHits(H.criticStripped, /\brequire\s*\(/g), ...H.callHits(H.criticStripped, /\bimport\s*\(/g)];
  eq(dyn.join(','), '', `no dynamic module-escape call in the critic.js code body (require( / import() — got ${JSON.stringify(dyn)})`);
});

test('G-5: critic.js code body reaches no browser/DOM global, no network, no dynamic-code or Node escape hatch — the same alias-form-aware word-boundary surface as G-2 (§52/§60)', ()=>{
  const H=gHarness();
  for(const w of H.CAP_WORDS){
    eq(H.wordHits(H.criticStripped, w).join(','), '', `critic.js code body must not reference ${w} (§52/§60)`);
  }
  const alias='const evalAlias = eval; const fnAlias = Function; const fetchAlias = fetch; void evalAlias; void fnAlias; void fetchAlias;';
  const contrasts=[['eval', /\beval\s*\(/], ['fetch', /\bfetch\s*\(/], ['Function', /\bnew\s+Function\b/]];
  for(const [w, parenRe] of contrasts){
    eq(H.wordHits(alias, w).length, 1, `alias-form control: the word-boundary scan must catch the bare capability reference 'const x = ${w};'`);
    expect(!parenRe.test(alias), `contrast: the A-era paren-based form ${parenRe} cannot see the '${w}' alias — the G word scan can (3.13 G KILL-2)`);
  }
});

test('G-6: critic.js calls no substrate mutation method and statically carries NO tool execution surface — no toolRegistry, no TransactionExecutor/TransactionBuilder, no DSLExecutor, no createCoreToolRegistry, no execute/commit reference of any form (§52/§60: a proposal is data, never execution; the F-3 static scan upgraded to the comment/string-aware G pattern)', ()=>{
  const H=gHarness();
  const mut=[...H.callHits(H.criticStripped, H.MUT1), ...H.callHits(H.criticStripped, H.MUT2)];
  eq(mut.join(','), '', `critic.js mutation-method calls are FORBIDDEN (§52/§60) — matched ${JSON.stringify(mut)}`);
  for(const w of H.TOOL_WORDS){
    eq(H.wordHits(H.criticStripped, w).join(','), '', `critic.js must not reference ${w} (§52/§60 tool-execution surface)`);
  }
});

test('G-7: scan-harness sanity (anti-vacuity) — the stripper demonstrably preserves code AND removes comment/string occurrences on BOTH modules with 1:1 char/line mapping, so G-2..G-6 cannot pass vacuously (§60; the 3.13 G-6 precedent)', ()=>{
  const H=gHarness();
  // code survives stripping (an over-stripping scanner would make every pattern scan vacuously green)
  for(const t of ['buildActualState','createDeviation','evaluate','EVALUATION_TOLERANCES','rectBBox','bboxCenter']){
    expect(H.evalStripped.includes(t), `evaluation.js stripped body must still contain '${t}'`);
  }
  for(const t of ['proposeCorrections','createCorrectionProposal','evaluateAndCritique','validateCorrectionProposal']){
    expect(H.criticStripped.includes(t), `critic.js stripped body must still contain '${t}'`);
  }
  // the documented comment/string occurrences are gone from the code bodies
  // (REAL occurrences in the clean modules — the honesty-note examples above)
  expect(H.evalSrc.includes('EVALUATION DATA MODEL'), 'control is real: the phrase exists in RAW evaluation.js');
  expect(!H.evalStripped.includes('EVALUATION DATA MODEL'), 'evaluation.js header comment text must be stripped before scanning');
  expect(H.criticSrc.includes('no tool supports semantic mutation'), 'control is real: the phrase exists in RAW critic.js');
  expect(!H.criticStripped.includes('no tool supports semantic mutation'), 'critic.js comment text must be stripped before scanning');
  expect(H.wordHits(H.criticSrc, 'tool').length >= 2, 'control is real: RAW critic.js comments contain standalone tool words');
  eq(H.wordHits(H.criticStripped, 'tool').join(','), '', 'the stripped critic.js body contains NO standalone tool word — the G-6 scan cannot false-positive on comments');
  // 1:1 char/line mapping (placeholder-preserving stripper — line accounting stays exact)
  eq(H.evalStripped.length, H.evalSrc.length, 'evaluation.js: stripped output is char-count-identical to the source');
  eq(H.criticStripped.length, H.criticSrc.length, 'critic.js: stripped output is char-count-identical to the source');
  eq(H.evalStripped.split('\n').length, H.evalSrc.split('\n').length, 'evaluation.js: stripped output is line-count-identical to the source');
  eq(H.criticStripped.split('\n').length, H.criticSrc.split('\n').length, 'critic.js: stripped output is line-count-identical to the source');
});

test('G-8: zero npm dependencies — package.json declares no dependency fields and every src-js runtime module imports only relative specifiers (§52/§60 project rule; the 3.13 G-5 whole-tree sweep re-proven for the 3.14 modules)', ()=>{
  const H=gHarness();
  for(const field of ['dependencies','devDependencies','optionalDependencies','peerDependencies']){
    const v=H.pkg[field];
    expect(v===undefined || (typeof v==='object' && v!==null && Object.keys(v).length===0), `package.json .${field} must be absent/empty (zero npm dependencies, §52/§60) — got ${JSON.stringify(v)}`);
  }
  const files=H.srcJsFiles();
  for(const need of ['evaluation.js','critic.js','ai.js','tools.js','dsl.js']){
    expect(files.includes(need), `anti-vacuity: src-js/${need} present in the sweep (${files.length} files scanned)`);
  }
  for(const f of files){
    for(const s of H.importSpecifiersOf(H.readSrcJs(f))){
      expect(s.startsWith('./')||s.startsWith('../'), `src-js/${f} imports '${s}' — a non-relative (npm package / node builtin) specifier would add a dependency`);
    }
  }
});

test('G-9: src/core/ is FROZEN — the recursive 178-file hash manifest is byte-identical to the Checkpoint-G generation snapshot (generated from a git-clean tree); the manifest aggregation is proven deterministic and change-sensitive on synthetic input, and the frozen files themselves are never touched (§52/§60)', ()=>{
  const H=gHarness();
  const m=H.coreManifest();
  eq(m.count, 178, 'src/core file count matches the frozen snapshot');
  eq(m.aggregate, '137327739471ff095325854c296a82aa84afde0258b396ad6902b22de3e21e56', 'src/core aggregate manifest sha256 matches the frozen snapshot — any modification, addition, or deletion flips it');
  eq(JSON.stringify(m.topEntries), JSON.stringify(['README.md','appearance','constraints','dsl','errors','events','geometry','ids','interaction','math','renderer','scenegraph','semantic','stores','tools','transaction','validation']), 'the 17 top-level entries are unchanged');
  // sensitivity + order-stability controls (synthetic trees; the frozen tree is never modified)
  const t1=H.aggregateManifest([['a','x'],['b','y']]);
  const t2=H.aggregateManifest([['a','x'],['b','y']]);
  const t3=H.aggregateManifest([['a','x!'],['b','y']]);
  const t4=H.aggregateManifest([['b','y'],['a','x']]);
  eq(t1, t2, 'control: the manifest aggregation is deterministic');
  eq(t1, t4, 'control: the manifest aggregation is order-stable (path-sorted)');
  expect(t1!==t3, 'control: a one-byte content change flips the aggregate — the freeze check is sensitive');
});

Promise.all(pending).then(()=>{
  console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
  if(failed>0) process.exit(1);
});
