// ============================================================================
// PHASE 3.19 — PHASE G CONTRACT & SUBSTRATE CLEANUP TESTS
// (tests/phase3.19.test.mjs — Checkpoint C, spec §13 single-file rule)
// ============================================================================
// Harness protocol: identical to tests/semantic-correction.test.mjs (house
// runner, final "Tests: N total, M passed, F failed" line, exit 1 on failure).
//
// RED-FIRST DISCIPLINE (spec §46): the G-5/G-10 tests in this file were
// written and captured RED BEFORE the fixes landed in src-js/tools.js and
// src-js/dsl.js. RED capture: scripts/phase3.19-evidence/3.19-C-red.txt.
//
// SECTIONS (Checkpoint C — P0 correctness fixes):
//   G5  (2 tests) — T10 legacy sceneGraph-direct branch never returns a
//        fabricated dangling groupNodeId (false-success elimination):
//     G5-1  legacy branch constructs the group honestly (group node findable,
//           members reparented, root-level placement = workingCopy semantics)
//     G5-2  legacy branch failure arm is an HONEST failure (success:false with
//           structured errors), NEVER success:true carrying an id
//   G10 (2 tests) — DSL unknown-reference rollback never mutates stores
//           outside the substrate (dsl.js rollback catch-arm):
//     G10-1 no-substrate context: created objects RETAINED + honest
//           EXECUTION_FAILED record (the old fallback raw-deleted silently)
//     G10-2 standing-workingCopy substrate context: the rollback deletes
//           through workingCopy.deleteObject (the T04 substrate channel,
//           tools.js:302); the committed objectStore is NOT touched directly
//
// Later 3.19 checkpoints append their sections to THIS file only (spec §13).
// ============================================================================

import { createCoreToolRegistry } from '../src-js/tools.js';
import { GeometryStore, AppearanceStore, ObjectStore } from '../src-js/stores.js';
import { SceneGraph } from '../src-js/scenegraph.js';
import { SemanticStore } from '../src-js/semantic.js';
import { DSLExecutor, DSLErrorCodes } from '../src-js/dsl.js';
import { WorkingCopy, Journal } from '../src-js/transaction.js';
// Checkpoint D surfaces (P1 fixes) — appended below, pure insertion:
import { TransactionBuilder, TransactionExecutor, HistoryManager, EventBus, createTransformObjectCommand } from '../src-js/transaction.js';
import { buildActualState as p319BuildActualState, evaluate as p319LiveEvaluate, validateEvaluationResult as p319ValidateEval } from '../src-js/evaluation.js';
import { proposeCorrections as p319ProposeCorrections, validateCorrectionProposal as p319ValidateProposal } from '../src-js/critic.js';
import { createCorrectionTarget as p319Target, createCorrectionLoopPolicy as p319Policy, CorrectionEngine as p319Engine } from '../src-js/correction.js';

// --- house runner (verbatim 3.16/3.17/3.18 pattern) --------------------------
let total=0, passed=0, failed=0;
const pending=[];
function test(name, fn){ total++; try{ const r=fn(); if(r&&typeof r.then==='function'){ pending.push(r.then(()=>{passed++; console.log(`✓ ${name}`);}, e=>{failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);})); } else { passed++; console.log(`✓ ${name}`);} }catch(e){ failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }
function eq(a,b,msg){ if(a!==b) throw new Error(`${msg||'eq failed'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }

// --- fixtures ----------------------------------------------------------------
// Bare legacy document (NO workingCopy, NO transactionManager) — the same shape
// tests/dsl.test.mjs createDoc builds; tools execute via their legacy
// direct-store paths.
function makeDoc(){
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:()=>true, hasAppearance:()=>true});
  const sceneGraph=new SceneGraph();
  const semanticStore=new SemanticStore();
  return {geometryStore, appearanceStore, objectStore, sceneGraph, semanticStore};
}

// A registry wrapper that delegates everything to the real core registry
// EXCEPT T04, which throws — the G-10 RED injection that forces the dsl.js
// rollback catch-arm (with the conforming registry that arm is unreachable:
// executeViaSubstrate catches all transaction failures, tools.js:219-221).
function registryWithThrowingT04(){
  const real=createCoreToolRegistry();
  return {
    validate:(id,input,ctx)=>real.validate(id,input,ctx),
    execute:(id,input,ctx)=>{
      if(id==='T04') throw new Error('T04 forced failure (G-10 stub)');
      return real.execute(id,input,ctx);
    }
  };
}

// Two real rect objects created through the live T01 legacy path.
function seedTwoObjects(doc){
  const registry=createCoreToolRegistry();
  const r1=registry.execute('T01', {width:10, height:10}, doc);
  const r2=registry.execute('T01', {width:20, height:20}, doc);
  if(!r1.success || !r2.success) throw new Error('fixture seeding failed');
  return [r1.output.objectId, r2.output.objectId];
}

// The raw-IR executor pattern from the house suite (tests/dsl.test.mjs:581-586):
// targets:['C'] is never defined in the execution environment, so the runtime
// UNKNOWN_REFERENCE rollback branch fires over the created object ids.
const ROLLBACK_IR=(w1,h1,w2,h2)=>[
  {toolId:'T01', input:{x:0,y:0,width:w1,height:h1,rx:0,ry:0}, sourceInstructionIndex:0, sourceRef:'A', category:'mutation'},
  {toolId:'T01', input:{x:0,y:0,width:w2,height:h2,rx:0,ry:0}, sourceInstructionIndex:1, sourceRef:'B', category:'mutation'},
  {toolId:'T05', input:{objectIds:[], delta:{x:10,y:0}}, sourceInstructionIndex:2, targets:['C'], category:'mutation'}
];

// --- Section G5: T10 legacy fabricated-success elimination (G-5, P0) ----------

test('G5-1: T10 legacy sceneGraph-direct branch constructs the group honestly — the returned groupNodeId resolves to a real node and the members are reparented (G-5)', ()=>{
  const doc=makeDoc();
  const [oid1, oid2]=seedTwoObjects(doc);
  const registry=createCoreToolRegistry();
  const result=registry.execute('T10', {objectIds:[oid1, oid2]}, doc);
  expect(result.success, `T10 legacy grouping must succeed: ${JSON.stringify(result.errors)}`);
  const groupNode=doc.sceneGraph.findNode(result.output.groupNodeId);
  expect(groupNode, 'G-5 RED: a success:true groupNodeId must resolve to a real scene node — the legacy branch returned a FABRICATED dangling id (not findable via sceneGraph.findNode)');
  expect(groupNode.objectRef===null, 'the returned node is a hierarchy node (objectRef null), not an object node');
  eq(doc.sceneGraph.findNodeByObjectId(oid1).parent, result.output.groupNodeId, 'member 1 reparented under the group');
  eq(doc.sceneGraph.findNodeByObjectId(oid2).parent, result.output.groupNodeId, 'member 2 reparented under the group');
  eq(groupNode.parent, null, 'the group is root-level, matching the workingCopy branch semantics (groupNode.parentId:null, tools.js:494)');
  doc.sceneGraph.validateInvariants();
});

test('G5-2: T10 legacy branch failure arm is an HONEST failure — when group construction throws, the result is success:false with structured errors, NEVER success:true carrying an id (G-5)', ()=>{
  const doc=makeDoc();
  const [oid1, oid2]=seedTwoObjects(doc);
  const registry=createCoreToolRegistry();
  const throwingSG=Object.create(doc.sceneGraph);
  throwingSG.createGroup=()=>{ throw new Error('SCENE_PARENT_NOT_FOUND: forced by G5-2'); };
  const result=registry.execute('T10', {objectIds:[oid1, oid2]}, {...doc, sceneGraph: throwingSG});
  expect(result.success===false, 'G-5 RED: the legacy failure arm returned success:true with a fabricated dangling groupNodeId — an honest failure is required');
  expect(Array.isArray(result.errors) && result.errors.length>0, 'the honest failure carries structured errors');
  expect(!(result.output && result.output.groupNodeId), 'no groupNodeId may be emitted on the failure path');
});

// --- Section G10: DSL rollback substrate-bypass elimination (G-10, P1) --------

test('G10-1: no-substrate context — when T04 throws, the DSL rollback RETAINS the created objects and records an honest EXECUTION_FAILED error; no silent out-of-substrate store mutation (G-10)', async ()=>{
  const doc=makeDoc();
  const registry=registryWithThrowingT04();
  const executor=new DSLExecutor();
  const result=await executor.execute(ROLLBACK_IR(100,100,50,50), {toolRegistry: registry, documentContext: doc});
  expect(result.success===false, 'the unknown reference must fail the program');
  expect(result.errors.some(e=>e.code===DSLErrorCodes.UNKNOWN_REFERENCE), 'the UNKNOWN_REFERENCE error is recorded');
  const oidA=result.outputs[0] && result.outputs[0].output && result.outputs[0].output.objectId;
  const oidB=result.outputs[1] && result.outputs[1].output && result.outputs[1].output.objectId;
  expect(oidA && oidB, 'fixture: both creates produced object ids before the failure');
  expect(doc.objectStore.has(oidA), 'G-10 RED: created object A must be RETAINED when no substrate channel is available — the legacy fallback raw-deleted it silently from objectStore outside the substrate');
  expect(doc.objectStore.has(oidB), 'G-10 RED: created object B retained likewise');
  expect(result.errors.some(e=>e.code===DSLErrorCodes.EXECUTION_FAILED && /Rollback incomplete/.test(e.message) && e.context && e.context.objectId===oidA), 'the incomplete rollback is recorded honestly for object A');
  expect(result.errors.some(e=>e.code===DSLErrorCodes.EXECUTION_FAILED && /Rollback incomplete/.test(e.message) && e.context && e.context.objectId===oidB), 'the incomplete rollback is recorded honestly for object B');
});

test('G10-2: standing-workingCopy substrate context — when T04 throws, the rollback deletes through workingCopy.deleteObject (the T04 substrate channel, tools.js:302) and the committed objectStore is NOT directly mutated (G-10)', async ()=>{
  const doc=makeDoc();
  const [oidA, oidB]=seedTwoObjects(doc);
  const journal=new Journal();
  const wc=new WorkingCopy(journal);
  wc.loadObject(oidA, doc.objectStore.get(oidA));
  wc.loadObject(oidB, doc.objectStore.get(oidB));
  const seeded=[oidA, oidB];
  const real=createCoreToolRegistry();
  const registry={
    validate:(id,input,ctx)=>real.validate(id,input,ctx),
    execute:(id,input,ctx)=>{
      if(id==='T04') throw new Error('T04 forced failure (G-10 stub)');
      if(id==='T01') return {success:true, output:{objectId: seeded.shift()}};
      return real.execute(id,input,ctx);
    }
  };
  const docContext={...doc, workingCopy: wc};
  const result=await new DSLExecutor().execute(ROLLBACK_IR(100,100,50,50), {toolRegistry: registry, documentContext: docContext});
  expect(result.success===false, 'the unknown reference must fail the program');
  expect(result.errors.some(e=>e.code===DSLErrorCodes.UNKNOWN_REFERENCE), 'the UNKNOWN_REFERENCE error is recorded');
  expect(doc.objectStore.has(oidA), 'G-10 RED: the committed objectStore must NOT be mutated directly — the legacy fallback raw-deleted oidA from the committed store outside the substrate');
  expect(doc.objectStore.has(oidB), 'G-10 RED: the committed objectStore keeps oidB likewise');
  eq(wc.hasObject(oidA), false, 'the standing workingCopy no longer holds oidA (the deletion was routed through the substrate channel)');
  expect(wc.getDeletedObjects().has(oidA), 'the workingCopy deletion journal records oidA');
  eq(wc.hasObject(oidB), false, 'the standing workingCopy no longer holds oidB');
  expect(wc.getDeletedObjects().has(oidB), 'the workingCopy deletion journal records oidB');
});

// ============================================================================
// C1 APPENDIX (Checkpoint C1 — Micro-Fixes + S-D-8 Re-Pin; pure insertion,
// append-only per spec §13 — the Checkpoint C tests above are byte-identical
// to the approved C state). RED captured BEFORE the C1 fixes:
// scripts/phase3.19-evidence/3.19-C1-red.txt (this file: 4 passed, 5 failed —
// the 5 C1 tests below) and 3.19-C1-red-sd8.txt (semantic-inference 96/97,
// the S-D-8 re-pin RED).
//
// SECTIONS (Checkpoint C1 — acceptor-ruled same-class siblings):
//   G5  (1 test)  — T10 TERMINAL fallback arm (context with NEITHER
//         workingCopy NOR sceneGraph) is an HONEST failure; the arm still
//         returned a fabricated success:true dangling groupNodeId (same
//         false-success class as G-5, ruled FIX in C1):
//     G5-3  terminal arm fails honestly with TOOL_PRECONDITION_FAILED,
//           no groupNodeId emitted on any path
//   G10 (4 tests) — the two SIBLING DSL rollback arms (tool-failed arm and
//         exception arm) still carried the raw objectStore.delete(oid)
//         substrate bypass the G-10 fix removed from the unknown-reference
//         arm; ruled FIX in C1 (same substrate-bypass class):
//     G10-3 tool-failed arm, no-substrate context: created objects RETAINED
//           + honest EXECUTION_FAILED 'Rollback incomplete' records
//     G10-4 tool-failed arm, standing-workingCopy context: deletion routed
//           through workingCopy.deleteObject; committed store NOT touched
//     G10-5 exception arm, no-substrate context: same RETAIN + honest record
//     G10-6 exception arm, standing-workingCopy context: same substrate
//           routing
// ============================================================================

// --- Section G5 (C1): T10 terminal fallback honest failure --------------------

test('G5-3: T10 terminal fallback arm (context with NEITHER workingCopy NOR sceneGraph) is an HONEST failure — no fabricated success:true groupNodeId under any path (G-5 terminal arm, C1)', ()=>{
  const registry=createCoreToolRegistry();
  // Bare context: no workingCopy, no sceneGraph, no transactionManager — the
  // registry dispatches the legacy direct path (tools.js:1056-1057), landing
  // in T10's terminal fallback arm (tools.js:522-523 pre-fix). The objectIds
  // pass T10 validate (array >= 2, no UUID precondition) and are never
  // dereferenced on this path.
  const result=registry.execute('T10', {objectIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']}, {});
  expect(result.success===false, 'G-5 terminal RED: the terminal fallback returned success:true with a FABRICATED dangling groupNodeId — an honest failure is required');
  expect(Array.isArray(result.errors) && result.errors.length>0, 'the honest failure carries structured errors');
  expect(result.errors.some(e=>e.code==='TOOL_PRECONDITION_FAILED'), 'the failure code is TOOL_PRECONDITION_FAILED');
  expect(!(result.output && result.output.groupNodeId), 'no groupNodeId may be emitted on the failure path');
  eq(result.toolId, 'T10', 'the honest failure names the tool');
});

// --- Section G10 (C1): sibling rollback arms substrate-bypass elimination -----

// C1 injection: the executing tool (T05) fails or throws to force the
// tool-failed / exception arms, and T04 ALSO fails (throws) so the legacy raw
// objectStore.delete fallback fires (with a conforming registry the rollback
// T04 succeeds and the fallback arms stay unreachable — see the G-10 note,
// phase3.19.test.mjs:57-60).
function c1StubRegistry({mode, seed}){
  const real=createCoreToolRegistry();
  const seeded=seed ? [...seed] : null;
  return {
    validate:(id,input,ctx)=>real.validate(id,input,ctx),
    execute:(id,input,ctx)=>{
      if(id==='T05'){
        if(mode==='throw') throw new Error('T05 forced exception (C1 stub)');
        return {success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:'T05 forced failure (C1 stub)'}]};
      }
      if(id==='T04') throw new Error('T04 forced failure (C1 stub)');
      if(id==='T01' && seeded) return {success:true, output:{objectId: seeded.shift()}};
      return real.execute(id,input,ctx);
    }
  };
}

// C1 IR variant: the final instruction carries NO targets, so the tool itself
// executes and fails — forcing the tool-failed / exception arms (Checkpoint
// C's ROLLBACK_IR has targets:['C'], which always fires the unknown-reference
// arm instead).
const TOOL_FAILED_IR=(w1,h1,w2,h2)=>[
  {toolId:'T01', input:{x:0,y:0,width:w1,height:h1,rx:0,ry:0}, sourceInstructionIndex:0, sourceRef:'A', category:'mutation'},
  {toolId:'T01', input:{x:0,y:0,width:w2,height:h2,rx:0,ry:0}, sourceInstructionIndex:1, sourceRef:'B', category:'mutation'},
  {toolId:'T05', input:{objectIds:['99999999-9999-4999-8999-999999999999'], delta:{x:10,y:0}}, sourceInstructionIndex:2, category:'mutation'}
];

test('G10-3: tool-failed arm, no-substrate context — when the executing tool fails and T04 also fails, the rollback RETAINS the created objects and records honest EXECUTION_FAILED errors; no silent out-of-substrate store mutation (G-10 sibling, C1)', async ()=>{
  const doc=makeDoc();
  const registry=c1StubRegistry({mode:'fail'});
  const result=await new DSLExecutor().execute(TOOL_FAILED_IR(100,100,50,50), {toolRegistry: registry, documentContext: doc});
  expect(result.success===false, 'the tool failure must fail the program');
  expect(result.errors.some(e=>e.code===DSLErrorCodes.EXECUTION_FAILED && /Tool T05 failed/.test(e.message)), 'the tool-failed arm fired (the T05 failure is recorded)');
  const oidA=result.outputs[0] && result.outputs[0].output && result.outputs[0].output.objectId;
  const oidB=result.outputs[1] && result.outputs[1].output && result.outputs[1].output.objectId;
  expect(oidA && oidB, 'fixture: both creates produced object ids before the failure');
  expect(doc.objectStore.has(oidA), 'G-10 sibling RED: created object A must be RETAINED — the legacy tool-failed arm raw-deleted it from objectStore outside the substrate after T04 failed');
  expect(doc.objectStore.has(oidB), 'G-10 sibling RED: created object B retained likewise');
  expect(result.errors.some(e=>e.code===DSLErrorCodes.EXECUTION_FAILED && /Rollback incomplete/.test(e.message) && e.context && e.context.objectId===oidA), 'the incomplete rollback is recorded honestly for object A');
  expect(result.errors.some(e=>e.code===DSLErrorCodes.EXECUTION_FAILED && /Rollback incomplete/.test(e.message) && e.context && e.context.objectId===oidB), 'the incomplete rollback is recorded honestly for object B');
});

test('G10-4: tool-failed arm, standing-workingCopy substrate context — the rollback deletes through workingCopy.deleteObject (the T04 substrate channel, tools.js:302) and the committed objectStore is NOT directly mutated (G-10 sibling, C1)', async ()=>{
  const doc=makeDoc();
  const [oidA, oidB]=seedTwoObjects(doc);
  const wc=new WorkingCopy(new Journal());
  wc.loadObject(oidA, doc.objectStore.get(oidA));
  wc.loadObject(oidB, doc.objectStore.get(oidB));
  const registry=c1StubRegistry({mode:'fail', seed:[oidA, oidB]});
  const result=await new DSLExecutor().execute(TOOL_FAILED_IR(100,100,50,50), {toolRegistry: registry, documentContext: {...doc, workingCopy: wc}});
  expect(result.success===false, 'the tool failure must fail the program');
  expect(result.errors.some(e=>e.code===DSLErrorCodes.EXECUTION_FAILED && /Tool T05 failed/.test(e.message)), 'the tool-failed arm fired');
  expect(doc.objectStore.has(oidA), 'G-10 sibling RED: the committed objectStore must NOT be mutated directly — the legacy arm raw-deleted oidA from the committed store outside the substrate');
  expect(doc.objectStore.has(oidB), 'G-10 sibling RED: the committed objectStore keeps oidB likewise');
  eq(wc.hasObject(oidA), false, 'the standing workingCopy no longer holds oidA (the deletion was routed through the substrate channel)');
  expect(wc.getDeletedObjects().has(oidA), 'the workingCopy deletion journal records oidA');
  eq(wc.hasObject(oidB), false, 'the standing workingCopy no longer holds oidB');
  expect(wc.getDeletedObjects().has(oidB), 'the workingCopy deletion journal records oidB');
});

test('G10-5: exception arm, no-substrate context — when the executing tool throws and T04 also fails, the rollback RETAINS the created objects and records honest EXECUTION_FAILED errors; no silent out-of-substrate store mutation (G-10 sibling, C1)', async ()=>{
  const doc=makeDoc();
  const registry=c1StubRegistry({mode:'throw'});
  const result=await new DSLExecutor().execute(TOOL_FAILED_IR(100,100,50,50), {toolRegistry: registry, documentContext: doc});
  expect(result.success===false, 'the tool exception must fail the program');
  expect(result.errors.some(e=>e.code===DSLErrorCodes.EXECUTION_FAILED && /Exception executing tool T05/.test(e.message)), 'the exception arm fired (the T05 exception is recorded)');
  const oidA=result.outputs[0] && result.outputs[0].output && result.outputs[0].output.objectId;
  const oidB=result.outputs[1] && result.outputs[1].output && result.outputs[1].output.objectId;
  expect(oidA && oidB, 'fixture: both creates produced object ids before the failure');
  expect(doc.objectStore.has(oidA), 'G-10 sibling RED: created object A must be RETAINED — the legacy exception arm raw-deleted it from objectStore outside the substrate after T04 failed');
  expect(doc.objectStore.has(oidB), 'G-10 sibling RED: created object B retained likewise');
  expect(result.errors.some(e=>e.code===DSLErrorCodes.EXECUTION_FAILED && /Rollback incomplete/.test(e.message) && e.context && e.context.objectId===oidA), 'the incomplete rollback is recorded honestly for object A');
  expect(result.errors.some(e=>e.code===DSLErrorCodes.EXECUTION_FAILED && /Rollback incomplete/.test(e.message) && e.context && e.context.objectId===oidB), 'the incomplete rollback is recorded honestly for object B');
});

test('G10-6: exception arm, standing-workingCopy substrate context — the rollback deletes through workingCopy.deleteObject (the T04 substrate channel, tools.js:302) and the committed objectStore is NOT directly mutated (G-10 sibling, C1)', async ()=>{
  const doc=makeDoc();
  const [oidA, oidB]=seedTwoObjects(doc);
  const wc=new WorkingCopy(new Journal());
  wc.loadObject(oidA, doc.objectStore.get(oidA));
  wc.loadObject(oidB, doc.objectStore.get(oidB));
  const registry=c1StubRegistry({mode:'throw', seed:[oidA, oidB]});
  const result=await new DSLExecutor().execute(TOOL_FAILED_IR(100,100,50,50), {toolRegistry: registry, documentContext: {...doc, workingCopy: wc}});
  expect(result.success===false, 'the tool exception must fail the program');
  expect(result.errors.some(e=>e.code===DSLErrorCodes.EXECUTION_FAILED && /Exception executing tool T05/.test(e.message)), 'the exception arm fired');
  expect(doc.objectStore.has(oidA), 'G-10 sibling RED: the committed objectStore must NOT be mutated directly — the legacy arm raw-deleted oidA from the committed store outside the substrate');
  expect(doc.objectStore.has(oidB), 'G-10 sibling RED: the committed objectStore keeps oidB likewise');
  eq(wc.hasObject(oidA), false, 'the standing workingCopy no longer holds oidA (the deletion was routed through the substrate channel)');
  expect(wc.getDeletedObjects().has(oidA), 'the workingCopy deletion journal records oidA');
  eq(wc.hasObject(oidB), false, 'the standing workingCopy no longer holds oidB');
  expect(wc.getDeletedObjects().has(oidB), 'the workingCopy deletion journal records oidB');
});

// ============================================================================
// D APPENDIX (Checkpoint D — P1 Fixes: G-6 + G-19 + G-18 + G-17; pure
// insertion, append-only per spec §13 — the C and C1 tests above are
// byte-identical to the approved states). RED captured BEFORE the D fixes:
// scripts/phase3.19-evidence/3.19-D-red.txt.
//
// SECTIONS (Checkpoint D):
//   G6  (2 tests) — createTransformObjectCommand is REAL (G-6): applies the
//         affine Matrix3x3 to the geometry through the substrate and declares
//         the exact inverse-transform command (the latent no-op is gone):
//     G6-1  a real translate matrix moves the rect; size preserved
//     G6-2  getInverse() round-trip restores the geometry byte-exactly
//   G19 (3 tests) — worst-offender selection (G-19, B-approved policy): the
//         compliance arm evaluates ALL participants and emits the max-error
//         one (tie-break = lowest index); deviation shape unchanged:
//     G19-1 the deviation names the WORST offender, not the first-found one
//     G19-2 single-violator behavior unchanged (regression guard)
//     G19-3 SATISFIED path unchanged (regression guard)
//   G18 (3 tests) — size-class critic arm (G-18): equalWidth/equalHeight
//         deviations propose a scale intent (the scale-to-target-size recipe
//         path into T06); the T06 size.* derivation rule makes the agenda
//         executable; the honest-decline posture survives for armless classes:
//     G18-1 the critic proposes ONE 7-key scale intent on the worst offender
//     G18-2 the size-class agenda closes the loop VERIFIED (re-eval SATISFIED)
//     G18-3 armless classes (fixedDistance) still decline honestly (guard)
//   G17 (2 tests) — T11 id translation (G-17): the dissolve-group attempt
//         resolves object ids to the owning group node via the scene graph;
//         no owning group declines honestly (E-7 semantics preserved):
//     G17-1 the translated ungroup SUCCEEDS (group removed, members
//           reparented, world transforms preserved)
//     G17-2 no owning group -> honest FAILED attempt, no scene mutation (guard)
// ============================================================================

// --- Checkpoint D fixtures ----------------------------------------------------

const P319_TOL = 1e-9;
const PD_A = 'd1111111-1111-4111-8111-111111111111';
const PD_B = 'd2222222-2222-4222-8222-222222222222';
const PD_C = 'd3333333-3333-4333-8333-333333333333';

// The all-null ExpectedState (the accepted-constraints-are-the-expectation
// shape; verbatim from the house 3.16 fixture discipline).
const P319_NULL_EXPECTED = Object.freeze({
  intentId: 'constraint-agenda', status: 'requested',
  geometry: { width: null, height: null, rx: null, ry: null, area: null, symmetric: null },
  spatial: { aligned: null, centered: null, bbox: null },
  appearance: { fill: null, stroke: null, opacity: null },
  constraint: { satisfied: null },
  structure: { grouped: null }
});

// Real-substrate document fixture (house mDoc discipline): direct store
// creation, real SceneGraph, real buildActualState — never hand-waved shapes.
function p319Doc(specs){
  const geometryStore=new GeometryStore(), appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:id=>geometryStore.has(id), hasAppearance:id=>appearanceStore.has(id)});
  const sceneGraph=new SceneGraph(), eventBus=new EventBus(), historyManager=new HistoryManager();
  const transactionManager=new TransactionExecutor({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus, historyManager);
  const registry=createCoreToolRegistry();
  const transactionBuilder=new TransactionBuilder();
  const geomIdOf=(id)=>'b'+id.slice(1);
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
  return { objectStore, geometryStore, appearanceStore, sceneGraph, eventBus, historyManager, transactionManager, registry, transactionBuilder,
    docContext, evaluationContext, geomIdOf, appIdOf,
    geomParamsOf:(id)=>geometryStore.get(objectStore.get(id).geometryRef).params,
    substrate: { registry, transactionManager, transactionBuilder, sceneGraph } };
}

// The LIVE evaluation path with the accepted regime riding in the
// ExpectedState's constraint.satisfied request (house jEvaluate discipline).
function p319Evaluate(doc, constraints, tolerance){
  const expected={ ...P319_NULL_EXPECTED, constraint:{ satisfied:{ records: constraints, tolerance: tolerance===undefined ? P319_TOL : tolerance } } };
  return p319LiveEvaluate(expected, doc.docContext, doc.evaluationContext);
}

// House constraint record builder (canonical shape).
function p319Constraint(type, objectIds, opts={}){
  return { id: opts.id || ('c-fix-'+type), type, objectIds: [...objectIds], enabled: opts.enabled!==false,
    strength: opts.strength || 'strong', source: 'ai', parameters: opts.parameters || {},
    provenance: { t19Type: 'x', inferredBy: 'T19' } };
}

// Deep equality over the JSON projection (the house deepEq, local to the D appendix).
function deepEq(a,b,msg){ const x=JSON.stringify(a), y=JSON.stringify(b); if(x!==y) throw new Error(`${msg||'deepEq failed'}: ${x} !== ${y}`); }

// --- Section G6: createTransformObjectCommand is REAL (G-6, P1) ----------------

test('G6-1: createTransformObjectCommand applies the affine matrix to the geometry through the substrate — a real translate moves the rect and preserves its size (G-6)', ()=>{
  const doc=makeDoc();
  const [oid]=seedTwoObjects(doc);
  const executor=new TransactionExecutor({objectStore: doc.objectStore, geometryStore: doc.geometryStore, appearanceStore: doc.appearanceStore, sceneGraph: doc.sceneGraph}, new EventBus(), new HistoryManager());
  const geomId=doc.objectStore.get(oid).geometryRef;
  const before=JSON.stringify(doc.geometryStore.get(geomId).params);
  const cmd=createTransformObjectCommand({objectId: oid, transform:{a:1,b:0,c:0,d:1,tx:25,ty:15}});
  const tx=new TransactionBuilder().begin({source:'fixture'}).addCommand(cmd).build();
  executor.execute(tx);
  const params=doc.geometryStore.get(geomId).params;
  expect(params.x===25 && params.y===15, `G-6 RED: the transform input was never applied — the latent no-op wrote back an identical shallow copy (params still ${JSON.stringify(params)})`);
  eq(params.width, 10, 'translate preserves width');
  eq(params.height, 10, 'translate preserves height');
  expect(JSON.stringify(params)!==before, 'the geometry actually changed');
});

test('G6-2: createTransformObjectCommand.getInverse() round-trips — apply the transform, apply the declared inverse, the geometry is restored byte-exactly (G-6)', ()=>{
  const doc=makeDoc();
  const [oid]=seedTwoObjects(doc);
  const executor=new TransactionExecutor({objectStore: doc.objectStore, geometryStore: doc.geometryStore, appearanceStore: doc.appearanceStore, sceneGraph: doc.sceneGraph}, new EventBus(), new HistoryManager());
  const geomId=doc.objectStore.get(oid).geometryRef;
  const original=JSON.stringify(doc.geometryStore.get(geomId).params);
  const cmd=createTransformObjectCommand({objectId: oid, transform:{a:1,b:0,c:0,d:1,tx:25,ty:15}});
  executor.execute(new TransactionBuilder().begin({source:'fixture'}).addCommand(cmd).build());
  expect(typeof cmd.getInverse==='function', 'G-6 RED: createTransformObjectCommand declares NO getInverse — the latent no-op had no inverse');
  const inv=cmd.getInverse();
  expect(inv, 'the executed command declares an inverse command');
  eq(JSON.stringify(inv.input.transform), JSON.stringify({a:1,b:0,c:0,d:1,tx:-25,ty:-15}), 'the inverse is the exact matrix inverse');
  executor.execute(new TransactionBuilder().begin({source:'fixture'}).addCommand(inv).build());
  eq(JSON.stringify(doc.geometryStore.get(geomId).params), original, 'the round-trip restores the geometry byte-exactly');
});

// --- Section G19: worst-offender selection (G-19, P1) --------------------------

test('G19-1: worst-offender selection — the emitted deviation names the MAX-error participant, not the first-found one; exactly one deviation per constraint record, shape unchanged (G-19)', ()=>{
  const doc=p319Doc([
    {id:PD_A, x:100, y:100, width:80, height:60},
    {id:PD_B, x:100, y:200, width:84, height:60},
    {id:PD_C, x:100, y:300, width:95, height:60}]);
  const result=p319Evaluate(doc, [p319Constraint('equalWidth',[PD_A,PD_B,PD_C])]);
  eq(result.status, 'DEVIATION', 'the fixture violates');
  eq(result.deviations.length, 1, 'one deviation per constraint record (the record shape is unchanged by G-19)');
  const d=result.deviations[0];
  eq(d.property, 'size.width', 'the pinned size-class vocabulary');
  eq(d.objectId, PD_C, 'G-19 RED: the deviation must name the WORST offender (PD_C, error 15) — the legacy loop broke at the FIRST violator (PD_B, error 4)');
  eq(d.actual, 95, 'the worst-offender magnitude');
  eq(d.expected, 80, 'the reference quantity (unchanged)');
  eq(d.delta, 15, 'actual - expected for the worst offender');
  eq(result.metadata.constraintDeviations.length, 1, 'the provenance follows the single emitted deviation');
});

test('G19-2: single-violator constraint is unchanged — one deviation naming the only violator with the same expected/actual/delta contract (G-19 regression guard)', ()=>{
  const doc=p319Doc([
    {id:PD_A, x:100, y:100, width:80, height:60},
    {id:PD_B, x:100, y:200, width:130, height:60}]);
  const result=p319Evaluate(doc, [p319Constraint('equalWidth',[PD_A,PD_B])]);
  eq(result.status, 'DEVIATION', 'the fixture violates');
  eq(result.deviations.length, 1, 'one deviation');
  const d=result.deviations[0];
  eq(d.objectId, PD_B, 'the only violator');
  eq(d.expected, 80, 'the reference width');
  eq(d.actual, 130, 'the violator width');
  eq(d.delta, 50, 'the delta contract');
});

test('G19-3: SATISFIED path unchanged — a satisfied constraint emits zero deviations and a SATISFIED result (G-19 regression guard)', ()=>{
  const doc=p319Doc([
    {id:PD_A, x:100, y:100, width:80, height:60},
    {id:PD_B, x:100, y:200, width:80, height:60}]);
  const result=p319Evaluate(doc, [p319Constraint('equalWidth',[PD_A,PD_B])]);
  eq(result.status, 'PASS', 'satisfied');
  eq(result.deviations.length, 0, 'no deviations');
  eq(result.metadata.constraintResults[0].status, 'SATISFIED', 'the SATISFIED verdict is unchanged');
});

// --- Section G18: size-class critic arm (G-18, P1) -----------------------------

test('G18-1: size-class critic arm — an equalWidth violation proposes ONE 7-key scale intent on the worst-offender participant with factor = expected/actual (G-18)', ()=>{
  const doc=p319Doc([
    {id:PD_A, x:100, y:100, width:80, height:60},
    {id:PD_B, x:100, y:200, width:120, height:60}]);
  const result=p319Evaluate(doc, [p319Constraint('equalWidth',[PD_A,PD_B],{id:'c-eqw'})]);
  eq(result.status, 'DEVIATION', 'the fixture violates');
  const out=p319ProposeCorrections(result);
  eq(out.length, 1, 'G-18 RED: the size-class arm must propose ONE scale intent — the legacy posture declined silently (no proposal)');
  const p=out[0];
  deepEq(Object.keys(p).sort(), ['confidence','deviationId','id','intent','priority','reason','targetRef'], 'the 7-key contract');
  eq(p319ValidateProposal(p).valid, true, 'validates through the LIVE §25 validator');
  deepEq(p.intent, { type:'transform', targets:[PD_B], operation:'scale', params:{ sx: 80/120, sy: 1 } }, 'the scale intent targets the worst-offender participant with the deterministic factor');
  eq(p.deviationId, result.deviations[0].id, 'the deviation binding');
  eq(p.targetRef, '$doc:'+PD_B, 'the targetRef grammar');
  eq(p.confidence, 1, 'the rule-derived confidence');
  eq(p.priority, 0, 'the deviation-order priority');
});

test('G18-2: the size-class agenda closes the loop — the scale-to-target-size plan derives the T06 transform, executes through the substrate, and the re-evaluation is SATISFIED (G-18)', ()=>{
  const fx=p319Doc([
    {id:PD_A, x:100, y:100, width:80, height:60},
    {id:PD_B, x:100, y:200, width:120, height:60}]);
  const constraints=[p319Constraint('equalWidth',[PD_A,PD_B],{id:'c-eqw'})];
  const calls=[];
  const critic={ evaluate(document, context){ calls.push({document, context});
    const expected={ ...P319_NULL_EXPECTED, constraint:{ satisfied:{ records: constraints, tolerance: P319_TOL } } };
    const result=p319LiveEvaluate(expected, document, context);
    eq(p319ValidateEval(result).valid, true, 'a valid LIVE §12 EvaluationResult');
    return result; } };
  const target=p319Target({ category:'SIZE', objectIds:[PD_B], metric:'size.width',
    observedValue:120, targetValue:80, severity:'HIGH', confidence:0.9,
    evidence:[{ type:'CONSTRAINT', source:'phase3.19', constraintId:'c-eqw', objectIds:[PD_A,PD_B], value:120 }] });
  const request={ rootIntentId:'intent-g18', rootTransactionId:'tx-root-g18', targets:[target],
    policy:p319Policy({ maxIterations: 5 }), mode:'AUTO', critic, document:fx.docContext,
    evaluationContext:fx.evaluationContext, substrate:fx.substrate };
  const done=p319Engine.run(p319Engine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'VERIFIED', 'G-18 RED: the size-class agenda must close the loop — the legacy posture refused the plan (T06 rule-less, INSUFFICIENT_EVIDENCE) and terminated UNFIXABLE');
  eq(done.executedAttempts, 1, 'exactly one executed attempt');
  const w=fx.geomParamsOf(PD_B).width;
  expect(Math.abs(w-80)<P319_TOL, `G-18 RED: the drifted width must be scaled to the reference width (got ${w})`);
  eq(done.session.currentEvaluation.status, 'PASS', 'the re-evaluation is SATISFIED');
});

test('G18-3: the honest-decline posture is preserved for constraint classes WITHOUT an arm — fixedDistance still proposes nothing (G-18 guard)', ()=>{
  const doc=p319Doc([
    {id:PD_A, x:0, y:0, width:80, height:60},
    {id:PD_B, x:300, y:0, width:80, height:60}]);
  const result=p319Evaluate(doc, [p319Constraint('fixedDistance',[PD_A,PD_B],{id:'c-fd', parameters:{distance:100}})]);
  eq(result.status, 'DEVIATION', 'the distance violation is honestly reported');
  const out=p319ProposeCorrections(result);
  eq(out.length, 0, 'no proposal for the armless distance class — the absence IS the decline (§28 preserved)');
});

// --- Section G17: T11 id translation (G-17, P1) --------------------------------

// The structure deviation record the dissolve-group agenda consumes (the E-7
// mock-critic shape: structure.grouping deviations are host-fabricated — the
// evaluation constraint arm covers the geometric classes only).
function p319StructDev(){
  return Object.freeze({ status:'DEVIATION', deviations:[{ id:'dev-g17-grp', category:'structure', property:'structure.grouping', expected:true, actual:false, delta:null, tolerance:null, severity:'error', objectId:PD_A, targetRef:'$doc:'+PD_A, message:'objects not grouped' }] });
}

function p317StructTarget(){
  return p319Target({ category:'STRUCTURE', metric:'structure.grouping', objectIds:[PD_A, PD_B], observedValue:1, targetValue:undefined, severity:'MEDIUM', confidence:0.9,
    evidence:[{ type:'HOST', source:'phase3.19', objectIds:[PD_A, PD_B], value:1 }] });
}

test('G17-1: T11 id translation — the dissolve-group attempt resolves object ids to the owning group node and the ungroup SUCCEEDS (group removed, members to the former parent, world transforms preserved) (G-17)', ()=>{
  const geometryStore=new GeometryStore(), appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:id=>geometryStore.has(id), hasAppearance:id=>appearanceStore.has(id)});
  const sceneGraph=new SceneGraph(), eventBus=new EventBus(), historyManager=new HistoryManager();
  const transactionManager=new TransactionExecutor({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus, historyManager);
  const registry=createCoreToolRegistry();
  const transactionBuilder=new TransactionBuilder();
  geometryStore.create('e1111111-1111-4111-8111-111111111111', {type:'rect', params:{x:0,y:0,width:40,height:30,rx:0,ry:0}});
  geometryStore.create('e2222222-2222-4222-8222-222222222222', {type:'rect', params:{x:50,y:0,width:40,height:30,rx:0,ry:0}});
  appearanceStore.create({id:'f1111111-1111-4111-8111-111111111111', stack:[]});
  appearanceStore.create({id:'f2222222-2222-4222-8222-222222222222', stack:[]});
  objectStore.create({id:PD_A, geometryRef:'e1111111-1111-4111-8111-111111111111', appearanceRef:'f1111111-1111-4111-8111-111111111111', meta:{name:'a', locked:false, visible:true, selectable:true}});
  objectStore.create({id:PD_B, geometryRef:'e2222222-2222-4222-8222-222222222222', appearanceRef:'f2222222-2222-4222-8222-222222222222', meta:{name:'b', locked:false, visible:true, selectable:true}});
  // House construction discipline: the root placeholder FIRST, then a REAL
  // group carrying a non-identity transform, then the member nodes under it.
  sceneGraph.createRoot();
  const G1=sceneGraph.createGroup(null, {a:1,b:0,c:0,d:1,tx:7,ty:3});
  sceneGraph.createNode(PD_A, G1.id);
  sceneGraph.createNode(PD_B, G1.id);
  const fx={ docContext:{ objectStore, geometryStore, appearanceStore, sceneGraph },
    evaluationContext:{ targets:[{objectId:PD_A,targetRef:'$doc:'+PD_A},{objectId:PD_B,targetRef:'$doc:'+PD_B}] },
    substrate:{ registry, transactionManager, transactionBuilder, sceneGraph } };
  let owningAtDissolve=null, worldBeforeDissolve=null;
  const calls=[];
  const critic={ evaluate(document, context){ calls.push(1);
    if(calls.length===2){ const n=sceneGraph.findNodeByObjectId(PD_A); owningAtDissolve=n.parent; worldBeforeDissolve=sceneGraph.getWorldTransform(n.id); }
    return calls.length<=2 ? p319StructDev() : Object.freeze({ status:'PASS', deviations:[] }); } };
  const request={ rootIntentId:'intent-g17', rootTransactionId:'tx-root-g17', targets:[p317StructTarget()],
    policy:p319Policy({ maxIterations: 5 }), mode:'AUTO', critic, document:fx.docContext,
    evaluationContext:fx.evaluationContext, substrate:fx.substrate };
  const done=p319Engine.run(p319Engine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'VERIFIED', 'G-17 RED: the dissolve-group attempt must SUCCEED via id translation — the legacy path fed object ids to T11 and FAILED deterministically (E-7 disclosure 39)');
  deepEq(done.session.corrections.map(a=>a.status), ['NO_EFFECT','IMPROVED'], 'attempt 1 is the regroup recipe (no subjective improvement), attempt 2 is the TRANSLATED ungroup (accepted)');
  expect(typeof owningAtDissolve === 'string' && owningAtDissolve.length > 0, 'fixture: the objects sat under a live owning group node at dissolve time (the id is captured at the post-attempt-1 re-evaluation; disclosed fixture note: attempt 1 T10 regroup creates an EMPTY group on this substrate — the WC member scan matches objectId while nodes carry objectRef, tools.js:497 — so the dissolved owning group is the fixture group G1)');
  eq(sceneGraph.findNode(owningAtDissolve), undefined, 'the owning group node is REMOVED by the translated T11');
  eq(sceneGraph.findNodeByObjectId(PD_A).parent, null, 'member A reparented to the group\'s former parent (top level)');
  eq(sceneGraph.findNodeByObjectId(PD_B).parent, null, 'member B reparented likewise');
  const worldAfter=sceneGraph.getWorldTransform(sceneGraph.findNodeByObjectId(PD_A).id);
  eq(JSON.stringify(worldAfter), JSON.stringify(worldBeforeDissolve), 'the world transform is preserved through the dissolve (T11 baking)');
});

test('G17-2: no owning group → the honest decline — the T11 attempt FAILS without scene mutation and the loop stays NO_PROGRESS (G-17 guard)', ()=>{
  const geometryStore=new GeometryStore(), appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:id=>geometryStore.has(id), hasAppearance:id=>appearanceStore.has(id)});
  const sceneGraph=new SceneGraph(), eventBus=new EventBus(), historyManager=new HistoryManager();
  const transactionManager=new TransactionExecutor({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus, historyManager);
  const registry=createCoreToolRegistry();
  const transactionBuilder=new TransactionBuilder();
  geometryStore.create('e1111111-1111-4111-8111-111111111111', {type:'rect', params:{x:0,y:0,width:40,height:30,rx:0,ry:0}});
  geometryStore.create('e2222222-2222-4222-8222-222222222222', {type:'rect', params:{x:50,y:0,width:40,height:30,rx:0,ry:0}});
  appearanceStore.create({id:'f1111111-1111-4111-8111-111111111111', stack:[]});
  appearanceStore.create({id:'f2222222-2222-4222-8222-222222222222', stack:[]});
  objectStore.create({id:PD_A, geometryRef:'e1111111-1111-4111-8111-111111111111', appearanceRef:'f1111111-1111-4111-8111-111111111111', meta:{name:'a', locked:false, visible:true, selectable:true}});
  objectStore.create({id:PD_B, geometryRef:'e2222222-2222-4222-8222-222222222222', appearanceRef:'f2222222-2222-4222-8222-222222222222', meta:{name:'b', locked:false, visible:true, selectable:true}});
  // NO scene nodes for the objects at all — unattached, hence NO owning group.
  const fx={ docContext:{ objectStore, geometryStore, appearanceStore, sceneGraph },
    evaluationContext:{ targets:[{objectId:PD_A,targetRef:'$doc:'+PD_A},{objectId:PD_B,targetRef:'$doc:'+PD_B}] },
    substrate:{ registry, transactionManager, transactionBuilder, sceneGraph } };
  const calls=[];
  const critic={ evaluate(){ calls.push(1); return p319StructDev(); } };
  const request={ rootIntentId:'intent-g17b', rootTransactionId:'tx-root-g17b', targets:[p317StructTarget()],
    policy:p319Policy({ maxIterations: 5 }), mode:'AUTO', critic, document:fx.docContext,
    evaluationContext:fx.evaluationContext, substrate:fx.substrate };
  const done=p319Engine.run(p319Engine.start(request));
  eq(done.status, 'TERMINATED', 'terminated');
  eq(done.terminationReason, 'NO_PROGRESS', 'the honest decline keeps E-7 semantics: the unresolvable T11 attempt FAILS and the loop reports NO_PROGRESS');
  deepEq(done.session.corrections.map(a=>a.status), ['NO_EFFECT','FAILED'], 'the dissolve-group attempt is an honest FAILED attempt, never a fabricated success');
  eq(sceneGraph.findNodeByObjectId(PD_A), undefined, 'no scene node was fabricated for the unattached object');
  eq(sceneGraph.findNodeByObjectId(PD_B), undefined, 'no scene node for B either');
});

// --- summary (house protocol) -------------------------------------------------
Promise.all(pending).then(()=>{
  console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
  if(failed>0) process.exit(1);
});
