// PHASE 3.13 — CHECKPOINT A + B tests (spec §07-§10/§13-§18/§20/§23/§24, §41-A/B).
// Harness mirrors tests/dsl.test.mjs (counted-suite protocol: final
// "Tests: N total, M passed, F failed" line, exit 1 on failure).

import { readFileSync, readdirSync } from 'node:fs';
import { parseDSL, validateDSL, compileToIR, compileDSL, analyzeReferences, DSLExecutor } from '../src-js/dsl.js';
import {
  PlanningErrorCodes, PlanningError, INTENT_CATEGORIES,
  validateIntent, validateExpectedState, validatePlanStep, validatePlanStructure,
  buildExpectedState, makePlanStep, makePlan, createPlanningContext,
  createExpectedState, createPlan, validatePlan, compilePlanToDSL
} from '../src-js/ai.js';
// Checkpoint F (§41-F): execution-substrate imports. The harness below is the
// COMPOSITION LAYER a real application provides — execution side only. The
// Planner boundary (ai.js read-only projection, D4) is untouched; no src-js/
// file is modified by Checkpoint F.
import { GeometryStore, AppearanceStore, ObjectStore } from '../src-js/stores.js';
import { SceneGraph, SimpleSpatialIndex } from '../src-js/scenegraph.js';
import { TransactionExecutor, HistoryManager, EventBus } from '../src-js/transaction.js';
import { Renderer } from '../src-js/renderer.js';
import { createCoreToolRegistry } from '../src-js/tools.js';
import { rectBBox } from '../src-js/geometry.js';
import * as BBox from '../src-js/bbox.js';

let total=0, passed=0, failed=0;
const pending=[];
function test(name, fn){ total++; try{ const r=fn(); if(r&&typeof r.then==='function'){ pending.push(r.then(()=>{passed++; console.log(`✓ ${name}`);}, e=>{failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);})); } else { passed++; console.log(`✓ ${name}`);} }catch(e){ failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }
function eq(a,b,msg){ if(a!==b) throw new Error(`${msg||'eq failed'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function hasCode(result, code, msg){ expect(result.errors && result.errors.some(e=>e.code===code), `${msg||'expected code'} — got ${JSON.stringify(result.errors)}`); }

console.log('=== PHASE 3.13 Checkpoint A: PlanningErrorCodes (spec §14) ===');
test('all 11 mandated planning error codes exist', ()=>{
  for(const code of ['INVALID_INTENT','UNSUPPORTED_OPERATION','UNSUPPORTED_OBJECT_TYPE','MISSING_PARAMETER','INVALID_PARAMETER','NO_VALID_PLAN','TOOL_NOT_FOUND','TOOL_INPUT_INVALID','PLAN_INVALID','PLAN_NON_DETERMINISTIC','PLANNER_STATE_MUTATION']){
    eq(PlanningErrorCodes[code], code, `missing code ${code}`);
  }
  eq(INTENT_CATEGORIES.join(','), 'create,transform,appearance,alignment,structure', 'intent categories (spec §07)');
});
test('PlanningError carries code + message and is an Error', ()=>{
  const err=new PlanningError('INVALID_INTENT','bad intent',{at:1});
  expect(err instanceof Error);
  eq(err.code,'INVALID_INTENT'); eq(err.message,'bad intent'); eq(err.details.at,1);
});

console.log('=== Checkpoint A: validateIntent — create (spec §05/§07) ===');
const CREATE_RECT={ type:'create', objectType:'rectangle', width:200, height:100, rx:12, ry:12, fill:'#FF0000', placement:'center' };
test('spec §07 create-rectangle example is valid', ()=>{
  const r=validateIntent(CREATE_RECT);
  expect(r.valid, JSON.stringify(r.errors));
});
test('missing type -> INVALID_INTENT; unknown type -> UNSUPPORTED_OPERATION', ()=>{
  const a=validateIntent({objectType:'rectangle', width:1, height:1});
  hasCode(a,'INVALID_INTENT','missing type');
  const b=validateIntent({type:'teleport', targets:['x']});
  hasCode(b,'UNSUPPORTED_OPERATION','unknown type');
});
test('null / non-object intent -> INVALID_INTENT', ()=>{
  hasCode(validateIntent(null),'INVALID_INTENT','null');
  hasCode(validateIntent('create'),'INVALID_INTENT','string');
  hasCode(validateIntent(42),'INVALID_INTENT','number');
});
test('missing objectType -> MISSING_PARAMETER', ()=>{
  hasCode(validateIntent({type:'create', width:10, height:10}),'MISSING_PARAMETER','objectType');
});
test('unknown objectType -> UNSUPPORTED_OBJECT_TYPE', ()=>{
  hasCode(validateIntent({type:'create', objectType:'cloud', width:10, height:10}),'UNSUPPORTED_OBJECT_TYPE','cloud');
});
test('missing width/height -> MISSING_PARAMETER', ()=>{
  hasCode(validateIntent({type:'create', objectType:'rectangle', height:10}),'MISSING_PARAMETER','width');
  hasCode(validateIntent({type:'create', objectType:'rectangle', width:10}),'MISSING_PARAMETER','height');
});
test('non-finite numeric values -> INVALID_PARAMETER (spec §07)', ()=>{
  hasCode(validateIntent({type:'create', objectType:'rectangle', width:NaN, height:10}),'INVALID_PARAMETER','NaN');
  hasCode(validateIntent({type:'create', objectType:'rectangle', width:Infinity, height:10}),'INVALID_PARAMETER','Infinity');
  hasCode(validateIntent({type:'create', objectType:'rectangle', width:'200', height:10}),'INVALID_PARAMETER','string');
});
test('invalid dimensions (<=0) -> INVALID_PARAMETER', ()=>{
  hasCode(validateIntent({type:'create', objectType:'rectangle', width:0, height:10}),'INVALID_PARAMETER','zero width');
  hasCode(validateIntent({type:'create', objectType:'rectangle', width:10, height:-3}),'INVALID_PARAMETER','negative height');
  hasCode(validateIntent({type:'create', objectType:'rectangle', width:10, height:10, rx:-1}),'INVALID_PARAMETER','negative rx');
});
test('invalid color -> INVALID_PARAMETER', ()=>{
  hasCode(validateIntent({type:'create', objectType:'rectangle', width:10, height:10, fill:'red'}),'INVALID_PARAMETER','named color');
  hasCode(validateIntent({type:'create', objectType:'rectangle', width:10, height:10, fill:'#GG0000'}),'INVALID_PARAMETER','bad hex');
  expect(validateIntent({type:'create', objectType:'rectangle', width:10, height:10, fill:'#F00'}).valid, '#F00 must be accepted');
});
test('invalid opacity / placement -> INVALID_PARAMETER', ()=>{
  hasCode(validateIntent({type:'create', objectType:'rectangle', width:10, height:10, opacity:2}),'INVALID_PARAMETER','opacity>1');
  hasCode(validateIntent({type:'create', objectType:'rectangle', width:10, height:10, placement:'somewhere'}),'INVALID_PARAMETER','placement');
});
test('create ellipse requires rx/ry; unknown keys rejected', ()=>{
  hasCode(validateIntent({type:'create', objectType:'ellipse'}),'MISSING_PARAMETER','rx/ry');
  expect(validateIntent({type:'create', objectType:'ellipse', rx:50, ry:30}).valid, 'ellipse rx/ry');
  hasCode(validateIntent({type:'create', objectType:'rectangle', width:10, height:10, wheels:4}),'INVALID_PARAMETER','unknown key');
});

console.log('=== Checkpoint A: validateIntent — transform/appearance/alignment/structure (§07) ===');
test('transform intent: valid translate; unknown operation -> UNSUPPORTED_OPERATION', ()=>{
  expect(validateIntent({type:'transform', targets:['a'], operation:'translate', params:{x:5, y:-2}}).valid, 'translate');
  hasCode(validateIntent({type:'transform', targets:['a'], operation:'yeet', params:{}}),'UNSUPPORTED_OPERATION','op');
  hasCode(validateIntent({type:'transform', operation:'translate', params:{x:1,y:1}}),'MISSING_PARAMETER','targets');
  hasCode(validateIntent({type:'transform', targets:[], operation:'translate', params:{x:1,y:1}}),'INVALID_PARAMETER','empty targets');
  hasCode(validateIntent({type:'transform', targets:['a'], operation:'translate', params:{x:'a',y:1}}),'INVALID_PARAMETER','non-finite delta');
});
test('appearance intent: fill and/or opacity; neither -> MISSING_PARAMETER', ()=>{
  expect(validateIntent({type:'appearance', targets:['a'], fill:'#00FF00'}).valid, 'fill');
  expect(validateIntent({type:'appearance', targets:['a'], opacity:0.5}).valid, 'opacity');
  hasCode(validateIntent({type:'appearance', targets:['a']}),'MISSING_PARAMETER','neither');
});
test('alignment intent: mode must be valid for axis (T08 rules, tools.js:399-402)', ()=>{
  expect(validateIntent({type:'alignment', targets:['a'], axis:'both', mode:'center'}).valid, 'both/center');
  hasCode(validateIntent({type:'alignment', targets:['a'], axis:'horizontal', mode:'top'}),'INVALID_PARAMETER','H/top');
  hasCode(validateIntent({type:'alignment', targets:['a'], axis:'diagonal', mode:'center'}),'INVALID_PARAMETER','axis');
  hasCode(validateIntent({type:'alignment', targets:['a'], mode:'center'}),'MISSING_PARAMETER','axis missing');
});
test('structure intent: group/ungroup only', ()=>{
  expect(validateIntent({type:'structure', operation:'group', targets:['a','b']}).valid, 'group');
  expect(validateIntent({type:'structure', operation:'ungroup', targets:['a']}).valid, 'ungroup');
  hasCode(validateIntent({type:'structure', operation:'explode', targets:['a']}),'UNSUPPORTED_OPERATION','op');
  hasCode(validateIntent({type:'structure', operation:'group'}),'MISSING_PARAMETER','targets');
});

console.log('=== Checkpoint A: ExpectedState (spec §08/§09) ===');
test('buildExpectedState: mechanical derivation for create rect (requested, not measured)', ()=>{
  const es=buildExpectedState(CREATE_RECT);
  eq(es.geometry.width,200,'width'); eq(es.geometry.height,100,'height');
  eq(es.geometry.rx,12,'rx'); eq(es.geometry.ry,12,'ry');
  eq(es.geometry.area,20000,'area'); eq(es.geometry.symmetric,true,'symmetric');
  eq(es.spatial.centered,true,'centered'); eq(es.spatial.aligned,null,'aligned');
  eq(es.appearance.fill,'#FF0000','fill'); eq(es.appearance.stroke,null,'stroke');
  eq(es.constraint.satisfied,null,'constraint');
  eq(es.structure.grouped,false,'grouped');
  eq(es.status,'requested','status marker (§09: Planner must not pretend it is already true)');
  expect(validateExpectedState(es).valid, 'built state must validate');
});
test('buildExpectedState: rx/ry default to 0 (symmetric true) when omitted', ()=>{
  const es=buildExpectedState({type:'create', objectType:'rectangle', width:10, height:20});
  eq(es.geometry.rx,0,'rx'); eq(es.geometry.ry,0,'ry'); eq(es.geometry.symmetric,true,'symmetric');
});
test('buildExpectedState: appearance / alignment / structure intents map their sections', ()=>{
  const a=buildExpectedState({type:'appearance', targets:['x'], fill:'#123456', opacity:0.5});
  eq(a.appearance.fill,'#123456','fill'); eq(a.appearance.opacity,0.5,'opacity');
  const g=buildExpectedState({type:'alignment', targets:['x'], axis:'both', mode:'center'});
  eq(g.spatial.aligned,true,'aligned');
  const s=buildExpectedState({type:'structure', operation:'group', targets:['a','b']});
  eq(s.structure.grouped,true,'grouped');
});
test('validateExpectedState rejects missing sections / bad status / function values', ()=>{
  const good=buildExpectedState(CREATE_RECT);
  const missing={...good}; delete missing.spatial;
  expect(!validateExpectedState(missing).valid, 'missing section');
  hasCode(validateExpectedState({...good, status:'already-true'}),'INVALID_PARAMETER','bad status');
  hasCode(validateExpectedState({...good, geometry:{...good.geometry, width:'200'}}),'INVALID_PARAMETER','string width');
  const withFn={...good, appearance:{...good.appearance, write:()=>{}}};
  expect(!validateExpectedState(withFn).valid, 'function value');
});

console.log('=== Checkpoint A: Plan / PlanStep (spec §10/§16) ===');
test('makePlanStep + validatePlanStep', ()=>{
  const step=makePlanStep('step-1','T01',{width:200, height:100, rx:12, ry:12});
  eq(step.id,'step-1'); eq(step.toolId,'T01');
  expect(validatePlanStep(step).valid, JSON.stringify(validatePlanStep(step).errors));
  expect(!validatePlanStep({id:'s', toolId:'', input:{}}).valid, 'empty toolId');
  expect(!validatePlanStep({id:'s', toolId:'T01'}).valid, 'missing input');
  expect(!validatePlanStep({id:'s', toolId:'T01', input:{bad:()=>{}}}).valid, 'function in input');
});
test('makePlan: §10 shape {id, intentId, steps, expectedState, deterministic, parentPlanId}', ()=>{
  const es=buildExpectedState(CREATE_RECT);
  const steps=[ makePlanStep('step-1','T01',{width:200,height:100,rx:12,ry:12}), makePlanStep('step-2','T07',{objectIds:['$step-1'], fill:{kind:'solid', color:'#FF0000'}}) ];
  const plan=makePlan({intent:CREATE_RECT, steps, expectedState:es});
  expect(typeof plan.id==='string' && plan.id.startsWith('plan-'), 'plan id');
  expect(typeof plan.intentId==='string' && plan.intentId.startsWith('intent-'), 'intent id');
  eq(plan.deterministic,true,'deterministic flag'); eq(plan.parentPlanId,null,'parentPlanId');
  eq(plan.steps.length,2,'steps');
  expect(validatePlanStructure(plan).valid, JSON.stringify(validatePlanStructure(plan).errors));
});
test('§16 determinism: identical intent + steps -> identical plan id + intentId', ()=>{
  const es=buildExpectedState(CREATE_RECT);
  const steps=[ makePlanStep('step-1','T01',{width:200,height:100,rx:12,ry:12}) ];
  const p1=makePlan({intent:CREATE_RECT, steps, expectedState:es});
  const p2=makePlan({intent:CREATE_RECT, steps:[ makePlanStep('step-1','T01',{width:200,height:100,rx:12,ry:12}) ], expectedState:es});
  eq(p1.id,p2.id,'plan id deterministic');
  eq(p1.intentId,p2.intentId,'intent id deterministic');
  eq(JSON.stringify(p1), JSON.stringify(p2), 'full plan JSON identical');
});
test('validatePlanStructure rejections: empty steps, deterministic=false, bad step, bad state', ()=>{
  const es=buildExpectedState(CREATE_RECT);
  const base={intent:CREATE_RECT, expectedState:es};
  const r1=validatePlanStructure(makePlan({...base, steps:[]}));
  expect(!r1.valid, 'empty steps'); hasCode(r1,'PLAN_INVALID','empty steps');
  const plan=makePlan({...base, steps:[makePlanStep('step-1','T01',{width:1,height:1})]});
  const r2=validatePlanStructure({...plan, deterministic:false});
  expect(!r2.valid,'deterministic false'); hasCode(r2,'PLAN_NON_DETERMINISTIC','flag');
  const r3=validatePlanStructure({...plan, steps:[{id:'step-1', toolId:'T01'}]});
  expect(!r3.valid,'step missing input');
  const r4=validatePlanStructure({...plan, expectedState:{nope:true}});
  expect(!r4.valid,'bad expectedState');
  const r5=validatePlanStructure({...plan, intentId:''});
  expect(!r5.valid,'empty intentId');
});

console.log('=== Checkpoint A: PlanningContext (spec §13) ===');
test('createPlanningContext: deep-frozen plain-data projection', ()=>{
  const ctx=createPlanningContext({artboard:{width:800, height:600, center:{x:400, y:300}}, objects:[]});
  expect(Object.isFrozen(ctx),'frozen');
  expect(Object.isFrozen(ctx.artboard),'nested frozen');
  eq(ctx.artboard.center.x,400,'data preserved');
  let threw=false;
  try { 'use strict'; ctx.artboard.width=1; } catch(e){ threw=true; }
  expect(threw,'mutation must throw in strict mode (ESM is strict)');
});
test('createPlanningContext rejects function values (no mutation methods can be exposed, §13)', ()=>{
  let err=null;
  try { createPlanningContext({objectStore:{write:()=>{}, get:()=>({})}}); } catch(e){ err=e; }
  expect(err instanceof PlanningError, 'PlanningError expected');
  eq(err && err.code,'INVALID_PARAMETER','code');
});
test('createPlanningContext rejects non-object input', ()=>{
  let err=null;
  try { createPlanningContext('nope'); } catch(e){ err=e; }
  expect(err instanceof PlanningError); eq(err && err.code,'INVALID_PARAMETER','code');
});

console.log('=== Checkpoint A: static determinism + security scan of src-js/ai.js (§05/§16/§26 precedent) ===');
test('planner source is free of nondeterminism and forbidden capabilities', ()=>{
  const src=readFileSync(new URL('../src-js/ai.js', import.meta.url), 'utf8');
  for(const banned of [/Math\.random/, /Date\.now/, /crypto\.randomUUID/, /\bfetch\s*\(/, /\beval\s*\(/, /\bnew\s+Function\b/, /\brequire\s*\(/, /\bprocess\.env\b/]){
    expect(!banned.test(src), `banned pattern in src-js/ai.js: ${banned}`);
  }
});

// ============================================================================
// PHASE 3.13 — CHECKPOINT B: PLANNER CORE (spec §15/§16/§17/§18/§20/§23/§24,
// §41-B). Targets: createExpectedState / createPlan / validatePlan /
// compilePlanToDSL. Mandatory proof: same input + same context => identical
// output (§16), with zero entropy sources for plan identity.
// ============================================================================

console.log('=== Checkpoint B: fixtures (spec §20 vertical-slice intent) ===');
// Context contract: created via createPlanningContext (deep-frozen, §13).
// Artboard shape uses the spec §20 vocabulary: artboard.centerX / centerY.
const B_ARTBOARD={width:800, height:600, centerX:400, centerY:300};
const B_CTX=createPlanningContext({artboard:B_ARTBOARD, objects:[]});
// §20 slice intent: create red rounded rect 200x100 radius 12, centered.
const B_INTENT={type:'create', objectType:'rectangle', width:200, height:100, rx:12, ry:12, fill:'#FF0000', placement:'center'};
function isPlanningErrorWith(fn, code){
  try { fn(); } catch(e){ return e instanceof PlanningError && e.code===code; }
  return false;
}

// Checkpoint C fixtures (declared early: the superseded B-era boundary test at
// the createPlan section consumes them; declared via createPlanningContext,
// deep-frozen per §13). objects = plain object map keyed by known object id —
// the minimal Checkpoint C snapshot contract for targeting EXISTING objects.
const C_CTX=createPlanningContext({
  artboard:B_ARTBOARD,
  objects:{ 'rect-1':{objectType:'rect'}, 'rect-2':{objectType:'rect'}, 'ellipse-1':{objectType:'ellipse'} }
});
const T_INTENT={type:'transform', targets:['rect-1'], operation:'translate', params:{x:10, y:-5}};

console.log('=== Checkpoint B: createExpectedState (spec §08/§15) ===');
test('B: createExpectedState returns a deep-frozen, valid ExpectedState equal to buildExpectedState', ()=>{
  const es=createExpectedState(B_INTENT, B_CTX);
  expect(Object.isFrozen(es),'frozen root');
  expect(Object.isFrozen(es.geometry),'frozen section');
  eq(es.status,'requested','status');
  eq(es.geometry.width,200,'width'); eq(es.geometry.rx,12,'rx');
  eq(es.spatial.centered,true,'centered'); eq(es.appearance.fill,'#FF0000','fill');
  expect(validateExpectedState(es).valid, JSON.stringify(validateExpectedState(es).errors));
  eq(JSON.stringify(es), JSON.stringify(buildExpectedState(B_INTENT)), 'identical to Checkpoint A mechanical derivation');
});
test('B: createExpectedState throws PlanningError for an invalid intent (top-level INVALID_INTENT, specific code in details — buildExpectedState contract, ai.js:341)', ()=>{
  expect(isPlanningErrorWith(()=>createExpectedState({type:'create', objectType:'rectangle'}, B_CTX),'INVALID_INTENT'),'missing width/height');
  expect(isPlanningErrorWith(()=>createExpectedState(null, B_CTX),'INVALID_INTENT'),'null intent');
  let err=null;
  try { createExpectedState({type:'teleport'}, B_CTX); } catch(e){ err=e; }
  expect(err instanceof PlanningError,'PlanningError expected');
  eq(err && err.code,'INVALID_INTENT','top-level code (Checkpoint A contract)');
  expect(err && Array.isArray(err.details) && err.details.some(e=>e.code==='UNSUPPORTED_OPERATION'),'specific code preserved in details');
});
test('B: createExpectedState rejects a mutable (non-frozen) context and a non-object context (§13)', ()=>{
  expect(isPlanningErrorWith(()=>createExpectedState(B_INTENT,{artboard:B_ARTBOARD}),'INVALID_PARAMETER'),'plain mutable object');
  expect(isPlanningErrorWith(()=>createExpectedState(B_INTENT,42),'INVALID_PARAMETER'),'number');
  expect(isPlanningErrorWith(()=>createExpectedState(B_INTENT,'ctx'),'INVALID_PARAMETER'),'string');
});
test('B: createExpectedState works without a context (context optional at Checkpoint B)', ()=>{
  const es=createExpectedState(B_INTENT);
  eq(es.geometry.width,200,'width'); eq(es.spatial.centered,true,'centered');
});

console.log('=== Checkpoint B: createPlan — Rules A/B/C/D on create intents (§12/§17/§20) ===');
test('B: §20 slice plan = T01 geometry-only -> T07 fill -> T08 both/center (12/§20)', ()=>{
  const plan=createPlan(B_INTENT, B_CTX);
  eq(plan.steps.length,3,'three steps');
  eq(plan.steps[0].toolId,'T01'); eq(plan.steps[1].toolId,'T07'); eq(plan.steps[2].toolId,'T08');
  eq(plan.steps[0].id,'step-1'); eq(plan.steps[1].id,'step-2'); eq(plan.steps[2].id,'step-3');
  // approved deviation 3: placement:'center' resolved at plan time via artboard-aware x/y
  eq(plan.steps[0].input.x,300,'x = centerX - width/2');
  eq(plan.steps[0].input.y,250,'y = centerY - height/2');
  eq(plan.steps[0].input.width,200,'width'); eq(plan.steps[0].input.height,100,'height');
  eq(plan.steps[0].input.rx,12,'rx'); eq(plan.steps[0].input.ry,12,'ry');
  // approved deviation 1: T07 real input shape (objectIds + {kind,color}); '$' marks step output ref
  eq(JSON.stringify(plan.steps[1].input), JSON.stringify({objectIds:['$step-1'], fill:{kind:'solid', color:'#FF0000'}}),'T07 input');
  eq(JSON.stringify(plan.steps[2].input), JSON.stringify({objectIds:['$step-1'], axis:'both', mode:'center'}),'T08 input');
});
test('B: Rule C — T01 receives NO fill key; rx AND ry both present (deviation 5)', ()=>{
  const plan=createPlan(B_INTENT, B_CTX);
  expect(!('fill' in plan.steps[0].input),'no fill in T01 input');
  expect(!('opacity' in plan.steps[0].input),'no opacity in T01 input');
  eq(plan.steps[0].input.rx,12,'rx present'); eq(plan.steps[0].input.ry,12,'ry present');
});
test('B: Rule B — center math per tool anchor: rect x/y top-left, ellipse cx/cy center', ()=>{
  const r=createPlan(B_INTENT, B_CTX).steps[0].input;
  eq(r.x,400-200/2,'rect x'); eq(r.y,300-100/2,'rect y');
  const e=createPlan({type:'create', objectType:'ellipse', rx:50, ry:30, fill:'#00FF00', placement:'center'}, B_CTX);
  eq(e.steps[0].toolId,'T02','T02 for ellipse');
  eq(e.steps[0].input.cx,400,'cx = centerX'); eq(e.steps[0].input.cy,300,'cy = centerY');
  eq(e.steps[0].input.rx,50,'rx'); eq(e.steps[0].input.ry,30,'ry');
  eq(e.steps.length,3,'T02 -> T07 -> T08');
});
test('B: placement origin/absent — explicit x/y passthrough (tool anchor semantics), default 0,0', ()=>{
  const o=createPlan({type:'create', objectType:'rectangle', width:10, height:20, x:5, y:6, placement:'origin'}, B_CTX);
  eq(o.steps[0].input.x,5,'x passthrough'); eq(o.steps[0].input.y,6,'y passthrough');
  eq(o.steps.length,1,'no fill, no center -> single step');
  const d=createPlan({type:'create', objectType:'rectangle', width:10, height:20}, B_CTX);
  eq(d.steps[0].input.x,0,'x default 0'); eq(d.steps[0].input.y,0,'y default 0');
  const nc=createPlan({type:'create', objectType:'rectangle', width:10, height:20});
  eq(nc.steps.length,1,'createPlan works without a context for origin placement');
});
test('B: create + fill + opacity -> opacity rides the T07 step (tools.js:372)', ()=>{
  const plan=createPlan({type:'create', objectType:'rectangle', width:10, height:10, fill:'#123456', opacity:0.5}, B_CTX);
  eq(plan.steps.length,2,'T01 + T07');
  eq(plan.steps[1].input.opacity,0.5,'opacity on T07');
  eq(plan.steps[1].input.fill.color,'#123456','fill color');
});
test('B: opacity-only create (no fill) -> NO_VALID_PLAN (T07 opacity-only needs an existing fill item, tools.js:377)', ()=>{
  expect(isPlanningErrorWith(()=>createPlan({type:'create', objectType:'rectangle', width:10, height:10, opacity:0.5}, B_CTX),'NO_VALID_PLAN'),'refuses doomed plan');
});
test('B: placement center + explicit x/y -> INVALID_PARAMETER (conflict; Planner computes placement)', ()=>{
  expect(isPlanningErrorWith(()=>createPlan({...B_INTENT, x:0}, B_CTX),'INVALID_PARAMETER'),'x conflicts with center');
  expect(isPlanningErrorWith(()=>createPlan({...B_INTENT, y:5}, B_CTX),'INVALID_PARAMETER'),'y conflicts with center');
});
test('B: placement center without artboard in context -> MISSING_PARAMETER', ()=>{
  const ctxNoArtboard=createPlanningContext({objects:[]});
  expect(isPlanningErrorWith(()=>createPlan(B_INTENT, ctxNoArtboard),'MISSING_PARAMETER'),'no artboard');
});
test('B: artboard with non-finite centerX/centerY -> INVALID_PARAMETER', ()=>{
  const bad=createPlanningContext({artboard:{width:800, height:600, centerX:NaN, centerY:300}});
  expect(isPlanningErrorWith(()=>createPlan(B_INTENT, bad),'INVALID_PARAMETER'),'NaN centerX');
  const bad2=createPlanningContext({artboard:{centerY:300}});
  expect(isPlanningErrorWith(()=>createPlan(B_INTENT, bad2),'INVALID_PARAMETER'),'missing centerX');
});
test('C: B-era boundary SUPERSEDED — non-create intents now plan via Rules E/F/G/H (spec §41-C)', ()=>{
  // The Checkpoint B test asserted UNSUPPORTED_OPERATION here ("planning rules
  // arrive at Checkpoint C"). Checkpoint C implements those rules, so the
  // expectation flips: transform/alignment intents now produce Plans.
  eq(createPlan({type:'transform', targets:['rect-1'], operation:'translate', params:{x:1,y:1}}, C_CTX).steps[0].toolId,'T05','transform plans');
  eq(createPlan({type:'alignment', targets:['rect-1'], axis:'both', mode:'center'}, C_CTX).steps[0].toolId,'T08','alignment plans');
});
test('B: invalid intent -> INVALID_INTENT; mutable context -> INVALID_PARAMETER; plan frozen + valid', ()=>{
  expect(isPlanningErrorWith(()=>createPlan({type:'create', objectType:'rectangle'}, B_CTX),'INVALID_INTENT'),'invalid intent');
  expect(isPlanningErrorWith(()=>createPlan(B_INTENT,{artboard:B_ARTBOARD}),'INVALID_PARAMETER'),'mutable context');
  const plan=createPlan(B_INTENT, B_CTX);
  expect(Object.isFrozen(plan),'frozen plan');
  expect(Object.isFrozen(plan.steps[0].input),'frozen step input');
  eq(plan.deterministic,true,'deterministic flag');
  eq(plan.intentId, createExpectedState(B_INTENT, B_CTX).intentId,'intentId matches ExpectedState');
  expect(validatePlan(plan, B_CTX).valid, JSON.stringify(validatePlan(plan, B_CTX).errors));
});
test('B: non-finite x/y on a create intent (validator hole for absent placement) caught at plan time', ()=>{
  expect(isPlanningErrorWith(()=>createPlan({type:'create', objectType:'rectangle', width:10, height:10, x:'left'}, B_CTX),'INVALID_PARAMETER'),'x string');
});

console.log('=== Checkpoint B: validatePlan (spec §18) ===');
test('B: valid slice plan passes with a frozen context; verdict object shape', ()=>{
  const plan=createPlan(B_INTENT, B_CTX);
  const r=validatePlan(plan, B_CTX);
  expect(r.valid, JSON.stringify(r.errors));
  eq(JSON.stringify(r.errors),'[]','no errors');
  const r2=validatePlan(plan); // context optional
  expect(r2.valid,'context optional');
});
test('B: PLANNER RULE — centered ExpectedState without a T08 step -> PLAN_INVALID (spec §20 mandate)', ()=>{
  const es=createExpectedState(B_INTENT, B_CTX);
  const steps=[makePlanStep('step-1','T01',{x:300,y:250,width:200,height:100,rx:12,ry:12}), makePlanStep('step-2','T07',{objectIds:['$step-1'], fill:{kind:'solid', color:'#FF0000'}})];
  const plan=makePlan({intent:B_INTENT, steps, expectedState:es});
  const r=validatePlan(plan, B_CTX);
  expect(!r.valid,'must fail'); hasCode(r,'PLAN_INVALID','T08 rule');
  expect(r.errors.some(e=>/T08/.test(e.message) && /§20/.test(e.message)),'message names T08 + §20');
});
test('B: PLANNER RULE — T08 present but axis/mode not both/center -> PLAN_INVALID', ()=>{
  const es=createExpectedState(B_INTENT, B_CTX);
  const steps=[makePlanStep('step-1','T01',{x:300,y:250,width:200,height:100,rx:12,ry:12}), makePlanStep('step-2','T07',{objectIds:['$step-1'], fill:{kind:'solid', color:'#FF0000'}}), makePlanStep('step-3','T08',{objectIds:['$step-1'], axis:'horizontal', mode:'center'})];
  const r=validatePlan(makePlan({intent:B_INTENT, steps, expectedState:es}), B_CTX);
  expect(!r.valid,'must fail'); hasCode(r,'PLAN_INVALID','axis/mode');
});
test('B: dependency references — unknown $ref and forward $ref -> PLAN_INVALID', ()=>{
  const es=createExpectedState({type:'appearance', targets:['x'], fill:'#FF0000'});
  const unknown=makePlan({intent:{type:'appearance', targets:['x'], fill:'#FF0000'}, steps:[makePlanStep('step-1','T07',{objectIds:['$step-9'], fill:{kind:'solid', color:'#FF0000'}})], expectedState:es});
  hasCode(validatePlan(unknown),'PLAN_INVALID','unknown ref');
  const fwdSteps=[makePlanStep('step-1','T07',{objectIds:['$step-2'], fill:{kind:'solid', color:'#FF0000'}}), makePlanStep('step-2','T01',{width:1,height:1})];
  const fwd=makePlan({intent:{type:'appearance', targets:['x'], fill:'#FF0000'}, steps:fwdSteps, expectedState:es});
  hasCode(validatePlan(fwd),'PLAN_INVALID','forward ref');
});
test('B: dependency convention — objectIds entries must use the $stepId form', ()=>{
  const es=createExpectedState({type:'appearance', targets:['x'], fill:'#FF0000'});
  const bad=makePlan({intent:{type:'appearance', targets:['x'], fill:'#FF0000'}, steps:[makePlanStep('step-1','T01',{width:1,height:1}), makePlanStep('step-2','T07',{objectIds:['step-1'], fill:{kind:'solid', color:'#FF0000'}})], expectedState:es});
  hasCode(validatePlan(bad),'PLAN_INVALID','non-$ reference');
});
test('B: duplicate step ids -> PLAN_INVALID', ()=>{
  const es=createExpectedState({type:'appearance', targets:['x'], fill:'#FF0000'});
  const dup=makePlan({intent:{type:'appearance', targets:['x'], fill:'#FF0000'}, steps:[makePlanStep('step-1','T01',{width:1,height:1}), makePlanStep('step-1','T01',{width:2,height:2})], expectedState:es});
  hasCode(validatePlan(dup),'PLAN_INVALID','dup ids');
});
test('B: structural garbage + context contract (non-frozen context throws PlanningError)', ()=>{
  hasCode(validatePlan(null),'PLAN_INVALID','null plan');
  hasCode(validatePlan({...createPlan(B_INTENT, B_CTX), deterministic:false}),'PLAN_NON_DETERMINISTIC','flag');
  expect(isPlanningErrorWith(()=>validatePlan(createPlan(B_INTENT, B_CTX),{artboard:B_ARTBOARD}),'INVALID_PARAMETER'),'mutable context throws');
});

console.log('=== Checkpoint B: compilePlanToDSL (spec §23/§24) ===');
test('B: slice plan -> DSL [create, appearance, align]; no fill inside the create args (Rule C)', ()=>{
  const dsl=compilePlanToDSL(createPlan(B_INTENT, B_CTX));
  eq(dsl.version,'1.0','version');
  eq(dsl.program.length,3,'three instructions');
  eq(JSON.stringify(dsl.program[0]), JSON.stringify({op:'create', id:'step-1', type:'rect', args:{x:300,y:250,width:200,height:100,rx:12,ry:12}}),'create instruction');
  expect(!('fill' in dsl.program[0].args),'no fill in create args');
  eq(JSON.stringify(dsl.program[1]), JSON.stringify({op:'appearance', target:'step-1', args:{fill:'#FF0000'}}),'appearance instruction');
  eq(JSON.stringify(dsl.program[2]), JSON.stringify({op:'align', targets:['step-1'], args:{axis:'both', mode:'center'}}),'align instruction');
  expect(Object.isFrozen(dsl),'frozen DSL program');
});
test('B: §24 round trip — Plan -> compilePlanToDSL -> parseDSL -> validateDSL -> compileToIR (same ops + deps)', ()=>{
  const dsl=compilePlanToDSL(createPlan(B_INTENT, B_CTX));
  const parsed=parseDSL(JSON.stringify(dsl));
  expect(parsed.success, JSON.stringify(parsed.errors));
  const checked=validateDSL(parsed.program);
  expect(checked.valid, JSON.stringify(checked.errors));
  const ir=compileToIR(parsed.program);
  expect(ir.success, JSON.stringify(ir.errors));
  eq(ir.ir.map(n=>n.toolId).join(','),'T01,T07,T08','same operations as the Plan');
  eq(ir.ir[0].sourceRef,'step-1','create binds ref');
  eq(JSON.stringify(ir.ir[0].input), JSON.stringify({x:300,y:250,width:200,height:100,rx:12,ry:12}),'T01 input survives round trip');
  eq(JSON.stringify(ir.ir[1].targets), JSON.stringify(['step-1']),'T07 depends on create output');
  eq(JSON.stringify(ir.ir[1].input.fill), JSON.stringify({kind:'solid', color:{r:255,g:0,b:0,a:1}}),'canonical RGB fill (deviation 4)');
  eq(JSON.stringify(ir.ir[2].targets), JSON.stringify(['step-1']),'T08 depends on create output');
  eq(ir.ir[2].input.axis,'both','axis'); eq(ir.ir[2].input.mode,'center','mode');
});
test('B: ellipse plan compiles to create/ellipse with cx/cy/rx/ry', ()=>{
  const dsl=compilePlanToDSL(createPlan({type:'create', objectType:'ellipse', rx:50, ry:30, fill:'#00FF00', placement:'center'}, B_CTX));
  eq(JSON.stringify(dsl.program[0]), JSON.stringify({op:'create', id:'step-1', type:'ellipse', args:{cx:400, cy:300, rx:50, ry:30}}),'ellipse create instruction');
  const parsed=parseDSL(JSON.stringify(dsl));
  expect(parsed.success, JSON.stringify(parsed.errors));
  const ir=compileToIR(parsed.program);
  expect(ir.success, JSON.stringify(ir.errors));
  eq(ir.ir.map(n=>n.toolId).join(','),'T02,T07,T08','ellipse tool chain');
});
test('B: compilePlanToDSL guards — unknown toolId, non-solid fill, empty T07, missing objectIds, invalid plan', ()=>{
  // Guard fixtures keep dependency references VALID (a prior T01 step) so the
  // intended per-step guards trigger instead of the §18 reference check.
  const es=createExpectedState({type:'appearance', targets:['x'], fill:'#FF0000'});
  const mk=(steps)=>makePlan({intent:{type:'appearance', targets:['x'], fill:'#FF0000'}, steps, expectedState:es});
  const withCreate=()=>[makePlanStep('step-1','T01',{width:1, height:1})];
  expect(isPlanningErrorWith(()=>compilePlanToDSL(mk([makePlanStep('step-1','T99',{})])),'UNSUPPORTED_OPERATION'),'unknown toolId');
  expect(isPlanningErrorWith(()=>compilePlanToDSL(mk([...withCreate(), makePlanStep('step-2','T07',{objectIds:['$step-1'], fill:{kind:'linear', color:'#FF0000'}})])),'INVALID_PARAMETER'),'non-solid fill');
  expect(isPlanningErrorWith(()=>compilePlanToDSL(mk([...withCreate(), makePlanStep('step-2','T07',{objectIds:['$step-1']})])),'INVALID_PARAMETER'),'T07 without fill/opacity');
  expect(isPlanningErrorWith(()=>compilePlanToDSL(mk([...withCreate(), makePlanStep('step-2','T07',{fill:{kind:'solid', color:'#FF0000'}})])),'INVALID_PARAMETER'),'T07 without objectIds');
  expect(isPlanningErrorWith(()=>compilePlanToDSL(mk([])),'PLAN_INVALID'),'empty steps');
});

console.log('=== Checkpoint B: §16 determinism proof (mandatory) ===');
test('B: same intent + same context, two runs -> ExpectedState JSON.stringify byte-identical', ()=>{
  const a=createExpectedState(B_INTENT, B_CTX);
  const b=createExpectedState(B_INTENT, B_CTX);
  eq(JSON.stringify(a), JSON.stringify(b),'byte-identical ExpectedState');
});
test('B: same intent + same context, two runs -> Plan JSON.stringify byte-identical (no Date.now/Math.random/randomUUID)', ()=>{
  const a=createPlan(B_INTENT, B_CTX);
  const b=createPlan(B_INTENT, B_CTX);
  eq(JSON.stringify(a), JSON.stringify(b),'byte-identical Plan');
  eq(a.id, b.id,'plan id derived from content, not entropy');
});
test('B: same intent + same context, two runs -> compiled DSL JSON.stringify byte-identical', ()=>{
  const a=compilePlanToDSL(createPlan(B_INTENT, B_CTX));
  const b=compilePlanToDSL(createPlan(B_INTENT, B_CTX));
  eq(JSON.stringify(a), JSON.stringify(b),'byte-identical DSL');
});
test('B: key-order-permuted intent -> identical intentId/plan id (content-derived identity)', ()=>{
  const permuted={fill:'#FF0000', placement:'center', ry:12, rx:12, height:100, width:200, objectType:'rectangle', type:'create'};
  const p1=createPlan(B_INTENT, B_CTX);
  const p2=createPlan(permuted, B_CTX);
  eq(p1.intentId, p2.intentId,'intentId is key-order independent');
  eq(p1.id, p2.id,'plan id is key-order independent');
  eq(JSON.stringify(p1), JSON.stringify(p2),'full plan byte-identical across key order');
});

// ============================================================================
// PHASE 3.13 — CHECKPOINT C: PLANNING RULES E/F/G/H (spec §17-E..H, §41-C).
// Rules E-H operate on objects that ALREADY EXIST: their identities come from
// the §13 PlanningContext snapshot (context.objects: plain object map keyed by
// object id). Plan steps reference such objects as '$doc:<objectId>' — the
// second plan-level reference kind beside '$stepId' (step output). Tool
// selection mirrors the live registry: E -> T05/T06, F -> T07, G -> T08,
// H -> T10/T11 (§11: use ONLY existing tools; no duplicates, no renames).
// ============================================================================

console.log('=== Checkpoint C: fixtures (§13 snapshot with known object ids — declared with the B fixtures above) ===');

console.log('=== Checkpoint C: Rule E — Transform (§17-E) ===');
test('C-E: translate -> single T05 move_object step with $doc: refs + finite delta (tools.js:308-325)', ()=>{
  const plan=createPlan(T_INTENT, C_CTX);
  eq(plan.steps.length,1,'one step');
  eq(plan.steps[0].id,'step-1','step id'); eq(plan.steps[0].toolId,'T05','T05 move_object');
  eq(JSON.stringify(plan.steps[0].input), JSON.stringify({objectIds:['$doc:rect-1'], delta:{x:10,y:-5}}),'T05 input (delta Vec2, tools.js:312)');
  expect(Object.isFrozen(plan),'frozen plan');
  expect(Object.isFrozen(plan.steps[0].input),'frozen step input');
});
test('C-E: multi-target translate -> ONE T05 step carrying all targets (T05 objectIds is array-capable, tools.js:309)', ()=>{
  const plan=createPlan({...T_INTENT, targets:['rect-1','rect-2']}, C_CTX);
  eq(plan.steps.length,1,'one step for all targets');
  eq(JSON.stringify(plan.steps[0].input.objectIds), JSON.stringify(['$doc:rect-1','$doc:rect-2']),'both targets referenced');
});
test('C-E: scale -> T06 with the diagonal matrix resolved at plan time (mirrors dsl.js:420-424)', ()=>{
  const plan=createPlan({type:'transform', targets:['rect-1'], operation:'scale', params:{x:2, y:3}}, C_CTX);
  eq(plan.steps[0].toolId,'T06','T06 transform_objects');
  eq(JSON.stringify(plan.steps[0].input.transform), JSON.stringify({a:2,b:0,c:0,d:3,tx:0,ty:0}),'scale matrix');
});
test('C-E: rotate -> T06 with the origin-rotation matrix, EXACTLY the substrate expressions (dsl.js:425-428)', ()=>{
  const plan=createPlan({type:'transform', targets:['rect-1'], operation:'rotate', params:{degrees:90}}, C_CTX);
  const rad=(90*Math.PI)/180;
  eq(JSON.stringify(plan.steps[0].input.transform), JSON.stringify({a:Math.cos(rad), b:Math.sin(rad), c:-Math.sin(rad), d:Math.cos(rad), tx:0, ty:0}),'rotation about origin, tx/ty=0 (no invented semantics)');
});
test('C-E: matrix -> T06 passthrough of the validated affine matrix', ()=>{
  const plan=createPlan({type:'transform', targets:['rect-1'], operation:'matrix', params:{a:1.5,b:0.2,c:-0.2,d:1.2,tx:5,ty:-7}}, C_CTX);
  eq(plan.steps[0].toolId,'T06','T06');
  eq(JSON.stringify(plan.steps[0].input.transform), JSON.stringify({a:1.5,b:0.2,c:-0.2,d:1.2,tx:5,ty:-7}),'matrix passthrough');
});
test('C-E: unknown target -> INVALID_PARAMETER naming the target (Planner never guesses identities)', ()=>{
  expect(isPlanningErrorWith(()=>createPlan({...T_INTENT, targets:['ghost']}, C_CTX),'INVALID_PARAMETER'),'ghost target');
  expect(isPlanningErrorWith(()=>createPlan({...T_INTENT, targets:['rect-1','nope']}, C_CTX),'INVALID_PARAMETER'),'second target unknown');
});
test('C-E: missing context / context.objects missing or not a plain map -> MISSING_PARAMETER', ()=>{
  expect(isPlanningErrorWith(()=>createPlan(T_INTENT),'MISSING_PARAMETER'),'no context at all');
  expect(isPlanningErrorWith(()=>createPlan(T_INTENT, B_CTX),'MISSING_PARAMETER'),'B_CTX.objects is an array, not a map');
  expect(isPlanningErrorWith(()=>createPlan(T_INTENT, createPlanningContext({artboard:B_ARTBOARD})),'MISSING_PARAMETER'),'no objects key');
});
test('C-E: duplicate targets -> INVALID_PARAMETER (a duplicated target would double-apply the operation)', ()=>{
  expect(isPlanningErrorWith(()=>createPlan({...T_INTENT, targets:['rect-1','rect-1']}, C_CTX),'INVALID_PARAMETER'),'duplicate');
});
test('C-E: transform ExpectedState keeps geometry null (execution-dependent); plan validates against the snapshot', ()=>{
  const es=createExpectedState(T_INTENT, C_CTX);
  eq(es.geometry.width,null,'width null'); eq(es.geometry.area,null,'area null');
  eq(es.appearance.fill,null,'fill null'); eq(es.structure.grouped,null,'grouped null');
  const plan=createPlan(T_INTENT, C_CTX);
  eq(plan.intentId, es.intentId,'intentId matches');
  const r=validatePlan(plan, C_CTX);
  expect(r.valid, JSON.stringify(r.errors));
});
test('C-E: compilePlanToDSL -> the EXISTING transform op syntax for all four operations (§23: no second DSL)', ()=>{
  const t=compilePlanToDSL(createPlan(T_INTENT, C_CTX));
  eq(JSON.stringify(t.program[0]), JSON.stringify({op:'transform', targets:['rect-1'], args:{translate:{x:10,y:-5}}}),'translate');
  const s=compilePlanToDSL(createPlan({type:'transform', targets:['rect-1'], operation:'scale', params:{x:2,y:3}}, C_CTX));
  eq(JSON.stringify(s.program[0]), JSON.stringify({op:'transform', targets:['rect-1'], args:{matrix:{a:2,b:0,c:0,d:3,tx:0,ty:0}}}),'scale');
  const r=compilePlanToDSL(createPlan({type:'transform', targets:['rect-1'], operation:'rotate', params:{degrees:90}}, C_CTX));
  const rad=(90*Math.PI)/180;
  eq(JSON.stringify(r.program[0]), JSON.stringify({op:'transform', targets:['rect-1'], args:{matrix:{a:Math.cos(rad), b:Math.sin(rad), c:-Math.sin(rad), d:Math.cos(rad), tx:0, ty:0}}}),'rotate');
  const m=compilePlanToDSL(createPlan({type:'transform', targets:['rect-1'], operation:'matrix', params:{a:1.5,b:0.2,c:-0.2,d:1.2,tx:5,ty:-7}}, C_CTX));
  eq(JSON.stringify(m.program[0]), JSON.stringify({op:'transform', targets:['rect-1'], args:{matrix:{a:1.5,b:0.2,c:-0.2,d:1.2,tx:5,ty:-7}}}),'matrix');
});
test('C-E: IR round trip — parse + compileToIR yield T05/T06 with plan-matching inputs and targets', ()=>{
  const t=parseDSL(JSON.stringify(compilePlanToDSL(createPlan(T_INTENT, C_CTX))));
  expect(t.success, JSON.stringify(t.errors));
  const ir=compileToIR(t.program);
  expect(ir.success, JSON.stringify(ir.errors));
  eq(ir.ir.map(n=>n.toolId).join(','),'T05','same operation as the Plan');
  eq(JSON.stringify(ir.ir[0].input.delta), JSON.stringify({x:10,y:-5}),'T05 delta survives');
  eq(JSON.stringify(ir.ir[0].targets), JSON.stringify(['rect-1']),'T05 targets stripped of $doc:');
  const s=parseDSL(JSON.stringify(compilePlanToDSL(createPlan({type:'transform', targets:['rect-1'], operation:'scale', params:{x:2,y:3}}, C_CTX))));
  const sir=compileToIR(s.program);
  eq(sir.ir.map(n=>n.toolId).join(','),'T06','scale -> T06');
  eq(JSON.stringify(sir.ir[0].input.transform), JSON.stringify({a:2,b:0,c:0,d:3,tx:0,ty:0}),'T06 matrix survives');
});
test('C-E: substrate boundary PINNED — validateDSL flags doc-object targets as UNKNOWN_REFERENCE (analyzeReferences dsl.js:225-268 only knows program-internal refs; resolution is Checkpoint E agenda)', ()=>{
  const dsl=compilePlanToDSL(createPlan(T_INTENT, C_CTX));
  const parsed=parseDSL(JSON.stringify(dsl));
  expect(parsed.success, JSON.stringify(parsed.errors));
  const checked=validateDSL(parsed.program);
  expect(!checked.valid,'full validateDSL rejects standalone doc-referencing programs today');
  hasCode(checked,'DSL_UNKNOWN_REFERENCE','DSL_UNKNOWN_REFERENCE pins the §24 validate-DSL gap for E-H plans');
});
test('C-E: determinism — same intent + same context, two runs -> ExpectedState/Plan/DSL byte-identical (§16)', ()=>{
  const a=createPlan(T_INTENT, C_CTX), b=createPlan(T_INTENT, C_CTX);
  eq(JSON.stringify(a), JSON.stringify(b),'byte-identical Plan');
  eq(a.id, b.id,'content-derived plan id');
  eq(JSON.stringify(createExpectedState(T_INTENT, C_CTX)), JSON.stringify(createExpectedState(T_INTENT, C_CTX)),'byte-identical ExpectedState');
  eq(JSON.stringify(compilePlanToDSL(a)), JSON.stringify(compilePlanToDSL(b)),'byte-identical DSL');
});

console.log('=== Checkpoint C: Rule F — Appearance (§17-F) ===');
test('C-F: fill-only appearance -> single T07 step with the real T07 contract {kind:solid,color}', ()=>{
  const plan=createPlan({type:'appearance', targets:['rect-1'], fill:'#00FF00'}, C_CTX);
  eq(plan.steps.length,1,'one step'); eq(plan.steps[0].toolId,'T07','T07 apply_fill (fill never inside creation input)');
  eq(JSON.stringify(plan.steps[0].input), JSON.stringify({objectIds:['$doc:rect-1'], fill:{kind:'solid', color:'#00FF00'}}),'T07 input');
  eq(plan.expectedState.appearance.fill,'#00FF00','ExpectedState mirrors the requested fill');
});
test('C-F: fill + opacity -> both ride the T07 step (tools.js:370-374)', ()=>{
  const plan=createPlan({type:'appearance', targets:['rect-1'], fill:'#00FF00', opacity:0.5}, C_CTX);
  eq(JSON.stringify(plan.steps[0].input), JSON.stringify({objectIds:['$doc:rect-1'], fill:{kind:'solid', color:'#00FF00'}, opacity:0.5}),'fill + opacity');
});
test('C-F: opacity-only on an EXISTING object is plannable (unlike create: T07 fill-item precondition tools.js:377 is tool-level and CAN succeed here)', ()=>{
  const plan=createPlan({type:'appearance', targets:['rect-1'], opacity:0.25}, C_CTX);
  eq(plan.steps[0].toolId,'T07','T07');
  eq(JSON.stringify(plan.steps[0].input), JSON.stringify({objectIds:['$doc:rect-1'], opacity:0.25}),'opacity only');
});
test('C-F: multi-target appearance -> ONE T07 step PER target (DSL appearance op is single-target, dsl.js:114) — lossless mapping', ()=>{
  const plan=createPlan({type:'appearance', targets:['rect-1','rect-2'], fill:'#00FF00'}, C_CTX);
  eq(plan.steps.length,2,'per-target steps');
  eq(plan.steps[0].id,'step-1','step-1'); eq(plan.steps[1].id,'step-2','step-2');
  eq(JSON.stringify(plan.steps[0].input.objectIds), JSON.stringify(['$doc:rect-1']),'first target');
  eq(JSON.stringify(plan.steps[1].input.objectIds), JSON.stringify(['$doc:rect-2']),'second target');
});
test('C-F: unknown target -> INVALID_PARAMETER', ()=>{
  expect(isPlanningErrorWith(()=>createPlan({type:'appearance', targets:['ghost'], fill:'#00FF00'}, C_CTX),'INVALID_PARAMETER'),'ghost');
});
test('C-F: compilePlanToDSL -> per-target appearance instructions (§23 syntax)', ()=>{
  const one=compilePlanToDSL(createPlan({type:'appearance', targets:['rect-1'], fill:'#00FF00'}, C_CTX));
  eq(JSON.stringify(one.program[0]), JSON.stringify({op:'appearance', target:'rect-1', args:{fill:'#00FF00'}}),'single');
  const two=compilePlanToDSL(createPlan({type:'appearance', targets:['rect-1','rect-2'], fill:'#00FF00', opacity:0.5}, C_CTX));
  eq(two.program.length,2,'per-target instructions');
  eq(JSON.stringify(two.program[0]), JSON.stringify({op:'appearance', target:'rect-1', args:{fill:'#00FF00', opacity:0.5}}),'first');
  eq(JSON.stringify(two.program[1]), JSON.stringify({op:'appearance', target:'rect-2', args:{fill:'#00FF00', opacity:0.5}}),'second');
});
test('C-F: IR round trip — T07 chain with canonical RGB fill (deviation 4)', ()=>{
  const p=parseDSL(JSON.stringify(compilePlanToDSL(createPlan({type:'appearance', targets:['rect-1','rect-2'], fill:'#00FF00', opacity:0.5}, C_CTX))));
  expect(p.success, JSON.stringify(p.errors));
  const ir=compileToIR(p.program);
  expect(ir.success, JSON.stringify(ir.errors));
  eq(ir.ir.map(n=>n.toolId).join(','),'T07,T07','same operations as the Plan');
  eq(JSON.stringify(ir.ir[0].input.fill), JSON.stringify({kind:'solid', color:{r:0,g:255,b:0,a:1}}),'canonical RGB');
  eq(ir.ir[0].input.opacity,0.5,'opacity survives');
  eq(JSON.stringify(ir.ir[1].targets), JSON.stringify(['rect-2']),'second target');
});
test('C-F: determinism — two runs byte-identical (§16)', ()=>{
  const i={type:'appearance', targets:['rect-1','rect-2'], fill:'#00FF00', opacity:0.5};
  const a=createPlan(i, C_CTX), b=createPlan(i, C_CTX);
  eq(JSON.stringify(a), JSON.stringify(b),'byte-identical Plan');
  eq(JSON.stringify(compilePlanToDSL(a)), JSON.stringify(compilePlanToDSL(b)),'byte-identical DSL');
});

console.log('=== Checkpoint C: Rule G — Alignment (§17-G) ===');
test('C-G: alignment -> ONE T08 step, axis/mode passthrough (T08 + DSL align are array-capable, dsl.js:139-142)', ()=>{
  const plan=createPlan({type:'alignment', targets:['rect-1','rect-2'], axis:'horizontal', mode:'center'}, C_CTX);
  eq(plan.steps.length,1,'one step'); eq(plan.steps[0].toolId,'T08','T08 align_objects (§17-G)');
  eq(JSON.stringify(plan.steps[0].input), JSON.stringify({objectIds:['$doc:rect-1','$doc:rect-2'], axis:'horizontal', mode:'center'}),'T08 input');
  eq(plan.expectedState.spatial.aligned,true,'ExpectedState.spatial.aligned');
});
test('C-G: single-target align allowed (documented no-op success precedent, tools.js:393-395)', ()=>{
  const plan=createPlan({type:'alignment', targets:['rect-1'], axis:'both', mode:'center'}, C_CTX);
  eq(plan.steps.length,1,'one step'); eq(plan.steps[0].input.axis,'both','axis'); eq(plan.steps[0].input.mode,'center','mode');
});
test('C-G: invalid axis/mode combination rejected at intent level (top-level INVALID_INTENT, Checkpoint A contract)', ()=>{
  expect(isPlanningErrorWith(()=>createPlan({type:'alignment', targets:['rect-1'], axis:'horizontal', mode:'top'}, C_CTX),'INVALID_INTENT'),'H/top');
  let err=null;
  try { createPlan({type:'alignment', targets:['rect-1'], axis:'horizontal', mode:'top'}, C_CTX); } catch(e){ err=e; }
  expect(err && Array.isArray(err.details) && err.details.some(x=>x.code==='INVALID_PARAMETER'),'specific code in details');
});
test('C-G: compilePlanToDSL -> align instruction + IR round trip T08', ()=>{
  const dsl=compilePlanToDSL(createPlan({type:'alignment', targets:['rect-1','rect-2'], axis:'horizontal', mode:'center'}, C_CTX));
  eq(JSON.stringify(dsl.program[0]), JSON.stringify({op:'align', targets:['rect-1','rect-2'], args:{axis:'horizontal', mode:'center'}}),'align instruction');
  const p=parseDSL(JSON.stringify(dsl));
  expect(p.success, JSON.stringify(p.errors));
  const ir=compileToIR(p.program);
  eq(ir.ir.map(n=>n.toolId).join(','),'T08','same operation');
  eq(JSON.stringify(ir.ir[0].input), JSON.stringify({objectIds:[], axis:'horizontal', mode:'center'}),'T08 input');
  eq(JSON.stringify(ir.ir[0].targets), JSON.stringify(['rect-1','rect-2']),'targets');
});
test('C-G: determinism — two runs byte-identical (§16)', ()=>{
  const i={type:'alignment', targets:['rect-1','rect-2'], axis:'both', mode:'center'};
  const a=createPlan(i, C_CTX), b=createPlan(i, C_CTX);
  eq(JSON.stringify(a), JSON.stringify(b),'byte-identical Plan');
  eq(JSON.stringify(compilePlanToDSL(a)), JSON.stringify(compilePlanToDSL(b)),'byte-identical DSL');
});

console.log('=== Checkpoint C: Rule H — Structure (§17-H) ===');
test('C-H: group 2 targets -> ONE T10 step (T10 objectIds>=2, tools.js:490)', ()=>{
  const plan=createPlan({type:'structure', operation:'group', targets:['rect-1','rect-2']}, C_CTX);
  eq(plan.steps.length,1,'one step'); eq(plan.steps[0].toolId,'T10','T10 group_objects');
  eq(JSON.stringify(plan.steps[0].input), JSON.stringify({objectIds:['$doc:rect-1','$doc:rect-2']}),'T10 input');
  eq(plan.expectedState.structure.grouped,true,'ExpectedState.structure.grouped');
});
test('C-H: group 3 targets -> one step, three $doc refs', ()=>{
  const ctx3=createPlanningContext({artboard:B_ARTBOARD, objects:{'a':{}, 'b':{}, 'c':{}}});
  const plan=createPlan({type:'structure', operation:'group', targets:['a','b','c']}, ctx3);
  eq(plan.steps.length,1,'one step');
  eq(JSON.stringify(plan.steps[0].input.objectIds), JSON.stringify(['$doc:a','$doc:b','$doc:c']),'three refs');
});
test('C-H: group with 1 target -> NO_VALID_PLAN (approved decision (a): a plan that cannot succeed must not be produced; T10 needs >=2)', ()=>{
  expect(isPlanningErrorWith(()=>createPlan({type:'structure', operation:'group', targets:['rect-1']}, C_CTX),'NO_VALID_PLAN'),'single-target group');
});
test('C-H: ungroup 1 target -> ONE T11 step (T11 inputs are group node ids, tools.js:517-525)', ()=>{
  const plan=createPlan({type:'structure', operation:'ungroup', targets:['rect-1']}, C_CTX);
  eq(plan.steps.length,1,'one step'); eq(plan.steps[0].toolId,'T11','T11 ungroup_objects');
  eq(JSON.stringify(plan.steps[0].input), JSON.stringify({objectIds:['$doc:rect-1']}),'T11 input');
  eq(plan.expectedState.structure.grouped,false,'grouped=false');
});
test('C-H: ungroup 2 targets -> TWO T11 steps (DSL ungroup is single-target, dsl.js:121) — lossless', ()=>{
  const plan=createPlan({type:'structure', operation:'ungroup', targets:['rect-1','rect-2']}, C_CTX);
  eq(plan.steps.length,2,'per-target steps');
  eq(plan.steps[0].toolId,'T11','T11'); eq(plan.steps[1].toolId,'T11','T11');
  eq(JSON.stringify(plan.steps[0].input.objectIds), JSON.stringify(['$doc:rect-1']),'first');
  eq(JSON.stringify(plan.steps[1].input.objectIds), JSON.stringify(['$doc:rect-2']),'second');
});
test('C-H: unknown target / duplicate targets -> INVALID_PARAMETER', ()=>{
  expect(isPlanningErrorWith(()=>createPlan({type:'structure', operation:'group', targets:['rect-1','ghost']}, C_CTX),'INVALID_PARAMETER'),'ghost');
  expect(isPlanningErrorWith(()=>createPlan({type:'structure', operation:'ungroup', targets:['rect-1','rect-1']}, C_CTX),'INVALID_PARAMETER'),'duplicate');
});
test('C-H: compilePlanToDSL -> group/ungroup instructions + IR round trip T10/T11', ()=>{
  const g=compilePlanToDSL(createPlan({type:'structure', operation:'group', targets:['rect-1','rect-2']}, C_CTX));
  eq(JSON.stringify(g.program[0]), JSON.stringify({op:'group', targets:['rect-1','rect-2']}),'group instruction (no args)');
  const u=compilePlanToDSL(createPlan({type:'structure', operation:'ungroup', targets:['rect-1']}, C_CTX));
  eq(JSON.stringify(u.program[0]), JSON.stringify({op:'ungroup', target:'rect-1'}),'ungroup instruction (single target)');
  const pg=parseDSL(JSON.stringify(g));
  expect(pg.success, JSON.stringify(pg.errors));
  const irg=compileToIR(pg.program);
  eq(irg.ir.map(n=>n.toolId).join(','),'T10','group -> T10');
  eq(JSON.stringify(irg.ir[0].targets), JSON.stringify(['rect-1','rect-2']),'group targets');
  const pu=parseDSL(JSON.stringify(u));
  expect(pu.success, JSON.stringify(pu.errors));
  const iru=compileToIR(pu.program);
  eq(iru.ir.map(n=>n.toolId).join(','),'T11','ungroup -> T11');
  eq(JSON.stringify(iru.ir[0].targets), JSON.stringify(['rect-1']),'ungroup target');
});
test('C-H: determinism — two runs byte-identical (§16)', ()=>{
  const i={type:'structure', operation:'group', targets:['rect-1','rect-2']};
  const a=createPlan(i, C_CTX), b=createPlan(i, C_CTX);
  eq(JSON.stringify(a), JSON.stringify(b),'byte-identical Plan');
  eq(JSON.stringify(compilePlanToDSL(a)), JSON.stringify(compilePlanToDSL(b)),'byte-identical DSL');
});

console.log('=== Checkpoint C: $doc: reference convention in validatePlan (§18 extension) ===');
test('C-X: $doc: ref to an object missing from the snapshot -> PLAN_INVALID naming the ref', ()=>{
  const es=createExpectedState({type:'appearance', targets:['rect-1'], fill:'#FF0000'});
  const plan=makePlan({intent:{type:'appearance', targets:['rect-1'], fill:'#FF0000'}, steps:[makePlanStep('step-1','T07',{objectIds:['$doc:ghost'], fill:{kind:'solid', color:'#FF0000'}})], expectedState:es});
  const r=validatePlan(plan, C_CTX);
  expect(!r.valid,'must fail'); hasCode(r,'PLAN_INVALID','unknown doc ref');
  expect(r.errors.some(e=>/PlanningContext\.objects/.test(e.message)),'message names the snapshot map');
});
test('C-X: $doc: refs WITHOUT a context cannot resolve -> PLAN_INVALID (strict, never silently skipped)', ()=>{
  const es=createExpectedState({type:'appearance', targets:['rect-1'], fill:'#FF0000'});
  const plan=makePlan({intent:{type:'appearance', targets:['rect-1'], fill:'#FF0000'}, steps:[makePlanStep('step-1','T07',{objectIds:['$doc:rect-1'], fill:{kind:'solid', color:'#FF0000'}})], expectedState:es});
  const r=validatePlan(plan);
  expect(!r.valid,'must fail'); hasCode(r,'PLAN_INVALID','no context');
  expect(r.errors.some(e=>/snapshot/.test(e.message)),'message asks for the snapshot');
});
test('C-X: resolvable $doc: refs validate clean; $step refs unaffected (both kinds coexist)', ()=>{
  const es=createExpectedState({type:'appearance', targets:['rect-1'], fill:'#FF0000'});
  const plan=makePlan({intent:{type:'appearance', targets:['rect-1'], fill:'#FF0000'}, steps:[makePlanStep('step-1','T07',{objectIds:['$doc:rect-1'], fill:{kind:'solid', color:'#FF0000'}})], expectedState:es});
  expect(validatePlan(plan, C_CTX).valid,'doc ref resolves');
});

// ============================================================================
// PHASE 3.13 — CHECKPOINT D: TOOL REGISTRY INTEGRATION (spec §41-D).
// Targets: every PlanStep.toolId resolves through the live Tool Registry;
// tool category validation (read/proposal/mutation); input validation against
// the tool's DECLARED inputSchema; mutation tools may be planned but MUST NOT
// execute during planning; the registry is read-only from the Planner's
// perspective. RED-first: every assertion below fails against Checkpoint C
// code (validatePlan/createPlan ignore the registry argument, no resolution,
// no category check, no schema check, no read-only projection export).
// ============================================================================

console.log('=== Checkpoint D: fixtures (spec §41-D) ===');
// Namespace import: D asserts on the new export surface (getPlannerRegistry)
// without an ESM named import — a missing named export would SyntaxError the
// whole file at load time and yield ZERO counted RED failures, while the
// namespace form produces one behavioral failure per assertion.
import * as AI_NS from '../src-js/ai.js';

const D_CTX=createPlanningContext({
  artboard:B_ARTBOARD,
  objects:{ 'doc-rect':{objectType:'rect'}, 'doc-ellipse':{objectType:'ellipse'} }
});
// One fixture per planning rule family (B: create A-D; C: transform E,
// appearance F, alignment G, structure H) so registry integration is proven
// over EVERY toolId the Planner can emit: T01, T02, T05, T06, T07, T08, T10, T11.
const D_INTENTS=[
  {type:'create', objectType:'rectangle', width:120, height:80, fill:'#00FF00'},
  {type:'create', objectType:'ellipse', rx:40, ry:30, fill:'#0000FF'},
  {type:'transform', targets:['doc-rect'], operation:'translate', params:{x:10, y:-5}},
  {type:'transform', targets:['doc-rect'], operation:'scale', params:{x:2, y:3}},
  {type:'transform', targets:['doc-rect'], operation:'rotate', params:{degrees:90}},
  {type:'appearance', targets:['doc-rect'], fill:'#123456', opacity:0.5},
  {type:'alignment', targets:['doc-rect','doc-ellipse'], axis:'horizontal', mode:'center'},
  {type:'structure', operation:'group', targets:['doc-rect','doc-ellipse']},
  {type:'structure', operation:'ungroup', targets:['doc-rect']}
];
// Spy registry facade: has/get/list count consultations (proof that the
// Planner genuinely RESOLVES through the registry); every mutation or
// execution entry point of the real registry facade is an explicit tripwire —
// a single Planner call would throw and fail the test (spec §41-D boundary).
function makeSpyRegistry(){
  const calls={ has:0, get:0, list:0 };
  const live=()=>AI_NS.getPlannerRegistry();
  return {
    calls,
    has(id){ calls.has++; return live().has(id); },
    get(id){ calls.get++; return live().get(id); },
    list(){ calls.list++; return live().list(); },
    validate(){ throw new Error('PLANNER CALLED registry.validate — schema validation must read the DECLARED inputSchema, never tool behavior'); },
    execute(){ throw new Error('PLANNER EXECUTED A TOOL DURING PLANNING (spec §41-D mutation boundary)'); },
    register(){ throw new Error('PLANNER MUTATED THE REGISTRY (read-only mandate)'); },
    unregister(){ throw new Error('PLANNER MUTATED THE REGISTRY (read-only mandate)'); }
  };
}
function makeDPlan(toolId, input){
  const intent={type:'appearance', targets:['doc-rect'], fill:'#FF0000'};
  return makePlan({ intent, steps:[makePlanStep('step-1', toolId, input)], expectedState:createExpectedState(intent) });
}

test('D-1: every toolId of every planner-generated plan resolves in the live Tool Registry (resolution mandate)', ()=>{
  const reg=AI_NS.getPlannerRegistry();
  expect(reg && typeof reg.has==='function' && typeof reg.get==='function' && typeof reg.list==='function',
    'getPlannerRegistry must expose the read-only {has,get,list} facade');
  for(const intent of D_INTENTS){
    const plan=createPlan(intent, D_CTX);
    for(const step of plan.steps){
      expect(reg.has(step.toolId), `step '${step.id}': toolId '${step.toolId}' does not resolve (intent ${intent.type})`);
      const tool=reg.get(step.toolId);
      expect(tool && tool.id===step.toolId, `resolved definition must match '${step.toolId}'`);
    }
    const v=validatePlan(plan, D_CTX);
    expect(v.valid, `${intent.type}: ${JSON.stringify(v.errors)}`);
  }
});
test('D-2: unknown toolId -> TOOL_NOT_FOUND in the validatePlan verdict', ()=>{
  const r=validatePlan(makeDPlan('T99', {objectIds:['$doc:doc-rect'], fill:{kind:'solid', color:'#FF0000'}}), D_CTX);
  expect(!r.valid, 'plan referencing T99 must be invalid');
  hasCode(r, 'TOOL_NOT_FOUND', 'T99 must not resolve');
  expect(r.errors.some(e=>e.code==='TOOL_NOT_FOUND' && e.details && e.details.toolId==='T99'), 'error details must name the unresolved toolId');
});
test('D-3: category validation — read (T16) / proposal (T19) tools are NOT plannable (Planner rule, revisitable)', ()=>{
  const r1=validatePlan(makeDPlan('T16', {role:'background'}), D_CTX);
  expect(!r1.valid, 'read tool step must be rejected'); hasCode(r1, 'PLAN_INVALID', 'read tool step');
  const e1=r1.errors.find(e=>e.code==='PLAN_INVALID' && e.details && e.details.rule==='plan-steps-must-target-mutation-tools');
  expect(e1 && /read/.test(e1.message), 'rule error must name the read category — got '+JSON.stringify(r1.errors));
  const r2=validatePlan(makeDPlan('T19', {objectIds:['$doc:doc-rect']}), D_CTX);
  expect(!r2.valid, 'proposal tool step must be rejected'); hasCode(r2, 'PLAN_INVALID', 'proposal tool step');
  const e2=r2.errors.find(e=>e.code==='PLAN_INVALID' && e.details && e.details.rule==='plan-steps-must-target-mutation-tools');
  expect(e2 && /proposal/.test(e2.message), 'rule error must name the proposal category — got '+JSON.stringify(r2.errors));
});
test('D-4: input validation against the tool DECLARED inputSchema (missing key / wrong type / non-finite / object type)', ()=>{
  const r1=validatePlan(makeDPlan('T01', {height:10}), D_CTX);                       // T01 requires width+height (tools.js:227)
  expect(!r1.valid, 'missing required width'); hasCode(r1, 'TOOL_INPUT_INVALID', 'missing required width');
  expect(r1.errors.some(e=>/width/.test(e.message)), 'error must name the missing key');
  const r2=validatePlan(makeDPlan('T01', {width:'200', height:10}), D_CTX);          // declared {type:'number'}
  expect(!r2.valid, 'string width'); hasCode(r2, 'TOOL_INPUT_INVALID', 'string width');
  const r3=validatePlan(makeDPlan('T02', {rx:NaN, ry:30}), D_CTX);                   // JSON number = finite number (§16 hygiene)
  expect(!r3.valid, 'NaN rx'); hasCode(r3, 'TOOL_INPUT_INVALID', 'NaN rx');
  const r4=validatePlan(makeDPlan('T05', {objectIds:['$doc:doc-rect'], delta:'nope'}), D_CTX); // delta {type:'object'} (tools.js:309)
  expect(!r4.valid, 'string delta'); hasCode(r4, 'TOOL_INPUT_INVALID', 'delta must match declared object type');
  const r5=validatePlan(makeDPlan('T08', {objectIds:['$doc:doc-rect'], axis:'horizontal'}), D_CTX); // T08 requires axis+mode (tools.js:389)
  expect(!r5.valid, 'missing required mode'); hasCode(r5, 'TOOL_INPUT_INVALID', 'missing required mode');
});
test('D-5: undeclared-but-accepted inputs stay valid (live schemas under-declare executor params; tools.js:232/240)', ()=>{
  const intent={type:'create', objectType:'rectangle', width:200, height:100};
  const es=createExpectedState(intent);
  const plan=makePlan({intent, steps:[makePlanStep('step-1','T01',{x:300, y:250, width:200, height:100, rx:12, ry:12})], expectedState:es});
  const spy=makeSpyRegistry();
  const v=validatePlan(plan, D_CTX, spy);
  expect(v.valid, 'x/y/rx/ry are not declared by T01.inputSchema but the tool accepts them — additional properties allowed: '+JSON.stringify(v.errors));
  expect(spy.calls.get+spy.calls.has>0, 'schema-validated plan must still resolve through the registry');
});
test('D-6: mutation tools are planned but NEVER executed during planning (spec §41-D boundary)', ()=>{
  for(const intent of D_INTENTS){
    const spy=makeSpyRegistry();
    const plan=createPlan(intent, D_CTX, spy);        // generation must not execute
    const v=validatePlan(plan, D_CTX, spy);           // validation must not execute
    expect(v.valid, `${intent.type}: ${JSON.stringify(v.errors)}`);
    const dsl=compilePlanToDSL(plan);                 // compilation must not execute
    expect(dsl && Array.isArray(dsl.program) && dsl.program.length===plan.steps.length, `${intent.type}: pipeline completes without executing any tool`);
    expect(spy.calls.get+spy.calls.has>0, `${intent.type}: resolution must consult the registry facade`);
  }
});
test('D-7: registry is read-only from the Planner perspective (frozen projection + frozen defs + unchanged metadata)', ()=>{
  const reg=AI_NS.getPlannerRegistry();
  expect(Object.isFrozen(reg), 'the Planner-reachable registry handle must be frozen');
  eq(Object.keys(reg).sort().join(','), 'get,has,list', 'no execute/validate/register/unregister on the Planner handle');
  expect(Object.isFrozen(reg.get('T01')), 'registry definitions are deep-frozen at registration (tools.js:1025)');
  const snap=()=>JSON.stringify(reg.list().map(t=>({id:t.id, name:t.name, category:t.category, inputSchema:t.inputSchema})));
  const before=snap();
  for(const intent of D_INTENTS){
    validatePlan(createPlan(intent, D_CTX), D_CTX);
  }
  eq(snap(), before, 'planning must not alter registry metadata');
});
test('D-8: registry injection is pure DI — identical output, determinism preserved (§16)', ()=>{
  const a=D_INTENTS.map(i=>JSON.stringify(createPlan(i, D_CTX)));
  const spies=D_INTENTS.map(()=>makeSpyRegistry());
  const b=D_INTENTS.map((i,idx)=>JSON.stringify(createPlan(i, D_CTX, spies[idx])));
  eq(JSON.stringify(a), JSON.stringify(b), 'injected registry must not alter plan output');
  expect(spies.every(s=>s.calls.get+s.calls.has>0), 'createPlan post-condition must consult the injected registry');
  const c=D_INTENTS.map(i=>JSON.stringify(createPlan(i, D_CTX)));
  eq(JSON.stringify(a), JSON.stringify(c), 'same input + same context -> byte-identical plans across runs (§16)');
});
test('D-9: registry-contract diagnostics — unknown category / missing inputSchema / malformed facade fail loudly', ()=>{
  const live=AI_NS.getPlannerRegistry();
  const synth=(over)=>Object.assign({
    id:'TX9', name:'synthetic', version:'1.0.0', category:'read', description:'',
    inputSchema:{type:'object', required:[], properties:{}}, outputSchema:{type:'object', properties:{}},
    permissions:{read:[], write:[]}, deterministic:true,
    validate:()=>({valid:true, errors:[]}), execute:()=>({success:true, output:{}})
  }, over);
  const regUnknownCat={ has:id=> id==='TX9' || live.has(id), get:id=> id==='TX9' ? synth({category:'quantum'}) : live.get(id), list:()=>live.list() };
  const r1=validatePlan(makeDPlan('TX9', {role:'x'}), D_CTX, regUnknownCat);
  expect(!r1.valid, 'unknown category must be rejected'); hasCode(r1, 'TOOL_REGISTRY_INVALID', 'unknown category');
  const regNoSchema={ has:regUnknownCat.has, get:id=> id==='TX9' ? synth({inputSchema:undefined}) : live.get(id), list:()=>live.list() };
  const r2=validatePlan(makeDPlan('TX9', {role:'x'}), D_CTX, regNoSchema);
  expect(!r2.valid, 'missing declared inputSchema must be rejected'); hasCode(r2, 'TOOL_REGISTRY_INVALID', 'missing inputSchema');
  let threw=null; try{ validatePlan(makeDPlan('T01', {width:1, height:1}), D_CTX, {has:()=>true}); }catch(e){ threw=e; }
  expect(threw instanceof PlanningError && threw.code==='INVALID_PARAMETER', 'facade without get/list must throw PlanningError(INVALID_PARAMETER) — got '+(threw && threw.code));
});

// ============================================================================
// PHASE 3.13 — CHECKPOINT E: DSL/IR INTEGRATION + SUBSTRATE EXTENSION
// (user-approved Option A, executed here). The substrate reference model gains
// an OPTIONAL context: analyzeReferences / validateSemantics / validateDSL /
// compileToIR / compileDSL accept a trailing context parameter. When present
// AND carrying a usable context.objects map (plain object keyed by known
// object id — the §13 snapshot contract), targets naming EXISTING document
// objects resolve as '$doc:' references (the Planner-level reference kind,
// ai.js:718-762), via OWN-PROPERTY reads only (prototype-safe, ai.js:744).
// When the context is ABSENT (or carries no usable objects map) NOTHING
// resolves: '$doc:' stays DSL_UNKNOWN_REFERENCE — the pre-E behavior pinned by
// the C-E boundary test above, which therefore remains true unmodified.
// RED-first ledger: E-1/E-2/E-7/E-8 and the four E-H round trips FAIL against
// Checkpoint D code (the extra argument is ignored -> unknown-ref errors).
// E-3/E-4/E-5/E-6/E-9/E-10 and the create round trips PIN pre-existing
// behavior (context-absent arms, strict gating, threading neutrality) and are
// expected green already in the RED run — disclosed, not silently counted.
// ============================================================================

console.log('=== Checkpoint E: substrate extension — analyzeReferences(program, context?) ===');
test('E-1: $doc:<id> literal targets resolve through context.objects (own-key check)', ()=>{
  const prog={version:'1.0', instructions:[{op:'appearance', target:'$doc:rect-1', args:{fill:'#00FF00'}, sourceIndex:0}]};
  const withoutCtx=analyzeReferences(prog);
  eq(withoutCtx.errors.length,1,'context absent: exactly the unknown-reference error');
  eq(withoutCtx.errors[0].code,'DSL_UNKNOWN_REFERENCE','context absent: unknown ref');
  const withCtx=analyzeReferences(prog, C_CTX);
  eq(withCtx.errors.length,0,'context present: $doc:rect-1 resolves — '+JSON.stringify(withCtx.errors));
  expect(withCtx.analysis.used.has('$doc:rect-1'),'used set intact');
});
test('E-2: raw-id targets (the Planner-stripped form, ai.js:1237) resolve through context.objects', ()=>{
  const prog={version:'1.0', instructions:[{op:'transform', targets:['rect-1','rect-2'], args:{translate:{x:1,y:1}}, sourceIndex:0}]};
  const withCtx=analyzeReferences(prog, C_CTX);
  eq(withCtx.errors.length,0,'both raw doc ids resolve — '+JSON.stringify(withCtx.errors));
  eq(withCtx.warnings.length,0,'no warnings for resolved doc refs');
});
test('E-3: context ABSENT -> $doc: and raw ids stay DSL_UNKNOWN_REFERENCE (pre-E behavior pinned)', ()=>{
  const doc={version:'1.0', instructions:[{op:'appearance', target:'$doc:rect-1', args:{fill:'#00FF00'}, sourceIndex:0}]};
  const raw={version:'1.0', instructions:[{op:'transform', targets:['rect-1'], args:{translate:{x:1,y:1}}, sourceIndex:0}]};
  eq(analyzeReferences(doc).errors[0].code,'DSL_UNKNOWN_REFERENCE','$doc: unknown without context');
  eq(analyzeReferences(raw).errors[0].code,'DSL_UNKNOWN_REFERENCE','raw id unknown without context');
  expect(!validateDSL(doc).valid,'validateDSL context-less rejects $doc: programs');
  expect(!validateDSL(raw).valid,'validateDSL context-less rejects raw-id programs');
});
test('E-4: with a context present, targets NOT in context.objects stay unknown (fail-loud; the substrate never guesses — §24 analog)', ()=>{
  const ghost={version:'1.0', instructions:[{op:'transform', targets:['ghost'], args:{translate:{x:1,y:1}}, sourceIndex:0}]};
  const r=analyzeReferences(ghost, C_CTX);
  eq(r.errors.length,1,'ghost stays unknown even with a context — '+JSON.stringify(r.errors));
  eq(r.errors[0].code,'DSL_UNKNOWN_REFERENCE','unknown ref');
  const mixed={version:'1.0', instructions:[{op:'transform', targets:['rect-1','ghost'], args:{translate:{x:1,y:1}}, sourceIndex:0}]};
  const rm=analyzeReferences(mixed, C_CTX);
  eq(rm.errors.length,1,'known target resolves, unknown still errors');
  eq(rm.errors[0].ref,'ghost','error names the unknown ref');
});
test('E-5: prototype-safe reads — $doc:toString / $doc:constructor / __proto__ never resolve (own-property only, mirrors ai.js:744)', ()=>{
  const mk=(t)=>({version:'1.0', instructions:[{op:'appearance', target:t, args:{fill:'#00FF00'}, sourceIndex:0}]});
  eq(analyzeReferences(mk('$doc:toString'), C_CTX).errors.length,1,'toString is not an own key -> unknown');
  eq(analyzeReferences(mk('$doc:constructor'), C_CTX).errors.length,1,'constructor is not an own key -> unknown');
  const raw={version:'1.0', instructions:[{op:'transform', targets:['__proto__'], args:{translate:{x:1,y:1}}, sourceIndex:0}]};
  eq(analyzeReferences(raw, C_CTX).errors.length,1,'__proto__ is not an own key -> unknown');
});
test('E-6: malformed context keeps the gate CLOSED (objects array / missing objects / non-object context) — fail-loud via the unknown-ref error, never silently accepted', ()=>{
  const prog={version:'1.0', instructions:[{op:'appearance', target:'$doc:rect-1', args:{fill:'#00FF00'}, sourceIndex:0}]};
  eq(analyzeReferences(prog, {objects:['rect-1']}).errors.length,1,'array objects map -> unknown');
  eq(analyzeReferences(prog, {}).errors.length,1,'objects key missing -> unknown');
  eq(analyzeReferences(prog, 42).errors.length,1,'non-object context -> unknown');
  eq(analyzeReferences(prog, null).errors.length,1,'null context -> unknown');
});
test('E-7: validateDSL threads the context — doc-referencing program invalid without, valid with; other semantic checks stay enforced', ()=>{
  const prog={version:'1.0', instructions:[{op:'appearance', target:'$doc:rect-1', args:{fill:'#00FF00'}, sourceIndex:0}]};
  expect(!validateDSL(prog).valid,'context absent: rejected (the C-era pinned gap)');
  const withCtx=validateDSL(prog, C_CTX);
  expect(withCtx.valid,'context present: valid — '+JSON.stringify(withCtx.errors));
  const badGroup={version:'1.0', instructions:[{op:'group', targets:['$doc:rect-1'], sourceIndex:0}]};
  const rb=validateDSL(badGroup, C_CTX);
  expect(!rb.valid,'resolution must not mask other semantic errors');
  hasCode(rb,'DSL_SEMANTIC_INVALID','group with <2 targets still errors with a context present');
});
test('E-8: compileDSL threads the context — doc-referencing program compiles with context, fails without', ()=>{
  const prog={version:'1.0', instructions:[{op:'transform', targets:['rect-1'], args:{translate:{x:10,y:-5}}, sourceIndex:0}]};
  const withoutCtx=compileDSL(prog);
  expect(!withoutCtx.success,'context absent: compile fails');
  expect(withoutCtx.errors.some(e=>e.code==='DSL_UNKNOWN_REFERENCE'),'unknown-ref error surfaces');
  const withCtx=compileDSL(prog, C_CTX);
  expect(withCtx.success,'context present: compiles — '+JSON.stringify(withCtx.errors));
  eq(withCtx.ir[0].toolId,'T05','T05');
  eq(JSON.stringify(withCtx.ir[0].targets), JSON.stringify(['rect-1']),'targets carried verbatim');
});
test('E-9: compileToIR(program, context) is threading-neutral — identical IR with and without a context (mapping is resolution-free; targets carried verbatim)', ()=>{
  const prog={version:'1.0', instructions:[
    {op:'transform', targets:['rect-1'], args:{translate:{x:10,y:-5}}, sourceIndex:0},
    {op:'appearance', target:'$doc:rect-2', args:{fill:'#00FF00'}, sourceIndex:1}
  ]};
  const plain=compileToIR(prog);
  const threaded=compileToIR(prog, C_CTX);
  expect(plain.success && threaded.success,'both compile (reference gating lives in validateDSL/analyzeReferences)');
  eq(JSON.stringify(threaded.ir), JSON.stringify(plain.ir),'IR byte-identical with and without context');
});
test('E-10: program-internal programs validate identically with and without a context (substrate extension is verdict-neutral for §23-style programs)', ()=>{
  const dsl=compilePlanToDSL(createPlan(B_INTENT, B_CTX));
  const parsed=parseDSL(JSON.stringify(dsl));
  expect(parsed.success, JSON.stringify(parsed.errors));
  const a=validateDSL(parsed.program);
  const b=validateDSL(parsed.program, B_CTX);
  eq(a.valid, b.valid,'same verdict');
  eq(JSON.stringify(a.errors), JSON.stringify(b.errors),'same errors');
  eq(JSON.stringify(a.warnings), JSON.stringify(b.warnings),'same warnings');
  expect(a.valid,'self-contained program stays valid (B-era §24 round trip unaffected)');
});

console.log('=== Checkpoint E: full round trip — Plan -> compilePlanToDSL -> parseDSL -> validateDSL(context) -> compileToIR ===');
// Generic per-rule round trip (E.3): the validateDSL step is THE Checkpoint E
// capability — before E it rejects standalone doc-referencing programs
// (DSL_UNKNOWN_REFERENCE, pinned at C-E). IR/plan equivalence is asserted per
// step: every input key survives byte-identically EXCEPT fill (the documented
// T07 string->canonical-RGB mapping, proven at C-F), targets arrive stripped
// of their '$' prefixes, and create steps bind their ref via sourceRef.
function assertPlanRoundTrip(intent, ctx){
  const plan=createPlan(intent, ctx);
  const dsl=compilePlanToDSL(plan);
  const parsed=parseDSL(JSON.stringify(dsl));
  expect(parsed.success, JSON.stringify(parsed.errors));
  const checked=validateDSL(parsed.program, ctx);
  expect(checked.valid, `validateDSL(with context): ${JSON.stringify(checked.errors)}`);
  const ir=compileToIR(parsed.program, ctx);
  expect(ir.success, JSON.stringify(ir.errors));
  eq(ir.ir.map(n=>n.toolId).join(','), plan.steps.map(s=>s.toolId).join(','), 'same toolIds as the Plan');
  plan.steps.forEach((s,i)=>{
    const node=ir.ir[i];
    for(const k of Object.keys(s.input)){
      if(k==='objectIds') continue;
      if(k==='fill'){ eq(s.input.fill.kind, node.input.fill.kind, `step ${s.id}: fill kind survives (color canonicalization proven at C-F)`); continue; }
      eq(JSON.stringify(node.input[k]), JSON.stringify(s.input[k]), `step ${s.id}: input.${k} survives the round trip`);
    }
    if(Array.isArray(s.input.objectIds)){
      const want=s.input.objectIds.map(r=> r.startsWith('$doc:') ? r.slice(5) : r.slice(1));
      eq(JSON.stringify(node.targets), JSON.stringify(want), `step ${s.id}: targets carried verbatim (prefixes stripped)`);
    } else {
      eq(node.sourceRef, s.id, `step ${s.id}: create binds its ref`);
    }
  });
  return {plan, checked, ir};
}
test('E-RT Rule E: translate T05 + scale T06 — $doc: targets survive validateDSL with context; same toolIds/inputs/targets', ()=>{
  assertPlanRoundTrip(T_INTENT, C_CTX);
  assertPlanRoundTrip({type:'transform', targets:['rect-1'], operation:'scale', params:{x:2, y:3}}, C_CTX);
  assertPlanRoundTrip({type:'transform', targets:['rect-1','rect-2'], operation:'translate', params:{x:1, y:2}}, C_CTX);
});
test('E-RT Rule F: appearance T07 chain — $doc: targets round trip with context (multi-target, fill + opacity)', ()=>{
  assertPlanRoundTrip({type:'appearance', targets:['rect-1','rect-2'], fill:'#00FF00', opacity:0.5}, C_CTX);
});
test('E-RT Rule G: align T08 — $doc: targets round trip with context', ()=>{
  assertPlanRoundTrip({type:'alignment', targets:['rect-1','rect-2'], axis:'horizontal', mode:'center'}, C_CTX);
});
test('E-RT Rule H: group T10 + ungroup T11 — $doc: targets round trip with context', ()=>{
  assertPlanRoundTrip({type:'structure', operation:'group', targets:['rect-1','ellipse-1']}, C_CTX);
  assertPlanRoundTrip({type:'structure', operation:'ungroup', targets:['rect-1']}, C_CTX);
});
test('E-RT Rules A-D: create plans round trip WITH a context passed (self-contained programs; threading must not disturb the T01/T02 -> T07 -> T08 chains)', ()=>{
  assertPlanRoundTrip(B_INTENT, B_CTX);
  assertPlanRoundTrip({type:'create', objectType:'ellipse', rx:50, ry:30, fill:'#00FF00', placement:'center'}, B_CTX);
});

// ============================================================================
// PHASE 3.13 — CHECKPOINT F (spec §41-F): MANDATORY VERTICAL SLICE.
// The 4-step proof sequence over the REAL pipeline, per the §41-F mandate:
//   Step 1 BEFORE PLANNING  — deterministic JSON snapshots of every canonical
//                             store (objects, geometry, appearance, scene
//                             graph) + history.size() + SpatialIndex state +
//                             RenderTree state.
//   Step 2 AFTER PLANNING   — Intent -> ExpectedState -> Plan -> validatePlan
//                             -> compilePlanToDSL -> parseDSL -> validateDSL;
//                             NO transaction executed; every snapshot
//                             byte-identical to Step 1 (the Planner is
//                             read-only — D4 proven end to end).
//   Step 3 DURING EXECUTION — Plan -> DSL -> Tool Registry -> tool validation
//                             -> Transaction -> Commit through the REAL
//                             substrate (live core registry +
//                             TransactionExecutor + WorkingCopy + Journal);
//                             history.size() increases by exactly the executed
//                             step count; one TransactionCommitted per commit.
//   Step 4 AFTER COMMIT     — object in ObjectStore; geometry params
//                             200x100 rx12 ry12; appearance fill item
//                             {kind:'solid', color:{r:255,g:0,b:0,a:1}};
//                             WorldBBox center === artboard center (1e-9);
//                             SpatialIndex + RenderTree invalidated AFTER
//                             commit.
// Intent: the §20 vertical-slice intent (B_INTENT — "create red rounded rect
// 200x100 radius 12, centered on artboard"); the artboard is SUPPLIED via
// createPlanningContext (B_CTX, §24 — the harness never guesses).
//
// The harness is the composition layer: it owns stores, event bus, history,
// the TransactionExecutor, the execution-side core registry, and the
// invalidation wiring. RenderTree invalidation is substrate-wired (the
// Renderer subscribes to TransactionCommitted itself, renderer.js:317-321);
// the SpatialIndex has NO substrate-side renderer equivalent, so the harness
// mirrors the renderer's own subscription pattern (disclosed in the report).
// Determinism note (§16): the snapshots intentionally exclude event envelopes
// and transaction metadata (substrate-owned uuid()/Date.now() ids) — only
// content state is compared; §16 governs Planner outputs, and the B-era hash
// probe is re-run as a Checkpoint F regression gate.
// ============================================================================

console.log('=== Checkpoint F: mandatory vertical slice (spec §41-F) ===');

// Key-sorted canonical JSON: the byte-comparable form for every snapshot.
function canonicalJson(v){
  if(Array.isArray(v)) return v.map(canonicalJson);
  if(v && typeof v==='object'){ const o={}; for(const k of Object.keys(v).sort()) o[k]=canonicalJson(v[k]); return o; }
  return v;
}

let F_RUN=null;
function getFRun(){ if(F_RUN===null) F_RUN=runMandatoryVerticalSlice(); return F_RUN; }

// The Checkpoint F harness — the composition layer a real application
// provides. It assembles the REAL execution substrate (stores, event bus,
// history, TransactionExecutor, live core registry, Renderer), runs the
// mandated 4-step proof sequence, and returns every artifact + snapshot the
// F tests assert on. No src-js/ file is modified: every piece comes from the
// existing substrate modules.
async function runMandatoryVerticalSlice(){
  // ---- Step 0: fresh document + substrate assembly -------------------------
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:id=>geometryStore.has(id), hasAppearance:id=>appearanceStore.has(id)});
  const sceneGraph=new SceneGraph();
  const stores={objectStore, geometryStore, appearanceStore, sceneGraph};
  const eventBus=new EventBus();
  const historyManager=new HistoryManager();
  const transactionExecutor=new TransactionExecutor(stores, eventBus, historyManager);
  const docContext={...stores, transactionManager: transactionExecutor /* [CHECKPOINT-F-SUBSTRATE] */};
  const toolRegistry=createCoreToolRegistry(); // execution-side registry (the Planner keeps its own read-only projection)
  const renderer=new Renderer(stores, eventBus); // substrate-wired RenderTree invalidation (renderer.js:317-321)
  // SpatialIndex invalidation wiring: mirrors the Renderer's own
  // TransactionCommitted subscription pattern — invalidate + re-sync from the
  // canonical scene graph after every commit (composition-layer duty; the
  // substrate has no spatial-index renderer equivalent).
  const spatialIndex=new SimpleSpatialIndex();
  let spatialInvalidations=0;
  const worldBBoxOfObject=(oid)=>{
    const obj=objectStore.get(oid);
    if(!obj) return null;
    const geom=geometryStore.get(obj.geometryRef);
    if(!geom || geom.type!=='rect') return null;
    const local=rectBBox(geom.params);
    const node=sceneGraph.findNodeByObjectId(oid);
    if(!node || !sceneGraph.getWorldTransform) return local;
    return BBox.transform(local, sceneGraph.getWorldTransform(node.id));
  };
  const syncSpatialIndex=()=>{
    spatialIndex.clear();
    for(const node of sceneGraph.getAllNodes()){
      if(!node.objectRef) continue;
      const bb=worldBBoxOfObject(node.objectRef);
      if(bb) spatialIndex.insert(node.id, bb);
    }
  };
  eventBus.subscribe('TransactionCommitted', ()=>{ spatialInvalidations++; syncSpatialIndex(); });

  // ---- Snapshot helpers (deterministic JSON; §16-excluded runtime envelopes) -
  const snapshotDocument=()=>{
    const ids=s=>s.listIds().sort();
    return JSON.stringify(canonicalJson({
      objects: ids(objectStore).map(id=>objectStore.get(id)),
      geometries: ids(geometryStore).map(id=>geometryStore.get(id)),
      appearances: ids(appearanceStore).map(id=>appearanceStore.get(id)),
      sceneGraph: sceneGraph.getAllNodes().map(n=>JSON.parse(JSON.stringify(n))).sort((a,b)=> a.id<b.id?-1:1)
    }));
  };
  const snapshotSpatial=()=>JSON.stringify(canonicalJson({
    invalidations: spatialInvalidations,
    entries: spatialIndex.getAllEntries().size===0 ? [] : [...spatialIndex.getAllEntries().entries()].map(([id,bbox])=>({id,bbox})).sort((a,b)=> a.id<b.id?-1:1)
  }));
  const snapshotRenderTree=(artboard)=>{
    const invalidated=renderer.getInvalidationTracker().needsFullRebuild() || renderer.getInvalidationTracker().getInvalidated().size>0;
    const tree=renderer.buildRenderTree(artboard); // Renderer.buildRenderTree RETURNS the tree (renderer.js:329-335)
    return JSON.stringify(canonicalJson({invalidated, nodes: tree.getAllNodes()}));
  };

  // ---- Step 1: BEFORE PLANNING ----------------------------------------------
  renderer.buildRenderTree(B_ARTBOARD); // establish the baseline RenderTree (tracker clean)
  const snapBefore={documentJson: snapshotDocument(), historySize: historyManager.size(), spatialJson: snapshotSpatial(), renderTreeJson: snapshotRenderTree(B_ARTBOARD)};

  // ---- Step 2: AFTER PLANNING / BEFORE EXECUTION (no transaction allowed) ----
  const expectedState=createExpectedState(B_INTENT, B_CTX);
  const plan=createPlan(B_INTENT, B_CTX);
  const planVerdict=validatePlan(plan, B_CTX);
  const dslProgram=compilePlanToDSL(plan);
  const parsed=parseDSL(JSON.stringify(dslProgram));
  const dslVerdict=validateDSL(parsed.program, B_CTX);
  const snapAfterPlanning={documentJson: snapshotDocument(), historySize: historyManager.size(), spatialJson: snapshotSpatial(), renderTreeJson: snapshotRenderTree(B_ARTBOARD), renderInvalidated: renderer.getInvalidationTracker().needsFullRebuild() || renderer.getInvalidationTracker().getInvalidated().size>0};

  // ---- Step 3: DURING EXECUTION (real pipeline, real substrate) --------------
  const ir=compileToIR(parsed.program, B_CTX);
  const historyBefore=historyManager.size();
  const execution=await new DSLExecutor().execute(ir.ir, {toolRegistry, documentContext: docContext}); // [CHECKPOINT-F-EXEC]
  const historyAfter=historyManager.size();
  const committedEvents=eventBus.getHistory().filter(e=>e.type==='TransactionCommitted').map(e=>({type:'TransactionCommitted', transactionId: e.transactionId}));
  const historyIds=historyManager.getAll().map(t=>t.id);

  // ---- Step 4: AFTER COMMIT (final canonical state) --------------------------
  const objectId=execution.outputs[0] && execution.outputs[0].output && execution.outputs[0].output.objectId;
  const obj=objectId ? objectStore.get(objectId) : null;
  const geometry=obj ? geometryStore.get(obj.geometryRef) : null;
  const appearance=obj ? appearanceStore.get(obj.appearanceRef) : null;
  const sceneNode=objectId ? sceneGraph.findNodeByObjectId(objectId) : null;
  const wb=objectId ? worldBBoxOfObject(objectId) : null;
  const worldBBoxCenter=wb ? BBox.center(wb) : null;
  const nodeEntry=sceneNode ? spatialIndex.getAllEntries().get(sceneNode.id) : null;
  const renderInvalidated=renderer.getInvalidationTracker().needsFullRebuild();
  const rebuilt=renderer.buildRenderTree(B_ARTBOARD);
  const rebuiltTreeHasObject=!!objectId && rebuilt.getAllNodes().some(n=>n.objectId===objectId); // render nodes carry .objectId (renderer.js:288)

  return {
    expectedState, plan, planVerdict, dslProgram, parsed, dslVerdict,
    snapBefore, snapAfterPlanning,
    execution,
    historyBefore, historyAfter, committedEvents, historyIds,
    outputs: execution.outputs,
    objectId,
    objectStoreSize: objectStore.size(),
    sceneNodeFound: !!sceneNode,
    geometry, appearance,
    worldBBoxCenter, artboardCenter: {x: B_ARTBOARD.centerX, y: B_ARTBOARD.centerY},
    spatialInvalidations,
    spatialNodeEntries: sceneNode ? (nodeEntry ? 1 : 0) : 0,
    spatialNodeBBox: nodeEntry || null,
    renderInvalidated, rebuiltTreeHasObject
  };
}

test('F-S1: BEFORE PLANNING — canonical stores + history.size() + SpatialIndex + RenderTree captured as deterministic JSON (fresh document)', async ()=>{
  const run=await getFRun();
  const doc=JSON.parse(run.snapBefore.documentJson);
  eq(doc.objects.length,0,'ObjectStore empty');
  eq(doc.geometries.length,0,'GeometryStore empty');
  eq(doc.appearances.length,0,'AppearanceStore empty');
  eq(doc.sceneGraph.length,0,'SceneGraph empty');
  eq(run.snapBefore.historySize,0,'history.size() === 0');
  eq(run.snapBefore.spatialJson,JSON.stringify(canonicalJson({invalidations:0,entries:[]})),'SpatialIndex state: no entries, zero invalidation signals');
  eq(run.snapBefore.renderTreeJson,JSON.stringify(canonicalJson({invalidated:false,nodes:[]})),'RenderTree state: no nodes, not invalidated');
  eq(run.snapBefore.documentJson,JSON.stringify(canonicalJson(JSON.parse(run.snapBefore.documentJson))),'store snapshot is canonical (key-sorted deterministic JSON)');
});

test('F-S2: AFTER PLANNING / BEFORE EXECUTION — the planning chain ran, NO transaction executed: stores byte-identical, history unchanged, SpatialIndex NOT invalidated, RenderTree NOT invalidated (the Planner is read-only)', async ()=>{
  const run=await getFRun();
  expect(run.expectedState && run.plan && run.planVerdict && run.parsed && run.dslVerdict,'the full planning chain produced its artifacts');
  expect(run.planVerdict.valid,'validatePlan: '+JSON.stringify(run.planVerdict.errors));
  expect(run.parsed.success,'parseDSL: '+JSON.stringify(run.parsed.errors));
  expect(run.dslVerdict.valid,'validateDSL(with context): '+JSON.stringify(run.dslVerdict.errors));
  eq(run.plan.steps.map(s=>s.toolId).join(','),'T01,T07,T08','plan shape: create + fill via T07 (PHASE E Decision 2) + the §20 T08 align step');
  eq(run.snapAfterPlanning.documentJson,run.snapBefore.documentJson,'canonical stores BYTE-IDENTICAL across planning');
  eq(run.snapAfterPlanning.historySize,run.snapBefore.historySize,'history.size() unchanged by planning');
  eq(run.snapAfterPlanning.spatialJson,run.snapBefore.spatialJson,'SpatialIndex NOT invalidated by planning');
  eq(run.snapAfterPlanning.renderTreeJson,run.snapBefore.renderTreeJson,'RenderTree NOT invalidated by planning');
  eq(run.snapAfterPlanning.renderInvalidated,false,'RenderTree invalidation tracker still clean after planning');
});

test('F-S3: DURING EXECUTION — Plan->DSL->Tool Registry->tool validation->Transaction->Commit through the REAL substrate: history grows by exactly the executed step count, TransactionCommitted emitted per commit', async ()=>{
  const run=await getFRun();
  expect(run.execution.success,'DSLExecutor reported success — '+JSON.stringify(run.execution.errors));
  eq(run.historyBefore,0,'no transactions before execution');
  eq(run.historyAfter-run.historyBefore,run.plan.steps.length,'history.size() increased by the expected number (one substrate transaction per executed plan step)');
  eq(run.historyAfter-run.historyBefore,3,'explicit: 3 plan steps (T01,T07,T08) -> 3 commits');
  eq(run.committedEvents.length,3,'exactly one TransactionCommitted per commit');
  eq(JSON.stringify(run.committedEvents.map(e=>e.transactionId)),JSON.stringify(run.outputs.map(o=>o.transactionId)),'event transactionIds === output transactionIds, in commit order');
  eq(JSON.stringify(run.committedEvents.map(e=>e.transactionId)),JSON.stringify(run.historyIds),'event transactionIds === history transaction ids, in commit order');
  expect(run.outputs.every(o=>typeof o.transactionId==='string'&&o.transactionId.length>0),'every executed step committed through the substrate (transactionId returned)');
});

test('F-S4: AFTER COMMIT — object/geometry/appearance final state, WorldBBox center === artboard center (1e-9), SpatialIndex + RenderTree invalidated', async ()=>{
  const run=await getFRun();
  expect(run.objectId,'T01 produced an objectId');
  eq(run.objectStoreSize,1,'object exists in ObjectStore (exactly one)');
  expect(run.sceneNodeFound,'scene node findable via findNodeByObjectId');
  eq(run.geometry.type,'rect','geometry type');
  eq(JSON.stringify(run.geometry.params),JSON.stringify({x:300,y:250,width:200,height:100,rx:12,ry:12}),'GeometryStore.get(object.geometryRef).params — 200x100 radius 12 at the plan-time centered x/y');
  const fill=run.appearance.stack.find(it=>it.type==='fill');
  expect(fill,'AppearanceStore.get(object.appearanceRef).stack contains a fill item');
  eq(fill.data.kind,'solid','fill data.kind === solid');
  eq(JSON.stringify(fill.data.color),JSON.stringify({r:255,g:0,b:0,a:1}),'fill data.color === {r:255,g:0,b:0,a:1}');
  eq(fill.enabled,true,'fill item enabled');
  expect(Math.abs(run.worldBBoxCenter.x-run.artboardCenter.x)<=1e-9,'WorldBBox center x === artboard center x (within 1e-9)');
  expect(Math.abs(run.worldBBoxCenter.y-run.artboardCenter.y)<=1e-9,'WorldBBox center y === artboard center y (within 1e-9)');
  eq(run.spatialInvalidations,3,'SpatialIndex invalidated AFTER commit (one invalidation per committed transaction)');
  eq(run.spatialNodeEntries,1,'SpatialIndex re-synced after commit: the committed node is indexed');
  eq(JSON.stringify(run.spatialNodeBBox),JSON.stringify({minX:300,minY:250,maxX:500,maxY:350}),'SpatialIndex holds the committed WorldBBox');
  eq(run.renderInvalidated,true,'RenderTree invalidated AFTER commit (invalidation tracker needsFullRebuild)');
  eq(run.rebuiltTreeHasObject,true,'rebuilt RenderTree contains the committed object');
});

// ============================================================================
// PHASE 3.13 — CHECKPOINT G: ARCHITECTURE TESTS (spec §26/§41-G)
// ============================================================================
// Static source scan of src-js/ai.js (the Planner module), mirroring the scan
// style of tests/architecture.test.mjs (forbidden-pattern regexes over
// fs.readFileSync source) and tests/interaction-boundaries.test.mjs:337-355
// (word-boundary global scans + import-line scans).
//
// WHY A COMMENT/STRING-STRIPPING CODE-BODY SCAN (honesty note): raw ai.js
// legitimately CONTAINS the words the §41-G targets name — e.g. "EXISTING
// document objects" (comment, ai.js:15) and the error string "…'$doc:'
// document-object references…" (ai.js:995); the identifier `refs.` embeds
// the substring "fs."; `findFunctionPath` embeds "Function". A raw scan
// would false-positive on all of them — and would be dishonest either way:
// §41-G forbids REACHING these surfaces from Planner CODE, not naming them
// in prose. The scanner below removes // and /* */ comments and the TEXT of
// '…' / "…" / `…` literals while PRESERVING ${…} interpolation expressions
// (they are code), keeps character and line counts 1:1 with the source, and
// was validated before embedding by scripts/probe-3.13-checkpointG-scan.mjs:
// zero false positives on the clean module, positive controls all fire.
// Anti-vacuity guard (a broken over-stripping scanner would make every
// pattern scan pass vacuously): test G-6 below.
//
// DISCLOSED SUPERSET of the literal §41-G list: G-3 also denies
// require( / dynamic import( / globalThis / process (dynamic-code + Node
// escape hatches beside eval/Function/fs); G-4 denies the full substrate
// mutation method surface (execute/commit/rollback, register/unregister,
// render/invalidate/invalidateAll, insert/remove/update/delete/create)
// beside the literal Store.write / Transaction.execute / Renderer /
// SpatialIndex targets. `.push(` / `.add(` / `.get(` / `.has(` / `.list(`
// are deliberately NOT denied: the Planner legitimately pushes into its own
// plain-data error arrays and reads the registry through the frozen
// {has, get, list} read-only projection (Checkpoint D contract).
// ============================================================================

// Deterministic single-pass stripper: comments and string/template TEXT are
// replaced by same-length whitespace placeholders; interpolation code
// (${…}), the code body, and all newlines survive 1:1.
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
function expectNoMatch(text, re, msg){
  const m = text.match(new RegExp(re.source, 'g'));
  expect(!m || m.length === 0, `${msg} — matched ${JSON.stringify(m)}`);
}

const G_AI_SRC = readFileSync(new URL('../src-js/ai.js', import.meta.url), 'utf-8');
const G_AI_STRIPPED = stripCommentsAndStrings(G_AI_SRC);

console.log('\n=== PHASE 3.13 Checkpoint G: Architecture Tests (spec §26/§41-G) ===');

test('G-1: import contract — the Planner imports exactly ONE substrate module (./tools.js); every specifier relative; no fs, no node: builtin, no bare npm specifier', ()=>{
  const specs = importSpecifiers(collectImportLines(G_AI_SRC));
  for (const s of specs){
    expect(s.startsWith('./') || s.startsWith('../'), `non-relative import specifier '${s}' in the Planner (fs / node: builtins / bare npm specifiers are forbidden, §41-G)`);
  }
  eq(JSON.stringify(specs), JSON.stringify(['./tools.js']), 'the one-substrate-import contract (ai.js header; Checkpoint D disclosure): exactly createCoreToolRegistry from ./tools.js');
});

test('G-2: Planner code reaches no browser/DOM global and no network — window, document, fetch (§41-G), scanned on the comment/string-stripped code body', ()=>{
  expectNoMatch(G_AI_STRIPPED, /\bwindow\b/, 'Planner -> window is FORBIDDEN (§41-G)');
  expectNoMatch(G_AI_STRIPPED, /\bdocument\b/, 'Planner -> document is FORBIDDEN (§41-G)');
  expectNoMatch(G_AI_STRIPPED, /\bfetch\s*\(/, 'Planner -> fetch is FORBIDDEN (§41-G)');
});

test('G-3: Planner code reaches no dynamic code execution and no Node escape hatch — eval, Function, require(, import(, globalThis, process, fs', ()=>{
  expectNoMatch(G_AI_STRIPPED, /\beval\b/, 'Planner -> eval is FORBIDDEN (§41-G)');
  expectNoMatch(G_AI_STRIPPED, /\bFunction\b/, 'Planner -> Function constructor is FORBIDDEN (§41-G)');
  expectNoMatch(G_AI_STRIPPED, /\brequire\s*\(/, 'Planner -> require() is FORBIDDEN (dynamic-code/Node escape hatch)');
  expectNoMatch(G_AI_STRIPPED, /\bimport\s*\(/, 'Planner -> dynamic import() is FORBIDDEN (dynamic-code escape hatch)');
  expectNoMatch(G_AI_STRIPPED, /\bglobalThis\b/, 'Planner -> globalThis escape hatch is FORBIDDEN');
  expectNoMatch(G_AI_STRIPPED, /\bprocess\b/, 'Planner -> process (Node environment) is FORBIDDEN');
  expectNoMatch(G_AI_STRIPPED, /\bfs\b/, 'Planner -> fs is FORBIDDEN (§41-G)');
});

test('G-4: Planner code calls no substrate mutation method — Store.write, Transaction.execute/commit/rollback, registry register/unregister, Renderer render/invalidate, SpatialIndex insert/remove/update/delete are structurally unreachable (§26: the only mutation path is Plan -> DSL -> Tool Registry -> Transaction -> Commit, executed by the substrate, never by the Planner)', ()=>{
  expectNoMatch(
    G_AI_STRIPPED,
    /\.(write|execute|register|unregister|invalidate|invalidateAll|insert|remove|update|delete|create|render|commit|rollback)\s*\(/,
    'Planner -> substrate mutation call is FORBIDDEN (§26/§41-G)'
  );
});

test('G-5: zero npm dependencies added — package.json declares no dependency fields and every src-js runtime module imports only relative specifiers', ()=>{
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']){
    const v = pkg[field];
    expect(v === undefined || (typeof v === 'object' && v !== null && Object.keys(v).length === 0), `package.json .${field} must be absent/empty (zero npm dependencies, §41-G) — got ${JSON.stringify(v)}`);
  }
  const files = readdirSync(new URL('../src-js/', import.meta.url)).filter(f => f.endsWith('.js'));
  expect(files.includes('ai.js') && files.includes('tools.js') && files.includes('dsl.js'), `src-js runtime file list is non-trivial (${files.length} files scanned)`);
  for (const f of files){
    const src = readFileSync(new URL(`../src-js/${f}`, import.meta.url), 'utf-8');
    for (const s of importSpecifiers(collectImportLines(src))){
      expect(s.startsWith('./') || s.startsWith('../'), `src-js/${f} imports '${s}' — a non-relative (npm package / node builtin) specifier would add a dependency`);
    }
  }
});

test('G-6: scan-harness sanity (anti-vacuity) — the stripper demonstrably removes comments/strings and preserves code 1:1, so G-2/G-3/G-4 cannot pass vacuously', ()=>{
  // code survives stripping (an over-stripping scanner would make every pattern scan vacuously green)
  for (const token of ['createCoreToolRegistry', 'PLANNER_TOOL_REGISTRY', 'deepFreeze', 'compilePlanToDSL']){
    expect(G_AI_STRIPPED.includes(token), `stripped code body must still contain '${token}'`);
  }
  // the documented comment/string occurrences of forbidden words are gone from the code body
  expect(!G_AI_STRIPPED.includes('EXISTING document objects'), 'ai.js:15 comment text must be stripped before scanning');
  expect(!G_AI_STRIPPED.includes('document-object references'), 'ai.js:995 error-string text must be stripped before scanning');
  // 1:1 char/line mapping (placeholder-preserving stripper — line accounting stays exact)
  eq(G_AI_STRIPPED.length, G_AI_SRC.length, 'stripped output is char-count-identical to the source');
  eq(G_AI_STRIPPED.split('\n').length, G_AI_SRC.split('\n').length, 'stripped output is line-count-identical to the source');
});

Promise.all(pending).then(()=>{
  console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
  if(failed>0) process.exit(1);
});
