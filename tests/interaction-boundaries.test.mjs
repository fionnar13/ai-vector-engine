// interaction-boundaries.test.mjs
// SALVAGE FILE — reconstructed from the corrupted tests/interaction.test_1.mjs
// (corruption: literal `\1` tokens at lines 580/594/645, a regex-replace accident
//  that replaced the identifier `aid`; 6 occurrences total, all repaired to `aid`).
//
// Contains ONLY the tests unique to interaction.test_1.mjs — i.e. tests whose
// boundary is NOT already covered by tests/interaction.test.mjs (the 55-test live
// file). tests/interaction.test.mjs is intentionally NOT modified.
//
// Step 5b resolution of the held-out 12th test ('renderer updates after commit',
// preserved UNMODIFIED in scripts/salvage/shadow/tests/interaction-boundaries.test.mjs
// — historical record, see its corrected header): route divergence — pointerDown
// handle-priority interception (interaction.js :934-943) sends its 10x10 center
// click to the transformManager SCALE path (every interior point of a 10x10
// object is within ~5px of a handle, so the drag/move route is unreachable), and
// its tx=95 move-semantics expectation can never be met by any commit-handler
// fix. Per user decision (b-prime) it STAYS in shadow/; this file gains TWO
// replacement tests covering both commit paths (drag path + transform path),
// and F-1 was fixed in BOTH handlers (two instances).
//
// Two tests in the original were vacuous `expect(true)` placeholders with the
// comment "Static check via file scan in real implementation":
//   - 'Core does not import window/document'
//   - 'No AI dependency'
// They are reconstructed here as the real static scans the original comments
// described (precedent: tests/architecture.test.mjs uses fs.readFileSync for
// static source checks). Deviation is flagged in the PHASE C report.
//
// PHASE C' CLOSURE (F.2) header note:
//   1. The two placeholder→real-scan upgrades are fs-based static scans: they
//      read src-js/interaction.js at runtime and fail if window/document usage
//      or AI-module imports appear (PHASE C upgrade from `expect(true)`).
//   2. F-1 TWO-INSTANCE DISCOVERY: investigating the route divergence of the
//      held-out 12th test revealed that handleTransformCommit carried the SAME
//      end-transform-reset-then-read-empty-preview bug class as
//      handleDragCommit. Both instances are fixed (Step 5: drag path; Step 5b:
//      transform path), each proven red→green against the exact pre-fix byte
//      state (md5-verified restores).
//   3. scripts/salvage/shadow/tests/interaction-boundaries.test.mjs is the
//      HISTORICAL RECORD of the original 12th test — preserved unmodified
//      (assertions character-identical; only its header documents context).
//   4. This file is the LIVE COUNTERPART of the held-out shadow test: the two
//      replacement tests here — 'renderer updates after commit (drag path)' and
//      'renderer updates after commit (transform path)' — are the honest,
//      reachable equivalents of its unreachable tx=95 move-semantics expectation.
//
// Two undo/redo tests ('move undo restores original', 'anchor undo restores
// exact original') are manual-simulation regression guards: they verify
// reversibility of the underlying state operations but do NOT exercise a
// History/undo stack. Kept verbatim from the original, flagged in the report.

import fs from 'fs';
import { fileURLToPath } from 'url';
import { GeometryStore, AppearanceStore, ObjectStore } from '../src-js/stores.js';
import { SceneGraph } from '../src-js/scenegraph.js';
import {
  createModifiers,
  createPointerInput,
  createKeyboardInput,
  createViewportTransform,
  InteractionStateMachine,
  HitTester,
  TransformInteractionManager,
  AnchorInteractionManager,
  InteractionEngine
} from '../src-js/interaction.js';

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

let total=0, passed=0, failed=0;
function test(name, fn){ total++; try{ fn(); passed++; console.log(`✓ ${name}`);}catch(e){ failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }
function expectClose(a,b,tol=1e-6){ if(Math.abs(a-b)>tol) throw new Error(`${a} not close to ${b}`); }

function createDoc(){
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:(id)=>geometryStore.has(id), hasAppearance:(id)=>appearanceStore.has(id)});
  const sceneGraph=new SceneGraph();
  return {geometryStore, appearanceStore, objectStore, sceneGraph};
}

function createRectObject(doc, x, y, w, h, visible=true, locked=false){
  const {geometryStore, appearanceStore, objectStore}=doc;
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x, y, width:w, height:h, rx:0, ry:0}});
  const aid=uuid(); appearanceStore.create(aid, {id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked, visible, selectable:true}});
  return {gid, aid, oid};
}

console.log('\n=== Pointer State Machine ===');
test('Pressed -> Click -> Idle', ()=>{
  const sm=new InteractionStateMachine();
  sm.transition('pointerdown');
  expect(sm.getState()==='Pressed');
  sm.transition('pointerup');
  expect(sm.getState()==='Idle');
});

console.log('\n=== Marquee ===');
test('marquee hidden and locked excluded', ()=>{
  const doc=createDoc();
  const r1=createRectObject(doc, 0,0,10,10, true, false);
  const r2=createRectObject(doc, 0,0,10,10, false, false);
  const r3=createRectObject(doc, 0,0,10,10, true, true);
  const root=doc.sceneGraph.createRoot();
  const n1=doc.sceneGraph.createNode(r1.oid, root.id, {a:1,b:0,c:0,d:1,tx:5,ty:5});
  const n2=doc.sceneGraph.createNode(r2.oid, root.id, {a:1,b:0,c:0,d:1,tx:5,ty:5});
  const n3=doc.sceneGraph.createNode(r3.oid, root.id, {a:1,b:0,c:0,d:1,tx:5,ty:5});
  const viewport=createViewportTransform();
  let selectedIds=[];
  const engine=new InteractionEngine(
    {objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph},
    viewport,
    {},
    { onSelectionChanged: (ids)=>{ selectedIds=ids; } }
  );
  engine.pointerDown(createPointerInput(1, 'down', {x:0,y:0}));
  engine.pointerMove(createPointerInput(1, 'move', {x:20,y:20}));
  engine.pointerUp(createPointerInput(1, 'up', {x:20,y:20}));
  expect(selectedIds.includes(n1.id), 'Should include visible unlocked');
  expect(!selectedIds.includes(n2.id), 'Should exclude hidden');
  expect(!selectedIds.includes(n3.id), 'Should exclude locked');
});

console.log('\n=== Transform ===');
test('transform handle priority over object hit', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id, {a:1,b:0,c:0,d:1,tx:0,ty:0});
  const viewport=createViewportTransform();
  const engine=new InteractionEngine(
    {objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph},
    viewport,
    {},
    {}
  );
  // Select the object
  engine.getSelection().replaceSelection([node.id]);
  const bounds=engine.calculateSelectionBounds();
  expect(bounds!==null);
  const handles=TransformInteractionManager.calculateHandles(bounds);
  const hitHandle=TransformInteractionManager.hitTestHandles({x:0,y:0}, handles, 10);
  expect(hitHandle!==null, 'Handle should be hittable at corner');
});

console.log('\n=== Anchor ===');
test('anchor one transaction on commit', ()=>{
  const doc=createDoc();
  const gid=uuid(); doc.geometryStore.create(gid, {type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:0,y:0}, handleOut:{x:10,y:0}, type:'corner'}, {id:'a2', position:{x:100,y:0}, handleIn:{x:-10,y:0}, handleOut:{x:0,y:0}, type:'corner'}], closed:false}], fillRule:'nonZero'});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]});   // <- repaired: was `create(\1, {id:\1, ...})` at original :645
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'path', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  let txCount=0;
  const viewport=createViewportTransform();
  const engine=new InteractionEngine(
    {objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph},
    viewport,
    {},
    { onTransaction: ()=>{ txCount++; } }
  );
  // Start anchor editing
  const node=doc.sceneGraph.getAllNodes().find(n=>n.objectRef===oid);
  engine.getSelection().replaceSelection([node.id]);
  // Simulate anchor drag - need to go through engine's anchor handling
  // For simplicity, test anchor manager directly
  const anchorManager=new AnchorInteractionManager();
  anchorManager.startEditing(node.id, doc.geometryStore.get(gid));
  anchorManager.startDrag(0, 'position');
  anchorManager.updateDrag({x:10,y:0});
  anchorManager.updateDrag({x:20,y:0});
  anchorManager.updateDrag({x:30,y:0});
  const result=anchorManager.endDrag();
  expect(result.previewGeometry.contours[0].anchors[0].position.x===30, 'Preview should reflect final delta');
  // One transaction would be created on pointerUp in real engine
  // Here we verify preview does not mutate canonical until commit
  const before=JSON.stringify(doc.geometryStore.get(gid).contours[0].anchors[0].position);
  // No transaction yet, so canonical unchanged
  const after=JSON.stringify(doc.geometryStore.get(gid).contours[0].anchors[0].position);
  expect(before===after);
});

console.log('\n=== Undo/Redo (manual-simulation regression guards, see header) ===');
test('move undo restores original', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,10,10);
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id, {a:1,b:0,c:0,d:1,tx:0,ty:0});
  const initialTransform={...doc.sceneGraph.findNode(node.id).localTransform};
  // Simulate move transaction
  const newTransform={a:1,b:0,c:0,d:1,tx:100,ty:50};
  doc.sceneGraph.setLocalTransform(node.id, newTransform);
  expect(doc.sceneGraph.findNode(node.id).localTransform.tx===100);
  // Undo
  doc.sceneGraph.setLocalTransform(node.id, initialTransform);
  expect(doc.sceneGraph.findNode(node.id).localTransform.tx===0);
  // Redo
  doc.sceneGraph.setLocalTransform(node.id, newTransform);
  expect(doc.sceneGraph.findNode(node.id).localTransform.tx===100);
});

test('anchor undo restores exact original', ()=>{
  const doc=createDoc();
  const gid=uuid(); doc.geometryStore.create(gid, {type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:0,y:0}, handleOut:{x:10,y:0}, type:'corner'}], closed:false}], fillRule:'nonZero'});
  const original=JSON.stringify(doc.geometryStore.get(gid));
  const modified=JSON.parse(original);
  modified.contours[0].anchors[0].position.x=100;
  doc.geometryStore.update(gid, modified);
  expect(doc.geometryStore.get(gid).contours[0].anchors[0].position.x===100);
  // Undo
  doc.geometryStore.update(gid, JSON.parse(original));
  expect(doc.geometryStore.get(gid).contours[0].anchors[0].position.x===0);
});

console.log('\n=== SpatialIndex Integration ===');
test('spatial index updated after move', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,10,10);
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id, {a:1,b:0,c:0,d:1,tx:0,ty:0});
  // Mock spatial index
  const spatialIndex={
    entries: new Map(),
    queryPoint: function(point, tol){
      const results=[];
      for(const [id, bbox] of this.entries){
        if(point.x>=bbox.minX-tol && point.x<=bbox.maxX+tol && point.y>=bbox.minY-tol && point.y<=bbox.maxY+tol){
          results.push(id);
        }
      }
      return results;
    },
    query: function(bbox){
      const results=[];
      for(const [id, b] of this.entries){
        if(!(b.maxX<bbox.minX || b.minX>bbox.maxX || b.maxY<bbox.minY || b.minY>bbox.maxY)){
          results.push(id);
        }
      }
      return results;
    },
    insert: function(id, bbox){ this.entries.set(id, bbox); },
    update: function(id, bbox){ this.entries.set(id, bbox); }
  };
  spatialIndex.insert(node.id, {minX:0,minY:0,maxX:10,maxY:10});
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph, spatialIndex}, {});
  const hitBefore=hitTester.hitTestTopmost({x:5,y:5});
  expect(hitBefore && hitBefore.nodeId===node.id, 'Should hit at old position');
  // Move
  doc.sceneGraph.setLocalTransform(node.id, {a:1,b:0,c:0,d:1,tx:100,ty:100});
  spatialIndex.update(node.id, {minX:100,minY:100,maxX:110,maxY:110});
  const hitAfter=hitTester.hitTestTopmost({x:105,y:105});
  expect(hitAfter && hitAfter.nodeId===node.id, 'Should hit at new position');
  const hitOld=hitTester.hitTestTopmost({x:5,y:5});
  expect(!hitOld || hitOld.nodeId!==node.id, 'Should not hit at old position');
});

console.log('\n=== Renderer Integration (F-1 two-instance fix, Step 5b) ===');
test('renderer updates after commit (drag path)', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,200,200);
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id, {a:1,b:0,c:0,d:1,tx:0,ty:0});
  let committed=null, renderTreeInvalidated=false;
  const engine=new InteractionEngine(
    {objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph},
    createViewportTransform(),
    {},
    { onTransaction: (tx)=>{
        for(const cmd of tx.commands){
          if(cmd.type==='SetLocalTransform'){
            doc.sceneGraph.setLocalTransform(cmd.payload.nodeId, cmd.payload.transform);
            committed=cmd.payload;
            renderTreeInvalidated=true;
          }
        }
      } }
  );
  engine.getSelection().replaceSelection([node.id]);
  // Click at (100,100): interior of the 200x200 rect, nearest handle ~100px away
  // (> handleHitTolerance 8) -> handle-priority does NOT intercept -> dragManager
  // move path (the route the original 12th test was authored for).
  engine.pointerDown(createPointerInput(1, 'down', {x:100,y:100}));
  expect(!engine.transformManager.isActive(), 'A click far from every handle must NOT start the transform path');
  engine.pointerMove(createPointerInput(1, 'move', {x:195,y:100}));
  engine.pointerUp(createPointerInput(1, 'up', {x:195,y:100}));
  expect(renderTreeInvalidated, 'RenderTree should be invalidated after commit');
  expect(committed!==null, 'A SetLocalTransform command must be committed');
  expect(committed.transform.tx===95, `Expected committed transform tx=95, got ${committed.transform.tx}`);
  expect(committed.transform.ty===0, `Expected committed transform ty=0, got ${committed.transform.ty}`);
  expect(committed.delta && committed.delta.x===95 && committed.delta.y===0, `Expected payload delta {x:95,y:0}, got ${JSON.stringify(committed.delta)}`);
  expect(doc.sceneGraph.findNode(node.id).localTransform.tx===95, 'Node localTransform must match the committed drag');
});

test('renderer updates after commit (transform path)', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,10,10);
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id, {a:1,b:0,c:0,d:1,tx:0,ty:0});
  let committed=null, renderTreeInvalidated=false, activePreview=null;
  const engine=new InteractionEngine(
    {objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph},
    createViewportTransform(),
    {},
    { onTransaction: (tx)=>{
        for(const cmd of tx.commands){
          if(cmd.type==='SetLocalTransform'){
            doc.sceneGraph.setLocalTransform(cmd.payload.nodeId, cmd.payload.transform);
            committed=cmd.payload;
            renderTreeInvalidated=true;
          }
        }
      } }
  );
  engine.getSelection().replaceSelection([node.id]);
  // Intentional handle click: the bottom-right corner handle sits exactly at
  // (10,10). Drag to (20,10) => scaleX=(10+10)/10=2 about pivot (0,0)
  // (handleTransformMove + updateScale). The ACTIVE preview is captured mid-drag,
  // BEFORE endTransform() resets the manager state — the committed transform
  // must equal it (F-1 instance 2: pre-fix the commit fell back to identity).
  engine.pointerDown(createPointerInput(1, 'down', {x:10,y:10}));
  expect(engine.transformManager.isActive(), 'An intentional handle click must start the transform path');
  engine.pointerMove(createPointerInput(1, 'move', {x:20,y:10}));
  activePreview=engine.transformManager.getPreviewTransforms().get(node.id);
  expect(activePreview && activePreview.a===2, `Active preview mid-drag must be scaleX=2, got ${activePreview?activePreview.a:null}`);
  engine.pointerUp(createPointerInput(1, 'up', {x:20,y:10}));
  expect(renderTreeInvalidated, 'RenderTree should be invalidated after commit');
  expect(committed!==null, 'A SetLocalTransform command must be committed');
  expect(JSON.stringify(committed.transform)===JSON.stringify(activePreview), `Committed transform ${JSON.stringify(committed.transform)} must equal the ACTIVE preview ${JSON.stringify(activePreview)} (F-1 instance 2: pre-fix this fell back to identity)`);
  expect(committed.transform.a===2, `Committed transform must carry the scale (a=2), got a=${committed.transform.a} — identity fallback means the preview was lost`);
  expect(doc.sceneGraph.findNode(node.id).localTransform.a===2, 'Node localTransform must match the committed scale');
});

console.log('\n=== Browser Independence ===');
test('Core does not import window/document', ()=>{
  // Reconstructed from the original expect(true) placeholder whose comment said:
  // "Static check via file scan in real implementation".
  const src=fs.readFileSync(fileURLToPath(new URL('../src-js/interaction.js', import.meta.url)), 'utf-8');
  expect(!/\bwindow\b/.test(src), 'interaction.js must not reference window');
  expect(!/\bdocument\b/.test(src), 'interaction.js must not reference document');
});

console.log('\n=== No AI Dependency ===');
test('No AI dependency', ()=>{
  // Reconstructed from the original expect(true) placeholder whose comment said:
  // "Static check". Verifies the interaction layer imports nothing AI/Planner-related.
  const src=fs.readFileSync(fileURLToPath(new URL('../src-js/interaction.js', import.meta.url)), 'utf-8');
  const importLines=src.split('\n').filter(l=>/^\s*import\b/.test(l) || /require\(/.test(l));
  const forbidden=/ai|planner|critic|llm|semantic-engine/i;
  for(const line of importLines){
    expect(!forbidden.test(line), `Forbidden dependency in interaction layer: ${line.trim()}`);
  }
});

console.log('\n=== No Direct Geometry Mutation ===');
test('No direct geometry mutation', ()=>{
  const doc=createDoc();
  const gid=uuid(); doc.geometryStore.create(gid, {type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:0,y:0}, handleOut:{x:10,y:0}, type:'corner'}], closed:false}], fillRule:'nonZero'});
  const before=JSON.stringify(doc.geometryStore.get(gid));
  // Simulate forbidden direct mutation attempt - should not be done by engine
  // Engine uses preview, not direct mutation
  const anchorManager=new AnchorInteractionManager();
  anchorManager.startEditing('node1', doc.geometryStore.get(gid));
  anchorManager.startDrag(0, 'position');
  anchorManager.updateDrag({x:10,y:0});
  const after=JSON.stringify(doc.geometryStore.get(gid));
  expect(before===after, 'Direct geometry mutation forbidden - preview should not mutate store');
});

console.log('\n=== Input Abstraction ===');
test('KeyboardInput abstract', ()=>{
  const input=createKeyboardInput('down', 'ArrowRight', createModifiers(true,false,false,false));
  expect(input.key==='ArrowRight');
  expect(input.modifiers.shift===true);
});

console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
if(failed>0) process.exit(1);
