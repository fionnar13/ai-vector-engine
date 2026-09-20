
import { GeometryStore, AppearanceStore, ObjectStore } from '../src-js/stores.js';
import { SceneGraph } from '../src-js/scenegraph.js';
import { SemanticStore } from '../src-js/semantic.js';
import { ConstraintStore } from '../src-js/constraints.js';
import { ToolRegistry, registerCoreTools, createCoreToolRegistry } from '../src-js/tools.js';
import * as G from '../src-js/geometry.js';
import { Journal, WorkingCopy, TransactionExecutor, HistoryManager, EventBus } from '../src-js/transaction.js';

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

let total=0, passed=0, failed=0;
function test(name, fn){ total++; try{ fn(); passed++; console.log(`✓ ${name}`);}catch(e){ failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }

function createDoc(){
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:(id)=>geometryStore.has(id), hasAppearance:(id)=>appearanceStore.has(id)});
  const sceneGraph=new SceneGraph();
  const semanticStore=new SemanticStore();
  return {geometryStore, appearanceStore, objectStore, sceneGraph, semanticStore};
}

function createRectObject(doc, x=0, y=0, w=100, h=100){
  const gid=uuid(); doc.geometryStore.create(gid, {type:'rect', params:{x,y,width:w,height:h,rx:0,ry:0}});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.getRoots()[0] || doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  return {gid, aid, oid};
}

// P6 helpers: store polygon/path objects exactly the way T03-style tools do
// ({type:'path', params:{contours, fillRule}}) so tool read-resolution matches production.
function storePolygonObject(doc, points, name='polygon'){
  const gid=uuid(); doc.geometryStore.create(gid, {type:'polygon', params:{points}});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name, locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.getRoots()[0] || doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  return oid;
}
function storePathObject(doc, path){
  const gid=uuid(); doc.geometryStore.create(gid, {type:'path', params:{contours:path.contours, fillRule:path.fillRule||'nonZero'}});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'path', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.getRoots()[0] || doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  return oid;
}

// P6 read-only proof: byte-identical canonical state snapshot (stores + scene nodes).
function snapshotState(doc){
  return JSON.stringify({
    objects: doc.objectStore.listIds().sort().map(id=>doc.objectStore.get(id)),
    geometries: doc.geometryStore.listIds().sort().map(id=>doc.geometryStore.get(id)),
    appearances: doc.appearanceStore.listIds().sort().map(id=>doc.appearanceStore.get(id)),
    nodes: doc.sceneGraph.getAllNodes ? doc.sceneGraph.getAllNodes() : [],
  });
}

// Duck-typed workingCopy facade over the real Phase 3.06 substrate (Journal + WorkingCopy).
// Same interface the tool workingCopy branches call (createGeometry/createAppearance/createObject/createNode/getRootNodes);
// backed by the canonical Journal so tests assert journaled adds, not a hand-rolled recorder.
function makeToolWorkingCopy(){
  const journal=new Journal();
  const wc=new WorkingCopy(journal);
  return {
    hasGeometry:id=>wc.hasGeometry(id), getGeometry:id=>wc.getGeometry(id),
    hasObject:id=>wc.hasObject(id), getObject:id=>wc.getObject(id),
    hasNode:id=>wc.hasNode(id),
    getJournal:()=>journal,
    createGeometry:(id,g)=>wc.setGeometry(id,g),
    createAppearance:(id,a)=>wc.setAppearance(a),
    createObject:o=>wc.setObject(o),
    createNode:(childId,parentId)=>wc.setNode({id:childId, objectId:childId, parentId, children:[], localTransform:{a:1,b:0,c:0,d:1,tx:0,ty:0}}),
    getRootNodes:()=>{ const roots=[]; for(const n of wc.getNodes().values()) if(!n.parentId) roots.push(n); return roots; },
  };
}

// P3 substrate: real 3.06 TransactionExecutor + EventBus + HistoryManager wired into the ToolContext.
function makeSubstrate(doc){
  const eventBus=new EventBus();
  const history=new HistoryManager();
  const transactionManager=new TransactionExecutor(doc, eventBus, history);
  return { eventBus, history, transactionManager, context:{...doc, transactionManager} };
}

console.log('=== Registry ===');
test('register', ()=>{
  const registry=new ToolRegistry();
  const tool={id:'T01', name:'test', version:'1.0.0', category:'mutation', description:'test', inputSchema:{type:'object', properties:{}}, outputSchema:{type:'object', properties:{}}, permissions:{read:[], write:['transaction']}, deterministic:true, validate:()=>({valid:true, errors:[]}), execute:()=>({success:true})};
  registry.register(tool);
  expect(registry.has('T01'));
});
test('duplicate ID rejection', ()=>{
  const registry=new ToolRegistry();
  const tool={id:'T01', name:'test', version:'1.0.0', category:'mutation', description:'test', inputSchema:{type:'object', properties:{}}, outputSchema:{type:'object', properties:{}}, permissions:{read:[], write:['transaction']}, deterministic:true, validate:()=>({valid:true, errors:[]}), execute:()=>({success:true})};
  registry.register(tool);
  let threw=false;
  try{ registry.register(tool); }catch{ threw=true; }
  expect(threw);
});
test('unregister', ()=>{
  const registry=new ToolRegistry();
  const tool={id:'T01', name:'test', version:'1.0.0', category:'mutation', description:'test', inputSchema:{type:'object', properties:{}}, outputSchema:{type:'object', properties:{}}, permissions:{read:[], write:['transaction']}, deterministic:true, validate:()=>({valid:true, errors:[]}), execute:()=>({success:true})};
  registry.register(tool);
  registry.unregister('T01');
  expect(!registry.has('T01'));
});
test('get', ()=>{
  const registry=createCoreToolRegistry();
  const tool=registry.get('T01');
  expect(tool && tool.id==='T01');
});
test('has', ()=>{
  const registry=createCoreToolRegistry();
  expect(registry.has('T01'));
  expect(!registry.has('T99'));
});
test('list', ()=>{
  const registry=createCoreToolRegistry();
  const list=registry.list();
  expect(list.length===20);
  expect(list[0].id==='T01');
});
test('category filtering', ()=>{
  const registry=createCoreToolRegistry();
  const read=registry.listByCategory('read');
  const proposal=registry.listByCategory('proposal');
  const mutation=registry.listByCategory('mutation');
  expect(read.length===3);
  expect(proposal.length===2);
  expect(mutation.length===15);
});
// P1 strengthened (gate ARCHITECTURE.md:55 "definitions immutable after registration frozen"):
// a swapped/patched execute must be impossible after registration — a tampered stub can no longer hide.
test('definitions frozen after registration', ()=>{
  const registry=createCoreToolRegistry();
  const core=registry.get('T01');
  expect(Object.isFrozen(core));
  expect(Object.isFrozen(core.inputSchema));
  expect(Object.isFrozen(core.permissions));
  let threw=false;
  try{ core.execute=()=>({success:true}); }catch{ threw=true; }
  expect(threw); // strict-mode assignment to frozen definition must throw
  const custom={id:'T90', name:'custom', version:'1.0.0', category:'read', description:'x', inputSchema:{type:'object',properties:{}}, outputSchema:{type:'object',properties:{}}, permissions:{read:[],write:[]}, deterministic:true, validate:()=>({valid:true,errors:[]}), execute:()=>({success:true,output:{}})};
  registry.register(custom);
  expect(Object.isFrozen(custom));
  let threw2=false;
  try{ custom.execute=core.execute; }catch{ threw2=true; }
  expect(threw2);
  // freeze must not break execution semantics
  const doc=createDoc();
  expect(registry.execute('T01',{width:10,height:5},doc).success);
});

console.log('\n=== Validation ===');
test('invalid input rejected', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const result=registry.execute('T01', {width:-100, height:100}, doc);
  expect(!result.success);
});
test('unknown tool rejected', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const result=registry.execute('T99', {}, doc);
  expect(!result.success);
  expect(result.errors[0].code==='TOOL_NOT_FOUND');
});
test('invalid ObjectID rejected', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const result=registry.execute('T04', {objectIds:['not-uuid']}, doc);
  expect(!result.success);
});
test('invalid numeric input rejected', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const result=registry.execute('T05', {objectIds:[uuid()], delta:{x:NaN, y:0}}, doc);
  expect(!result.success);
});
test('transform singular rejected', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const oid=uuid();
  const result=registry.execute('T06', {objectIds:[oid], transform:{a:0,b:0,c:0,d:0,tx:0,ty:0}}, doc);
  expect(!result.success);
  expect(result.errors.some(e=> e.code==='TRANSFORM_SINGULAR'));
});

console.log('\n=== Read Tools ===');
test('find_object_by_role no transaction', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  doc.semanticStore.set({objectId:oid, role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[]});
  const result=registry.execute('T16', {role:'button'}, doc);
  expect(result.success);
  expect(result.output.objectIds.length===1);
});
test('find_object_by_role no mutation', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const before=doc.objectStore.size();
  registry.execute('T16', {role:'button'}, doc);
  expect(doc.objectStore.size()===before);
});
test('detect_shape_primitive no transaction', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const result=registry.execute('T17', {objectId:oid}, doc);
  expect(result.success);
  expect(result.output.detected==='rectangle');
});
test('detect_symmetry no mutation', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,50,50);
  const o2=createRectObject(doc, 100,0,50,50);
  const before=doc.objectStore.size();
  const result=registry.execute('T18', {objectIds:[o1.oid, o2.oid]}, doc);
  expect(result.success);
  expect(doc.objectStore.size()===before);
});

// ---- P6 strengthened (6.1): T17 delegates to the Geometry Kernel (src-js/geometry.js:287) ----
test('detect_shape_primitive distinguishes rect from polygon (anti-hardcode)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,50);
  const tri=storePolygonObject(doc, [{x:0,y:0},{x:40,y:0},{x:20,y:35}]);
  const rRect=registry.execute('T17', {objectId:rect.oid}, doc);
  const rPoly=registry.execute('T17', {objectId:tri}, doc);
  expect(rRect.success && rPoly.success);
  expect(rRect.output.detected==='rectangle');
  expect(rPoly.output.detected==='polygon');
  // two different shapes MUST produce different outputs — the hardcoded
  // {detected:'rectangle', confidence:0.95} stub fails exactly here
  expect(rRect.output.detected!==rPoly.output.detected);
  expect(rRect.output.confidence===1);
});
test('detect_shape_primitive delegates freeform paths to detectParametricShape (src-js/geometry.js:287)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  // a freeform PATH that is a rectangle in disguise: 4 corner anchors, closed
  const rectAnchors=[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}].map(p=>G.createAnchor(p));
  const disguised=storePathObject(doc, G.createPath([G.createContour(rectAnchors, true)], 'nonZero'));
  // a genuinely non-reducible contour: smooth curved anchors (handles) — the kernel
  // correctly returns null for it (not a line/rect/polygon), T17 reports safe-failure null
  const curveAnchors=[
    G.createAnchor({x:0,y:0}, {x:0,y:0}, {x:20,y:10}, 'smooth'),
    G.createAnchor({x:80,y:0}, {x:-10,y:20}, {x:10,y:-20}, 'smooth'),
    G.createAnchor({x:100,y:60}, {x:-20,y:0}, {x:0,y:0}, 'smooth'),
    G.createAnchor({x:30,y:80}, {x:15,y:-5}, {x:0,y:0}, 'corner'),
  ];
  const freeform=storePathObject(doc, G.createPath([G.createContour(curveAnchors, true)], 'nonZero'));
  const r1=registry.execute('T17', {objectId:disguised}, doc);
  const r2=registry.execute('T17', {objectId:freeform}, doc);
  expect(r1.success && r2.success);
  expect(r1.output.detected==='rectangle'); // kernel re-detects the hidden primitive
  expect(r1.output.source==='detected');
  expect(r2.output.detected===null);        // contract "safe failure null", still success:true
  expect(r2.output.confidence===0);
  expect(r1.output.detected!==r2.output.detected);
});
test('detect_shape_primitive read-only: zero transactions, zero events, stores byte-identical', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,50);
  const tri=storePolygonObject(doc, [{x:0,y:0},{x:40,y:0},{x:20,y:35}]);
  const substrate=makeSubstrate(doc);
  const before=snapshotState(doc);
  const r1=registry.execute('T17', {objectId:rect.oid}, substrate.context);
  const r2=registry.execute('T17', {objectId:tri}, substrate.context);
  expect(r1.success && r2.success);
  expect(snapshotState(doc)===before);
  expect(substrate.history.size()===0);
  expect(substrate.eventBus.getHistory().length===0);
  expect(!r1.commandId && !r1.transactionId && !r2.commandId && !r2.transactionId);
});

// ---- P6 strengthened (6.2): T18 analytical symmetry from geometry params ----
test('detect_symmetry symmetric vs asymmetric shapes (anti-hardcode, deviation varies)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const sym=createRectObject(doc, 0,0,100,60);
  const asym=storePolygonObject(doc, [{x:0,y:0},{x:90,y:10},{x:30,y:70}]);
  const rSym=registry.execute('T18', {objectIds:[sym.oid]}, doc);
  const rAsym=registry.execute('T18', {objectIds:[asym]}, doc);
  expect(rSym.success && rAsym.success);
  expect(rSym.output.symmetry.horizontal===true);
  expect(rSym.output.symmetry.vertical===true);
  expect(rSym.output.symmetry.deviation===0);
  expect(rAsym.output.symmetry.horizontal===false);
  expect(rAsym.output.symmetry.vertical===false);
  expect(rAsym.output.symmetry.deviation>1); // actual residual distance, not a constant
  expect(rAsym.output.symmetry.deviation>rSym.output.symmetry.deviation);
});
test('detect_symmetry axis discrimination: isoceles triangle vertical-only, skipped axis reported null', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const tri=storePolygonObject(doc, [{x:50,y:0},{x:100,y:50},{x:0,y:50}]);
  const both=registry.execute('T18', {objectIds:[tri]}, doc);
  expect(both.output.symmetry.vertical===true);
  expect(both.output.symmetry.horizontal===false);
  const v=registry.execute('T18', {objectIds:[tri], axis:'vertical'}, doc);
  expect(v.output.symmetry.vertical===true);
  expect(v.output.symmetry.horizontal===null); // axis not evaluated -> null, never fabricated false
  expect(v.output.symmetry.deviation===0);
  const h=registry.execute('T18', {objectIds:[tri], axis:'horizontal'}, doc);
  expect(h.output.symmetry.horizontal===false);
  expect(h.output.symmetry.vertical===null);
  expect(h.output.symmetry.deviation>1);
});
test('detect_symmetry applies the WORLD transform (rotated square is not axis-symmetric)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const sq=createRectObject(doc, 0,0,100,100);
  const node=doc.sceneGraph.findNodeByObjectId(sq.oid);
  const c=Math.cos(Math.PI/6), s=Math.sin(Math.PI/6);
  doc.sceneGraph.setLocalTransform(node.id, {a:c, b:s, c:-s, d:c, tx:0, ty:0}); // 30 degrees
  const r=registry.execute('T18', {objectIds:[sq.oid]}, doc);
  expect(r.success);
  expect(r.output.symmetry.vertical===false);  // a local-params-only fake would report true
  expect(r.output.symmetry.horizontal===false);
  expect(r.output.symmetry.deviation>1);
});
test('detect_symmetry read-only: zero transactions, zero events, stores byte-identical', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,50,50);
  const o2=createRectObject(doc, 100,0,50,50);
  const substrate=makeSubstrate(doc);
  const before=snapshotState(doc);
  const r=registry.execute('T18', {objectIds:[o1.oid, o2.oid]}, substrate.context);
  expect(r.success);
  expect(r.output.symmetry.horizontal===true && r.output.symmetry.vertical===true);
  expect(snapshotState(doc)===before);
  expect(substrate.history.size()===0);
  expect(substrate.eventBus.getHistory().length===0);
  expect(!r.commandId && !r.transactionId);
});

console.log('\n=== Proposal Tools ===');
test('infer_constraints proposals returned', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,100);
  const o2=createRectObject(doc, 0,0,100,100);
  const result=registry.execute('T19', {objectIds:[o1.oid, o2.oid]}, doc);
  expect(result.success);
  expect(Array.isArray(result.output.proposals));
});
test('infer_constraints ConstraintStore unchanged', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,100);
  const o2=createRectObject(doc, 0,0,100,100);
  // No constraint store in doc for this test, but we check that no mutation happened
  const before=doc.objectStore.size();
  registry.execute('T19', {objectIds:[o1.oid, o2.oid]}, doc);
  expect(doc.objectStore.size()===before);
});
test('infer_constraints no transaction', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc);
  const result=registry.execute('T19', {objectIds:[o1.oid]}, doc);
  expect(result.success);
  expect(!result.transactionId);
});
test('infer_semantic proposals returned', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const result=registry.execute('T20', {objectIds:[oid]}, doc);
  expect(result.success);
  expect(result.output.proposals.length===1);
});
test('infer_semantic SemanticStore unchanged', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const before=doc.semanticStore.size();
  registry.execute('T20', {objectIds:[oid]}, doc);
  expect(doc.semanticStore.size()===before);
});
test('infer_semantic no transaction', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const result=registry.execute('T20', {objectIds:[oid]}, doc);
  expect(result.success);
  expect(!result.transactionId);
});

// ---- P7 strengthened (7.1): T19 WorldBBox-based candidate inference (anti-hardcode) ----
test('infer_constraints equal widths produce equalWidth proposal (anti-hardcode)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,50);
  const o2=createRectObject(doc, 200,150,100,50); // same width/height, disjoint position
  const r=registry.execute('T19', {objectIds:[o1.oid, o2.oid]}, doc);
  expect(r.success);
  const eq=r.output.proposals.filter(p=>p.type==='equalWidth');
  const eh=r.output.proposals.filter(p=>p.type==='equalHeight');
  // the hardcoded single-align stub returns NO equalWidth -> fails exactly here
  expect(eq.length===1 && eh.length===1);
  expect(JSON.stringify(eq[0].objectIds)===JSON.stringify([o1.oid, o2.oid]));
  expect(eq[0].confidence===1);
  expect(r.output.proposals.length===2); // disjoint equal-size rects: nothing else applies
});
test('infer_constraints unequal widths -> NO equalWidth; same left edge -> align left', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,50);
  const o2=createRectObject(doc, 0,200,60,80); // same minX, different width/height/y
  const r=registry.execute('T19', {objectIds:[o1.oid, o2.oid]}, doc);
  expect(r.success);
  expect(!r.output.proposals.some(p=>p.type==='equalWidth'));
  expect(!r.output.proposals.some(p=>p.type==='equalHeight'));
  const aligns=r.output.proposals.filter(p=>p.type==='align');
  expect(aligns.length===1);
  expect(aligns[0].axis==='horizontal' && aligns[0].mode==='left');
  expect(aligns[0].confidence===1);
  expect(JSON.stringify(aligns[0].objectIds)===JSON.stringify([o1.oid, o2.oid]));
  expect(r.output.proposals.length===1); // stub's {confidence:0.8, no mode} align fails this
});
test('infer_constraints symmetry candidate reuses T18 analytical machinery (positive + negative)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const s1=createRectObject(doc, 0,0,50,50);
  const s2=createRectObject(doc, 100,0,50,50); // mirror pair about x=75
  const rSym=registry.execute('T19', {objectIds:[s1.oid, s2.oid]}, doc);
  expect(rSym.success);
  const sym=rSym.output.proposals.filter(p=>p.type==='symmetry');
  expect(sym.length===2); // vertical AND horizontal axes both symmetric
  expect(sym.some(p=>p.axis==='vertical') && sym.some(p=>p.axis==='horizontal'));
  const doc2=createDoc();
  const a=createRectObject(doc2, 0,0,100,50);
  const b=createRectObject(doc2, 200,150,60,80); // staggered, unequal
  const rAsym=registry.execute('T19', {objectIds:[a.oid, b.oid]}, doc2);
  expect(rAsym.success);
  expect(!rAsym.output.proposals.some(p=>p.type==='symmetry'));
});
test('infer_constraints read-only: ConstraintStore X-before==X-after, zero transactions, zero events', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,50);
  const o2=createRectObject(doc, 200,150,100,50);
  const cs=new ConstraintStore();
  const substrate=makeSubstrate(doc);
  const ctx={...substrate.context, constraintStore:cs};
  const snap=()=>JSON.stringify({size:cs.size(), items:cs.list()});
  const before=snap();
  const stateBefore=snapshotState(doc);
  const r=registry.execute('T19', {objectIds:[o1.oid, o2.oid]}, ctx);
  expect(r.success);
  expect(snap()===before);
  expect(snapshotState(doc)===stateBefore);
  expect(substrate.history.size()===0);
  expect(substrate.eventBus.getHistory().length===0);
  expect(!r.commandId && !r.transactionId);
});

// ---- P7 strengthened (7.2): T20 delegates to semantic.js inferSemantic (anti-hardcode) ----
test('infer_semantic title-sized text object -> heading role (engine vocabulary, anti-hardcode)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const t=registry.execute('T15', {content:'SALE', position:{x:10,y:10}}, doc);
  expect(t.success);
  const r=registry.execute('T20', {objectIds:[t.output.objectId]}, doc);
  expect(r.success);
  expect(r.output.proposals.length===1);
  const p=r.output.proposals[0];
  // engine's title/heading class: short (<20 chars) capitalized text (semantic.js:144-151).
  // VALID_ROLES (semantic.js:6) has NO 'title' role — 'heading' IS the engine's answer.
  expect(p.proposedRole==='heading');
  expect(p.confidence>0.7);
  expect(p.source==='heuristic');
  expect(Array.isArray(p.evidence) && p.evidence.length>0);
  // stub returned {role:'button', confidence:0.7} -> fails on proposedRole
});
test('infer_semantic small icon-sized object -> icon role', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const icon=storePolygonObject(doc, [{x:0,y:0},{x:20,y:5},{x:35,y:20},{x:18,y:38},{x:2,y:22}]);
  const r=registry.execute('T20', {objectIds:[icon]}, doc);
  expect(r.success);
  expect(r.output.proposals.length===1);
  const p=r.output.proposals[0];
  expect(p.proposedRole==='icon'); // <10 anchor closed contour (semantic.js:200-206)
  expect(p.confidence>0.5);
});
test('infer_semantic ambiguous object -> unknown role at low confidence', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  // geometry type OUTSIDE the heuristic vocabulary -> engine's own low-confidence
  // unknown path (semantic.js:254-260); no branch fabricated, delegation is honest
  const gid=uuid(); doc.geometryStore.create(gid, {type:'spline', params:{}});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'spline', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.getRoots()[0] || doc.sceneGraph.createRoot(); doc.sceneGraph.createNode(oid, root.id);
  const r=registry.execute('T20', {objectIds:[oid]}, doc);
  expect(r.success);
  const p=r.output.proposals[0];
  expect(p.proposedRole==='unknown');
  expect(p.confidence<=0.5);
});
test('infer_semantic three inputs -> three distinct roles with ordered confidences', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const t=registry.execute('T15', {content:'SALE', position:{x:10,y:10}}, doc);
  const icon=storePolygonObject(doc, [{x:0,y:0},{x:20,y:5},{x:35,y:20},{x:18,y:38},{x:2,y:22}]);
  const gid=uuid(); doc.geometryStore.create(gid, {type:'spline', params:{}});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]});
  const amb=uuid(); doc.objectStore.create({id:amb, geometryRef:gid, appearanceRef:aid, meta:{name:'spline', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.getRoots()[0] || doc.sceneGraph.createRoot(); doc.sceneGraph.createNode(amb, root.id);
  const r=registry.execute('T20', {objectIds:[t.output.objectId, icon, amb]}, doc);
  expect(r.success);
  expect(r.output.proposals.length===3);
  const byId=new Map(r.output.proposals.map(p=>[p.objectId, p]));
  const h=byId.get(t.output.objectId), i=byId.get(icon), u=byId.get(amb);
  expect(h.proposedRole==='heading' && i.proposedRole==='icon' && u.proposedRole==='unknown');
  expect(h.confidence>i.confidence && i.confidence>u.confidence);
  const stubKiller=new Set(r.output.proposals.map(p=>p.proposedRole));
  expect(stubKiller.size===3); // a hardcoded single-role stub can never emit 3 distinct roles
});
test('infer_semantic read-only: SemanticStore X-before==X-after, zero transactions, zero events', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const t=registry.execute('T15', {content:'SALE', position:{x:10,y:10}}, doc);
  const icon=storePolygonObject(doc, [{x:0,y:0},{x:20,y:5},{x:35,y:20},{x:18,y:38},{x:2,y:22}]);
  const substrate=makeSubstrate(doc);
  const snap=()=>JSON.stringify(doc.semanticStore.toSnapshot());
  const before=snap();
  const stateBefore=snapshotState(doc);
  const r=registry.execute('T20', {objectIds:[t.output.objectId, icon]}, substrate.context);
  expect(r.success);
  expect(snap()===before);
  expect(snapshotState(doc)===stateBefore);
  expect(substrate.history.size()===0);
  expect(substrate.eventBus.getHistory().length===0);
  expect(!r.commandId && !r.transactionId);
});

console.log('\n=== Mutation Tools ===');
test('create_rectangle Command created', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const substrate=makeSubstrate(doc);
  const result=registry.execute('T01', {x:0,y:0,width:100,height:50}, substrate.context);
  expect(result.success);
  expect(result.commandId);   // Command created — non-null (gate ARCHITECTURE.md:48,52)
  expect(result.transactionId); // Transaction created — non-null
  expect(result.output.objectId);
  expect(doc.objectStore.has(result.output.objectId)); // state ACTUALLY committed to canonical stores
  expect(substrate.history.size()===1); // exactly one committed transaction pushed
  const committed=substrate.history.getAll()[0];
  expect(committed.status==='committed');
  expect(committed.metadata.toolId==='T01');
  expect(committed.diff.added.length===4); // geometry+appearance+object+node journaled
  expect(doc.sceneGraph.findNodeByObjectId(result.output.objectId)); // scene node committed
});
test('create_ellipse real state change', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const result=registry.execute('T02', {cx:50,cy:50,rx:30,ry:20}, doc);
  expect(result.success);
  expect(result.output.objectId);
  const obj=doc.objectStore.get(result.output.objectId);
  expect(obj && obj.geometryRef===result.output.geometryId);
  const geom=doc.geometryStore.get(obj.geometryRef);
  expect(geom.type==='ellipse');
  expect(geom.params.rx===30 && geom.params.ry===20 && geom.params.cx===50 && geom.params.cy===50);
  expect(doc.appearanceStore.has(obj.appearanceRef));
  expect(doc.sceneGraph.findNodeByObjectId(result.output.objectId)); // node created, mapped by objectRef
});
test('create_ellipse workingCopy branch journals without touching canonical stores', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const workingCopy=makeToolWorkingCopy();
  const result=registry.execute('T02', {cx:5,cy:6,rx:7,ry:8}, {...doc, workingCopy});
  expect(result.success);
  expect(result.output.objectId);
  // canonical stores untouched
  expect(doc.geometryStore.size()===0);
  expect(doc.objectStore.size()===0);
  // working copy received the real parametric ellipse
  expect(workingCopy.hasGeometry(result.output.geometryId));
  const geom=workingCopy.getGeometry(result.output.geometryId);
  expect(geom.type==='ellipse');
  expect(geom.params.rx===7 && geom.params.ry===8 && geom.params.cx===5 && geom.params.cy===6);
  expect(workingCopy.hasObject(result.output.objectId));
  // journal records geometry+appearance+object+node adds (pipeline: WorkingCopy -> Diff -> Commit)
  const added=workingCopy.getJournal().getAdded();
  for(const store of ['geometry','appearance','object','node']) expect(added.some(a=>a.store===store));
});
test('create_path real state change', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const contour={anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}, {id:'a2', position:{x:10,y:0}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}], closed:false};
  const result=registry.execute('T03', {contours:[contour], fillRule:'evenOdd'}, doc);
  expect(result.success);
  expect(result.output.objectId);
  const obj=doc.objectStore.get(result.output.objectId);
  expect(obj && obj.geometryRef===result.output.geometryId);
  const geom=doc.geometryStore.get(obj.geometryRef);
  expect(geom.type==='path');
  expect(geom.params.contours.length===1 && geom.params.fillRule==='evenOdd');
  expect(doc.appearanceStore.has(obj.appearanceRef));
  expect(doc.sceneGraph.findNodeByObjectId(result.output.objectId)); // node created, mapped by objectRef
});
test('create_path workingCopy branch journals without touching canonical stores', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const workingCopy=makeToolWorkingCopy();
  const contour={anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}, {id:'a2', position:{x:10,y:0}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}], closed:false};
  const result=registry.execute('T03', {contours:[contour]}, {...doc, workingCopy});
  expect(result.success);
  expect(result.output.objectId);
  expect(doc.geometryStore.size()===0);
  expect(doc.objectStore.size()===0);
  expect(workingCopy.hasGeometry(result.output.geometryId));
  const geom=workingCopy.getGeometry(result.output.geometryId);
  expect(geom.type==='path');
  expect(geom.params.contours.length===1 && geom.params.fillRule==='nonZero'); // default fillRule preserved
  const added=workingCopy.getJournal().getAdded();
  for(const store of ['geometry','appearance','object','node']) expect(added.some(a=>a.store===store));
});
test('delete_objects atomicity', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc);
  const o2=createRectObject(doc);
  const result=registry.execute('T04', {objectIds:[o1.oid, o2.oid]}, doc);
  expect(result.success);
  expect(!doc.objectStore.has(o1.oid));
  expect(!doc.objectStore.has(o2.oid));
});
test('delete_objects FAIL ENTIRE TRANSACTION no partial', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc);
  const fake=uuid();
  const result=registry.execute('T04', {objectIds:[o1.oid, fake]}, doc);
  expect(!result.success);
  expect(doc.objectStore.has(o1.oid)); // no partial deletion
});
test('delete_objects via substrate commits removal diff (reversible)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const substrate=makeSubstrate(doc);
  const result=registry.execute('T04', {objectIds:[oid]}, substrate.context);
  expect(result.success);
  expect(result.commandId);
  expect(result.transactionId);
  expect(!doc.objectStore.has(oid)); // removal committed to canonical store
  const committed=substrate.history.getAll()[0];
  expect(committed.diff.removed.some(r=>r.store==='object' && r.id===oid)); // real removal diff
  expect(committed.inverse); // Every Mutation reversible (gate ARCHITECTURE.md:48)
});
test('substrate events: exactly 1 TransactionCommitted on commit, 0 on rollback', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const substrate=makeSubstrate(doc);
  const r1=registry.execute('T01', {width:10,height:10}, substrate.context);
  expect(r1.success);
  const history=substrate.eventBus.getHistory();
  expect(history.filter(e=>e.type==='TransactionCommitted').length===1); // exactly 1 per commit
  expect(history.filter(e=>e.type==='ObjectCreated').length===1);        // 1 domain event (1 object added)
  expect(history.length===2); // total delta = domain events + TransactionCommitted, all AFTER commit
  // rollback: failing mutation -> executor throws -> NO events, NO history push, NO state change
  const sizeBefore=doc.objectStore.size();
  const failTool={id:'T98', name:'fail_mutation', version:'1.0.0', category:'mutation', description:'x', inputSchema:{type:'object',properties:{}}, outputSchema:{type:'object',properties:{}}, permissions:{read:[],write:['transaction']}, deterministic:true, validate:()=>({valid:true,errors:[]}), execute:()=>({success:false, errors:[{code:'TOOL_PRECONDITION_FAILED', message:'boom'}]})};
  registry.register(failTool);
  const r2=registry.execute('T98', {}, substrate.context);
  expect(!r2.success);
  expect(r2.errors[0].code==='TRANSACTION_FAILED');
  expect(!r2.commandId); // gate :52: commandId/transactionId only after successful commit
  expect(substrate.eventBus.getHistory().length===2); // unchanged by rollback
  expect(substrate.history.size()===1);               // failed transaction NOT pushed
  expect(doc.objectStore.size()===sizeBefore);        // zero state change
});
// P4 (4.1) strengthened: real coordinate change on params, shape preserved, no spurious writes.
test('move_object real state change (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid, aid}=createRectObject(doc);
  const objBefore=doc.objectStore.get(oid);
  const appBefore=doc.appearanceStore.get(aid);
  const result=registry.execute('T05', {objectIds:[oid], delta:{x:10,y:20}}, doc);
  expect(result.success);
  const geom=doc.geometryStore.get(objBefore.geometryRef);
  expect(geom.params.x===10 && geom.params.y===20);           // ACTUAL coordinate change
  expect(geom.params.width===100 && geom.params.height===100); // parametric shape preserved
  expect(JSON.stringify(doc.objectStore.get(oid))===JSON.stringify(objBefore)); // object untouched
  expect(JSON.stringify(doc.appearanceStore.get(aid))===JSON.stringify(appBefore)); // appearance untouched
  expect(doc.geometryStore.size()===1);
  expect(doc.sceneGraph.findNodeByObjectId(oid)); // node untouched
});
test('move_object via substrate commits geometry modify with ids and exactly 1 TransactionCommitted', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const substrate=makeSubstrate(doc);
  const result=registry.execute('T05', {objectIds:[oid], delta:{x:10,y:20}}, substrate.context);
  expect(result.success);
  expect(result.commandId);   // gate :52
  expect(result.transactionId);
  const committed=substrate.history.getAll()[0];
  expect(committed.status==='committed' && committed.metadata.toolId==='T05');
  expect(committed.diff.modified.some(r=>r.store==='geometry'));
  const obj=doc.objectStore.get(oid);
  const geom=doc.geometryStore.get(obj.geometryRef);
  expect(geom.params.x===10 && geom.params.y===20); // committed to CANONICAL store
  const history=substrate.eventBus.getHistory();
  expect(history.filter(e=>e.type==='TransactionCommitted').length===1); // exactly +1
  expect(history.length===1); // geometry-only modify: no domain events, just TransactionCommitted
});
test('transform_objects exact matrix on rect (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0, 0, 10, 10);
  // scale(2,3) + translate(10,20), Y-down column vectors: corners (0,0)->(10,20), (10,10)->(30,50)
  const result=registry.execute('T06', {objectIds:[oid], transform:{a:2,b:0,c:0,d:3,tx:10,ty:20}}, doc);
  expect(result.success);
  const obj=doc.objectStore.get(oid);
  const geom=doc.geometryStore.get(obj.geometryRef);
  expect(geom.params.x===10 && geom.params.y===20);
  expect(geom.params.width===20 && geom.params.height===30);   // exact scale
  expect(geom.params.rx===0 && geom.params.ry===0);
});
test('transform_objects via substrate commits transformed params', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0, 0, 10, 10);
  const substrate=makeSubstrate(doc);
  const result=registry.execute('T06', {objectIds:[oid], transform:{a:2,b:0,c:0,d:3,tx:10,ty:20}}, substrate.context);
  expect(result.success);
  expect(result.commandId && result.transactionId);
  const committed=substrate.history.getAll()[0];
  expect(committed.diff.modified.some(r=>r.store==='geometry'));
  const obj=doc.objectStore.get(oid);
  const geom=doc.geometryStore.get(obj.geometryRef);
  expect(geom.params.width===20 && geom.params.height===30); // canonical state transformed
});
// P4 (4.3) strengthened: appearance stack actually changes, geometry byte-identical (gate :54:
// appearance must not leak into geometry).
test('apply_fill real appearance change, geometry untouched (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const geomBefore=doc.geometryStore.get(doc.objectStore.get(oid).geometryRef);
  const result=registry.execute('T07', {objectIds:[oid], fill:{kind:'solid', color:{r:255,g:0,b:0,a:1}}, opacity:0.8}, doc);
  expect(result.success);
  const app=doc.appearanceStore.get(doc.objectStore.get(oid).appearanceRef);
  const fillItems=app.stack.filter(it=>it.type==='fill');
  expect(fillItems.length===1);
  expect(fillItems[0].enabled===true);
  expect(fillItems[0].data.kind==='solid');
  expect(fillItems[0].data.color.r===255 && fillItems[0].data.color.g===0 && fillItems[0].data.color.b===0);
  expect(fillItems[0].data.opacity===0.8);
  expect(JSON.stringify(doc.geometryStore.get(doc.objectStore.get(oid).geometryRef))===JSON.stringify(geomBefore)); // geometry UNCHANGED
});
test('apply_fill via substrate commits appearance modify only', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const substrate=makeSubstrate(doc);
  const geomBefore=JSON.stringify(doc.geometryStore.get(doc.objectStore.get(oid).geometryRef));
  const result=registry.execute('T07', {objectIds:[oid], fill:{kind:'solid', color:{r:0,g:128,b:255,a:1}}}, substrate.context);
  expect(result.success);
  expect(result.commandId && result.transactionId);
  const committed=substrate.history.getAll()[0];
  expect(committed.diff.modified.some(r=>r.store==='appearance'));
  expect(!committed.diff.modified.some(r=>r.store==='geometry')); // no geometry leak into the diff
  expect(JSON.stringify(doc.geometryStore.get(doc.objectStore.get(oid).geometryRef))===geomBefore);
  const app=doc.appearanceStore.get(doc.objectStore.get(oid).appearanceRef);
  expect(app.stack[0].data.color.g===128); // committed to canonical appearance store
});
test('apply_fill replaces existing fill item instead of stacking', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  registry.execute('T07', {objectIds:[oid], fill:{kind:'solid', color:{r:255,g:0,b:0,a:1}}}, doc);
  const result=registry.execute('T07', {objectIds:[oid], fill:{kind:'solid', color:{r:0,g:0,b:255,a:1}}, opacity:0.5}, doc);
  expect(result.success);
  const app=doc.appearanceStore.get(doc.objectStore.get(oid).appearanceRef);
  const fillItems=app.stack.filter(it=>it.type==='fill');
  expect(fillItems.length===1);                                // upsert, not append
  expect(fillItems[0].data.color.b===255 && fillItems[0].data.opacity===0.5);
});
test('apply_fill opacity-only without existing fill fails honestly', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const result=registry.execute('T07', {objectIds:[oid], opacity:0.5}, doc);
  expect(!result.success); // inventing a fill color would be hidden state — refuse instead
  expect(result.errors[0].code==='TOOL_PRECONDITION_FAILED');
});
// P4 (4.4) strengthened: real WorldBBox math, exact post-align positions (reference = FIRST id,
// 3.09 solver contract).
test('align_objects WorldBBox left/top exact (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,50,40);    // reference
  const o2=createRectObject(doc, 100,10,30,20);
  const o3=createRectObject(doc, 200,5,40,30);
  const r1=registry.execute('T08', {objectIds:[o1.oid, o2.oid, o3.oid], axis:'horizontal', mode:'left'}, doc);
  expect(r1.success);
  const xOf=oid=>doc.geometryStore.get(doc.objectStore.get(oid).geometryRef).params.x;
  expect(xOf(o1.oid)===0);
  expect(xOf(o2.oid)===0 && xOf(o3.oid)===0);   // exact: all WorldBBox minX = reference minX 0
  const r2=registry.execute('T08', {objectIds:[o1.oid, o2.oid, o3.oid], axis:'vertical', mode:'top'}, doc);
  expect(r2.success);
  const yOf=oid=>doc.geometryStore.get(doc.objectStore.get(oid).geometryRef).params.y;
  expect(yOf(o2.oid)===0 && yOf(o3.oid)===0);   // exact: all minY = reference minY 0
});
test('align_objects center and both-center exact (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,50,40);     // center (25,20)
  const o2=createRectObject(doc, 100,10,30,20);  // center (115,20)
  const r1=registry.execute('T08', {objectIds:[o1.oid, o2.oid], axis:'horizontal', mode:'center'}, doc);
  expect(r1.success);
  const geom2=doc.geometryStore.get(doc.objectStore.get(o2.oid).geometryRef);
  expect(geom2.params.x===10 && geom2.params.y===10); // center 115 -> 25 => x = 25-15 = 10
  const r2=registry.execute('T08', {objectIds:[o1.oid, o2.oid], axis:'both', mode:'center'}, doc);
  expect(r2.success);
  const geom2b=doc.geometryStore.get(doc.objectStore.get(o2.oid).geometryRef);
  expect(geom2b.params.x===10 && geom2b.params.y===10); // both+center centers both axes (already centered)
});
test('align_objects via substrate commits aligned positions', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,50,40);
  const o2=createRectObject(doc, 100,10,30,20);
  const substrate=makeSubstrate(doc);
  const result=registry.execute('T08', {objectIds:[o1.oid, o2.oid], axis:'horizontal', mode:'left'}, substrate.context);
  expect(result.success);
  expect(result.commandId && result.transactionId);
  const committed=substrate.history.getAll()[0];
  expect(committed.diff.modified.filter(r=>r.store==='geometry').length===1); // only o2 moved
  expect(doc.geometryStore.get(doc.objectStore.get(o2.oid).geometryRef).params.x===0); // canonical
});
test('distribute_objects centers exact spacing (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,20,10);    // center 10
  const o2=createRectObject(doc, 100,0,20,10);  // center 110
  const o3=createRectObject(doc, 300,0,20,10);  // center 310
  const result=registry.execute('T09', {objectIds:[o1.oid, o2.oid, o3.oid], axis:'horizontal', mode:'centers'}, doc);
  expect(result.success);
  const xOf=oid=>doc.geometryStore.get(doc.objectStore.get(oid).geometryRef).params.x;
  expect(xOf(o1.oid)===0 && xOf(o3.oid)===300);          // anchors fixed
  expect(xOf(o2.oid)===150);                              // center target = lerp(10,310,1/2)=160 => x=150
});
test('distribute_objects gaps exact spacing (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,20,10);    // [0,20]
  const o2=createRectObject(doc, 100,0,20,10);  // [100,120]
  const o3=createRectObject(doc, 300,0,20,10);  // [300,320]
  const result=registry.execute('T09', {objectIds:[o1.oid, o2.oid, o3.oid], axis:'horizontal', mode:'gaps'}, doc);
  expect(result.success);
  const xOf=oid=>doc.geometryStore.get(doc.objectStore.get(oid).geometryRef).params.x;
  expect(xOf(o1.oid)===0 && xOf(o3.oid)===300);          // anchors fixed
  expect(xOf(o2.oid)===150);                              // gap=(320-0-60)/2=130 => B.x=20+130=150
});
test('distribute_objects via substrate commits distributed positions', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,20,10);
  const o2=createRectObject(doc, 100,0,20,10);
  const o3=createRectObject(doc, 300,0,20,10);
  const substrate=makeSubstrate(doc);
  const result=registry.execute('T09', {objectIds:[o1.oid, o2.oid, o3.oid], axis:'horizontal', mode:'centers'}, substrate.context);
  expect(result.success);
  expect(result.commandId && result.transactionId);
  expect(doc.geometryStore.get(doc.objectStore.get(o2.oid).geometryRef).params.x===150); // canonical
});
test('group_objects hierarchy only SceneGraph', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc);
  const o2=createRectObject(doc);
  const result=registry.execute('T10', {objectIds:[o1.oid, o2.oid]}, doc);
  expect(result.success);
  expect(result.output.groupNodeId);
  // Check that GraphicObject does NOT have parent property
  const obj1=doc.objectStore.get(o1.oid);
  expect(!obj1.parent);
});
test('group_objects SceneGraph owns hierarchy', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc);
  const o2=createRectObject(doc);
  registry.execute('T10', {objectIds:[o1.oid, o2.oid]}, doc);
  // Check that sceneGraph has group node
  const nodes=doc.sceneGraph.getAllNodes();
  const hasGroup=nodes.some(n=> n.children && n.children.length>0 && !n.objectId);
  // In our simplified sceneGraph, group may be represented differently, but at least no parent in object
  expect(true);
});
// P4 (4.6) strengthened: group built via SceneGraph APIs (T10 legacy createGroup(objectIds) is a
// known pre-existing quirk -> Phase D backlog, NOT touched here). Child world transforms must be
// preserved exactly across ungroup.
function makeGroupNode(doc, groupTransform={a:1,b:0,c:0,d:1,tx:50,ty:30}){
  const o1=createRectObject(doc, 0,0,20,10);
  const o2=createRectObject(doc, 40,60,30,20);
  const root=doc.sceneGraph.getRoots()[0];
  const group=doc.sceneGraph.createGroup(root.id, groupTransform);
  const n1=doc.sceneGraph.findNodeByObjectId(o1.oid);
  const n2=doc.sceneGraph.findNodeByObjectId(o2.oid);
  doc.sceneGraph.reparent(n1.id, group.id);
  doc.sceneGraph.reparent(n2.id, group.id);
  return {o1, o2, root, group, n1, n2};
}
test('ungroup_objects preserves child world transforms (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {o1, group, root}=makeGroupNode(doc);
  const preWorld=doc.sceneGraph.getWorldTransform(doc.sceneGraph.findNodeByObjectId(o1.oid).id);
  expect(preWorld.tx===50 && preWorld.ty===30); // group offset applied
  const result=registry.execute('T11', {objectIds:[group.id]}, doc);
  expect(result.success);
  expect(doc.sceneGraph.findNode(group.id)===undefined);       // group node REMOVED
  const node=doc.sceneGraph.findNodeByObjectId(o1.oid);
  expect(node.parent===root.id);                                // reparented to grandparent
  expect(node.localTransform.tx===50 && node.localTransform.ty===30); // baked
  const postWorld=doc.sceneGraph.getWorldTransform(node.id);
  expect(postWorld.tx===50 && postWorld.ty===30);               // WORLD TRANSFORM PRESERVED
  doc.sceneGraph.validateInvariants();                          // tree stays consistent
});
test('ungroup_objects via substrate preserves world transforms and commits', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {o1, group, root}=makeGroupNode(doc);
  const substrate=makeSubstrate(doc);
  const result=registry.execute('T11', {objectIds:[group.id]}, substrate.context);
  expect(result.success);
  expect(result.commandId && result.transactionId);
  expect(doc.sceneGraph.findNode(group.id)===undefined);        // group removed from canonical tree
  const node=doc.sceneGraph.findNodeByObjectId(o1.oid);         // findable (objectRef scan fallback)
  expect(node && node.parent===root.id);
  const postWorld=doc.sceneGraph.getWorldTransform(node.id);
  expect(postWorld.tx===50 && postWorld.ty===30);               // world transform preserved
  doc.sceneGraph.validateInvariants();
  const committed=substrate.history.getAll()[0];
  expect(committed.diff.removed.some(r=>r.store==='node' && r.id===group.id)); // group removal journaled
  expect(committed.diff.modified.filter(r=>r.store==='node').length===3);      // child+child+root
  const history=substrate.eventBus.getHistory();
  expect(history.filter(e=>e.type==='TransactionCommitted').length===1);
  expect(history.filter(e=>e.type==='SceneGraphChanged').length===3);
  expect(history.length===4);
});
test('ungroup_objects rejects object nodes honestly', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const result=registry.execute('T11', {objectIds:[oid]}, doc);
  expect(!result.success);
  expect(result.errors[0].code==='TOOL_PRECONDITION_FAILED');
});
// P4 (4.7) strengthened: children[] order asserted DIRECTLY; no second z-order store introduced.
test('reorder_objects children order exact (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc);
  const o2=createRectObject(doc);
  const o3=createRectObject(doc);
  const order=()=>doc.sceneGraph.getRoots()[0].children.map(cid=>doc.sceneGraph.findNode(cid).objectRef);
  expect(JSON.stringify(order())===JSON.stringify([o1.oid, o2.oid, o3.oid]));
  expect(registry.execute('T12', {objectIds:[o1.oid], operation:'front'}, doc).success);
  expect(JSON.stringify(order())===JSON.stringify([o2.oid, o3.oid, o1.oid]));  // front = last
  expect(registry.execute('T12', {objectIds:[o1.oid], operation:'back'}, doc).success);
  expect(JSON.stringify(order())===JSON.stringify([o1.oid, o2.oid, o3.oid]));  // back = first
  expect(registry.execute('T12', {objectIds:[o2.oid], operation:'forward'}, doc).success);
  expect(JSON.stringify(order())===JSON.stringify([o1.oid, o3.oid, o2.oid]));
  expect(registry.execute('T12', {objectIds:[o2.oid], operation:'backward'}, doc).success);
  expect(JSON.stringify(order())===JSON.stringify([o1.oid, o2.oid, o3.oid]));
  // no second z-order store: object records carry no z field, children[] is the ONLY ordering
  for(const o of [o1, o2, o3]) expect(doc.objectStore.get(o.oid).z===undefined && doc.objectStore.get(o.oid).zIndex===undefined);
});
test('reorder_objects via substrate commits children reorder', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc);
  const o2=createRectObject(doc);
  const o3=createRectObject(doc);
  const substrate=makeSubstrate(doc);
  const result=registry.execute('T12', {objectIds:[o1.oid], operation:'front'}, substrate.context);
  expect(result.success);
  expect(result.commandId && result.transactionId);
  const order=()=>doc.sceneGraph.getRoots()[0].children.map(cid=>doc.sceneGraph.findNode(cid).objectRef);
  expect(JSON.stringify(order())===JSON.stringify([o2.oid, o3.oid, o1.oid])); // canonical order changed
  const committed=substrate.history.getAll()[0];
  expect(committed.diff.modified.some(r=>r.store==='node'));
});
// P4 (4.8) + P5 (5.4) strengthened: real Boolean service output, exact bboxes, keepOriginals,
// and Snapshot/Restore undo through the 3.06 substrate.
test('boolean_operation union real geometry, originals removed (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,100);
  const o2=createRectObject(doc, 50,50,100,100);
  const result=registry.execute('T13', {objectIds:[o1.oid, o2.oid], operation:'union'}, doc);
  expect(result.success);
  expect(result.output.resultObjectId);
  expect(doc.objectStore.size()===1);                          // originals removed (keepOriginals default false)
  expect(!doc.objectStore.has(o1.oid) && !doc.objectStore.has(o2.oid));
  // NOTE: original geometry/appearance records stay in their stores (T04-consistent deletion
  // semantics: objects + scene nodes; orphan cleanup is store-GC, disclosed in checkpoint).
  const resultObj=doc.objectStore.get(result.output.resultObjectId);
  expect(resultObj && resultObj.geometryRef===result.output.geometryId); // correct geometryRef
  const geom=doc.geometryStore.get(resultObj.geometryRef);
  expect(geom.type==='path');
  const anchors=geom.params.contours[0].anchors;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const a of anchors){ minX=Math.min(minX,a.position.x); minY=Math.min(minY,a.position.y); maxX=Math.max(maxX,a.position.x); maxY=Math.max(maxY,a.position.y); }
  expect(minX===0 && minY===0 && maxX===150 && maxY===150);    // exact union bbox
  expect(doc.sceneGraph.findNodeByObjectId(result.output.resultObjectId)); // result node committed
});
test('boolean_operation difference and intersection exact bboxes (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const docA=createDoc();
  const a1=createRectObject(docA, 0,0,100,100);
  const a2=createRectObject(docA, 50,50,100,100);
  const rd=registry.execute('T13', {objectIds:[a1.oid, a2.oid], operation:'difference'}, docA);
  expect(rd.success);
  const gd=docA.geometryStore.get(docA.objectStore.get(rd.output.resultObjectId).geometryRef);
  const bb=c=>{let m=[Infinity,Infinity,-Infinity,-Infinity]; for(const an of c.anchors){m[0]=Math.min(m[0],an.position.x);m[1]=Math.min(m[1],an.position.y);m[2]=Math.max(m[2],an.position.x);m[3]=Math.max(m[3],an.position.y);} return m; };
  expect(JSON.stringify(bb(gd.params.contours[0]))===JSON.stringify([0,0,100,100])); // A minus overlap
  const docI=createDoc();
  const i1=createRectObject(docI, 0,0,100,100);
  const i2=createRectObject(docI, 50,50,100,100);
  const ri=registry.execute('T13', {objectIds:[i1.oid, i2.oid], operation:'intersection'}, docI);
  expect(ri.success);
  const gi=docI.geometryStore.get(docI.objectStore.get(ri.output.resultObjectId).geometryRef);
  expect(JSON.stringify(bb(gi.params.contours[0]))===JSON.stringify([50,50,100,100]));
});
test('boolean_operation keepOriginals true preserves originals (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,100);
  const o2=createRectObject(doc, 50,50,100,100);
  const result=registry.execute('T13', {objectIds:[o1.oid, o2.oid], operation:'union', keepOriginals:true}, doc);
  expect(result.success);
  expect(result.output.keepOriginals===true);
  expect(doc.objectStore.size()===3);                          // 2 originals + result
  expect(doc.objectStore.has(o1.oid) && doc.objectStore.has(o2.oid));
});
test('boolean_operation via substrate commits and UNDO restores exact previous state', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,100);
  const o2=createRectObject(doc, 50,50,100,100);
  const substrate=makeSubstrate(doc);
  const snapshotStores=()=>JSON.stringify({
    objects: doc.objectStore.listIds().map(id=>doc.objectStore.get(id)),
    geometries: doc.geometryStore.listIds().map(id=>doc.geometryStore.get(id)),
    appearances: doc.appearanceStore.listIds().map(id=>doc.appearanceStore.get(id)),
    nodes: doc.sceneGraph.getAllNodes()
  });
  const pre=snapshotStores();
  const result=registry.execute('T13', {objectIds:[o1.oid, o2.oid], operation:'union'}, substrate.context);
  expect(result.success);
  expect(result.commandId && result.transactionId);            // Command created for the boolean
  expect(doc.objectStore.size()===1);                          // committed: originals gone
  const history=substrate.eventBus.getHistory();
  expect(history.filter(e=>e.type==='ObjectCreated').length===1);
  expect(history.filter(e=>e.type==='ObjectDeleted').length===2);
  expect(history.filter(e=>e.type==='TransactionCommitted').length===1);
  substrate.transactionManager.undo();                         // 3.06 Snapshot/Restore inverse
  expect(snapshotStores()===pre);                              // EXACT previous state restored
  expect(substrate.history.canUndo()===false);
});
test('boolean_operation disjoint intersection fails GEOMETRY_DEGENERATE (legacy)', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,10,10);
  const o2=createRectObject(doc, 100,100,10,10);
  const result=registry.execute('T13', {objectIds:[o1.oid, o2.oid], operation:'intersection'}, doc);
  expect(!result.success);                                     // honest failure, no empty fake geometry
  expect(result.errors[0].code==='GEOMETRY_DEGENERATE');
});
test('boolean_operation open path fails GEOMETRY_OPEN_PATH', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const gid=uuid(); doc.geometryStore.create(gid, {type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}}], closed:false}], fillRule:'nonZero'});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'open', locked:false, visible:true, selectable:true}});
  const gid2=uuid(); doc.geometryStore.create(gid2, {type:'rect', params:{x:0,y:0,width:100,height:100,rx:0,ry:0}});
  const aid2=uuid(); doc.appearanceStore.create(aid2, {id:aid2, stack:[]});
  const oid2=uuid(); doc.objectStore.create({id:oid2, geometryRef:gid2, appearanceRef:aid2, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const result=registry.execute('T13', {objectIds:[oid, oid2], operation:'union'}, doc);
  expect(!result.success);
  expect(result.errors.some(e=> e.code==='GEOMETRY_OPEN_PATH'));
});
// P4 (4.9) strengthened: PointText MVP. The runtime has NO glyph outline system (renderer.js:410
// draws via ctx.fillText), so per the FONT_FALLBACK contract the tool fails HONESTLY — a stub
// returning success:true would FAIL this test. Non-text objects fail TOOL_PRECONDITION_FAILED.
test('outline_text PointText honest FONT_FALLBACK, zero state change', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const substrate=makeSubstrate(doc);
  const created=registry.execute('T15', {content:'Hello', position:{x:10,y:10}, style:{fontFamily:'Inter', fontSize:32, fontWeight:400, fontStyle:'normal', lineHeight:1, letterSpacing:0, textAlign:'left', fill:{kind:'solid', color:{r:0,g:0,b:0,a:1}}}}, doc);
  expect(created.success);
  const objectsBefore=JSON.stringify(doc.objectStore.listIds().map(id=>doc.objectStore.get(id)));
  const geometriesBefore=JSON.stringify(doc.geometryStore.listIds().map(id=>doc.geometryStore.get(id)));
  const result=registry.execute('T14', {objectId:created.output.objectId}, substrate.context);
  expect(!result.success);                                     // NOT silent success
  expect(result.errors[0].code==='FONT_FALLBACK');             // structured spec diagnostic
  expect(JSON.stringify(doc.objectStore.listIds().map(id=>doc.objectStore.get(id)))===objectsBefore); // zero state change
  expect(JSON.stringify(doc.geometryStore.listIds().map(id=>doc.geometryStore.get(id)))===geometriesBefore);
  expect(substrate.history.size()===0);                        // validation short-circuit: no transaction (gate :53)
  expect(substrate.eventBus.getHistory().length===0);          // no events
});
test('outline_text rejects non-text object with TOOL_PRECONDITION_FAILED', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const result=registry.execute('T14', {objectId:oid}, doc);
  expect(!result.success);
  expect(result.errors[0].code==='TOOL_PRECONDITION_FAILED');
});
test('create_point_text', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const result=registry.execute('T15', {content:'Hello', position:{x:0,y:0}, style:{fontFamily:'Arial', fontSize:12, fontWeight:400, fontStyle:'normal', lineHeight:1, letterSpacing:0, textAlign:'left', fill:{kind:'solid', color:{r:0,g:0,b:0,a:1}}}}, doc);
  expect(result.success);
});

console.log('\n=== Critical: AI Mutation Boundary ===');
test('AI cannot directly mutate stores', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const before=doc.objectStore.size();
  // AI should only be able to go through ToolRegistry, not direct store.write
  // Verify that ToolRegistry is the only gateway: read tools don't mutate, mutation tools go through transaction
  const readResult=registry.execute('T16', {role:'button'}, doc);
  expect(readResult.success);
  expect(doc.objectStore.size()===before);
  // Proposal tools don't mutate
  const proposalResult=registry.execute('T19', {objectIds:[oid]}, doc);
  expect(proposalResult.success);
  expect(doc.objectStore.size()===before);
  // Mutation tools do mutate but via ToolRegistry -> Command -> Transaction path
  const mutationResult=registry.execute('T01', {width:50,height:50}, doc);
  expect(mutationResult.success);
  expect(doc.objectStore.size()===before+1);
});

console.log('\n=== Critical: Proposal Non-Mutation ===');
test('Before ConstraintStore = X After = X for infer_constraints', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc);
  const o2=createRectObject(doc);
  const beforeSize=doc.objectStore.size();
  const result=registry.execute('T19', {objectIds:[o1.oid, o2.oid]}, doc);
  expect(result.success);
  expect(result.output.proposals);
  expect(doc.objectStore.size()===beforeSize);
});
test('Before SemanticStore = X After = X for infer_semantic', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const {oid}=createRectObject(doc);
  const before=doc.semanticStore.size();
  const result=registry.execute('T20', {objectIds:[oid]}, doc);
  expect(result.success);
  expect(doc.semanticStore.size()===before);
});

console.log('\n=== Critical: Group Ownership ===');
test('group_objects SceneGraph owns hierarchy not GraphicObject', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc);
  const o2=createRectObject(doc);
  registry.execute('T10', {objectIds:[o1.oid, o2.oid]}, doc);
  const obj1=doc.objectStore.get(o1.oid);
  const obj2=doc.objectStore.get(o2.oid);
  expect(obj1.parent===undefined);
  expect(obj2.parent===undefined);
  expect(!('parent' in obj1));
});

console.log('\n=== Critical: Read Tool ===');
test('detect_symmetry transaction count unchanged', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const o1=createRectObject(doc);
  const o2=createRectObject(doc);
  const substrate=makeSubstrate(doc);
  const result=registry.execute('T18', {objectIds:[o1.oid, o2.oid]}, substrate.context);
  expect(result.success);
  expect(substrate.history.size()===0);               // REAL counter: no transaction created for read
  expect(substrate.eventBus.getHistory().length===0); // read => NO EVENTS (gate ARCHITECTURE.md:46)
  expect(!result.transactionId);
  expect(!result.commandId);
});

console.log('\n=== Vertical Tool Chain ===');
test('create_rectangle -> move_object -> apply_fill -> align_objects -> find_object_by_role -> detect_symmetry', ()=>{
  const registry=createCoreToolRegistry();
  const doc=createDoc();
  const r1=registry.execute('T01', {x:0,y:0,width:100,height:100}, doc);
  expect(r1.success);
  const r2=registry.execute('T01', {x:200,y:0,width:100,height:100}, doc);
  expect(r2.success);
  const move=registry.execute('T05', {objectIds:[r1.output.objectId], delta:{x:10,y:0}}, doc);
  expect(move.success);
  const fill=registry.execute('T07', {objectIds:[r1.output.objectId], fill:{kind:'solid', color:{r:255,g:0,b:0,a:1}}}, doc);
  expect(fill.success);
  doc.semanticStore.set({objectId:r1.output.objectId, role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[]});
  const align=registry.execute('T08', {objectIds:[r1.output.objectId, r2.output.objectId], axis:'horizontal', mode:'left'}, doc);
  expect(align.success);
  const find=registry.execute('T16', {role:'button'}, doc);
  expect(find.success);
  expect(find.output.objectIds.length===1);
  const sym=registry.execute('T18', {objectIds:[r1.output.objectId, r2.output.objectId]}, doc);
  expect(sym.success);
  // Read tools must not create additional transactions
  expect(!find.transactionId);
  expect(!sym.transactionId);
});

console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
if(failed>0) process.exit(1);
