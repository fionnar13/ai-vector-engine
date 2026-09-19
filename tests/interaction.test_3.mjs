
import { GeometryStore, AppearanceStore, ObjectStore } from '../src-js/stores.js';
import { SceneGraph } from '../src-js/scenegraph.js';
import {
  createModifiers,
  createPointerInput,
  createKeyboardInput,
  createViewportTransform,
  SelectionManager,
  HoverManager,
  InteractionStateMachine,
  HitTester,
  DragManager,
  MarqueeManager,
  TransformInteractionManager,
  AnchorInteractionManager,
  OverlayManager,
  InteractionEngine
} from '../src-js/interaction.js';

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

let total=0, passed=0, failed=0;
function test(name, fn){ total++; try{ fn(); passed++; console.log(`✓ ${name}`);}catch(e){ failed++; console.error(`✗ ${name}: ${e.message}`);} }
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

console.log('=== HitTest ===');
test('single rect', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph});
  const hit=hitTester.hitTestTopmost({x:50,y:50});
  expect(hit && hit.nodeId===node.id);
  expect(hit.kind==='fill');
});
test('overlapping rects', ()=>{
  const doc=createDoc();
  const r1=createRectObject(doc, 0,0,100,100);
  const r2=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  const n1=doc.sceneGraph.createNode(r1.oid, root.id);
  const n2=doc.sceneGraph.createNode(r2.oid, root.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph});
  const hit=hitTester.hitTestTopmost({x:50,y:50});
  expect(hit && hit.nodeId===n2.id);
});
test('ellipse', ()=>{
  const doc=createDoc();
  const gid=uuid(); doc.geometryStore.create(gid, {type:'ellipse', params:{cx:50,cy:50,rx:30,ry:20}});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'ellipse', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph});
  const hitInside=hitTester.hitTestTopmost({x:50,y:50});
  expect(hitInside && hitInside.kind==='fill');
});
test('path', ()=>{
  const doc=createDoc();
  const gid=uuid(); doc.geometryStore.create(gid, {type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}, {id:'a2', position:{x:100,y:0}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}, {id:'a3', position:{x:100,y:100}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}, {id:'a4', position:{x:0,y:100}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}], closed:true}], fillRule:'nonZero'});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'path', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph});
  const hit=hitTester.hitTestTopmost({x:50,y:50});
  expect(hit && hit.kind==='fill');
});
test('polygon', ()=>{
  const doc=createDoc();
  const gid=uuid(); doc.geometryStore.create(gid, {type:'polygon', params:{points:[{x:0,y:0},{x:100,y:0},{x:50,y:100}]}});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'poly', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph});
  const hit=hitTester.hitTestTopmost({x:50,y:50});
  expect(hit && hit.kind==='fill');
});
test('star', ()=>{
  const doc=createDoc();
  const gid=uuid(); doc.geometryStore.create(gid, {type:'star', params:{center:{x:50,y:50}, outerRadius:50, innerRadius:20, points:5}});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'star', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph});
  const hit=hitTester.hitTestTopmost({x:50,y:50});
  expect(hit && hit.kind==='fill');
});
test('stroke', ()=>{
  const doc=createDoc();
  const gid=uuid(); doc.geometryStore.create(gid, {type:'line', params:{start:{x:0,y:0}, end:{x:100,y:0}}});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[{id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:10, opacity:1}}]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'line', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, {hitTolerance:2});
  const hit=hitTester.hitTestTopmost({x:50,y:2});
  expect(hit && hit.kind==='stroke');
});
test('fill', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph});
  const hit=hitTester.hitTestTopmost({x:50,y:50});
  expect(hit && hit.kind==='fill');
});
test('open line', ()=>{
  const doc=createDoc();
  const gid=uuid(); doc.geometryStore.create(gid, {type:'line', params:{start:{x:0,y:0}, end:{x:100,y:0}}});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[{id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:2, opacity:1}}]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'line', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, {hitTolerance:5});
  const hit=hitTester.hitTestTopmost({x:50,y:0});
  expect(hit && hit.kind==='stroke');
});
test('hidden object', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100, false, false);
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph});
  const hit=hitTester.hitTestTopmost({x:50,y:50});
  expect(!hit);
});
test('locked object', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100, true, true);
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph});
  const hit=hitTester.hitTestTopmost({x:50,y:50});
  expect(!hit);
});
test('nested groups', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,10,10);
  const root=doc.sceneGraph.createRoot(null, {a:1,b:0,c:0,d:1,tx:0,ty:0});
  const group=doc.sceneGraph.createNode(null, root.id, {a:1,b:0,c:0,d:1,tx:100,ty:100});
  doc.sceneGraph.createNode(oid, group.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph});
  const hit=hitTester.hitTestTopmost({x:105,y:105});
  expect(hit);
});

console.log('\n=== Z-Order ===');
test('Z-order topmost wins', ()=>{
  const doc=createDoc();
  const r1=createRectObject(doc, 0,0,100,100);
  const r2=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(r1.oid, root.id);
  const n2=doc.sceneGraph.createNode(r2.oid, root.id);
  const hitTester=new HitTester({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph});
  const hit=hitTester.hitTestTopmost({x:50,y:50});
  expect(hit && hit.nodeId===n2.id);
});
test('Z-order reverse', ()=>{
  const doc2=createDoc();
  const r1b=createRectObject(doc2, 0,0,100,100);
  const r2b=createRectObject(doc2, 0,0,100,100);
  const root2=doc2.sceneGraph.createRoot();
  const n2b=doc2.sceneGraph.createNode(r2b.oid, root2.id);
  const n1b=doc2.sceneGraph.createNode(r1b.oid, root2.id);
  const hitTester=new HitTester({objectStore:doc2.objectStore, geometryStore:doc2.geometryStore, appearanceStore:doc2.appearanceStore, sceneGraph:doc2.sceneGraph});
  const hit=hitTester.hitTestTopmost({x:50,y:50});
  expect(hit && hit.nodeId===n1b.id);
});

console.log('\n=== Selection ===');
test('select node', ()=>{ const sel=new SelectionManager(); const id=uuid(); sel.select(id); expect(sel.isSelected(id)); });
test('deselect node', ()=>{ const sel=new SelectionManager(); const id=uuid(); sel.select(id); sel.deselect(id); expect(!sel.isSelected(id)); });
test('toggle', ()=>{ const sel=new SelectionManager(); const id=uuid(); sel.toggle(id); expect(sel.isSelected(id)); sel.toggle(id); expect(!sel.isSelected(id)); });
test('replaceSelection', ()=>{ const sel=new SelectionManager(); const id1=uuid(), id2=uuid(), id3=uuid(); sel.replaceSelection([id1, id2]); expect(sel.isSelected(id1)); sel.replaceSelection([id3]); expect(!sel.isSelected(id1) && sel.isSelected(id3)); });
test('addToSelection', ()=>{ const sel=new SelectionManager(); const id1=uuid(), id2=uuid(); sel.select(id1); sel.addToSelection([id2]); expect(sel.isSelected(id1) && sel.isSelected(id2)); });
test('removeFromSelection', ()=>{ const sel=new SelectionManager(); const id1=uuid(), id2=uuid(); sel.replaceSelection([id1, id2]); sel.removeFromSelection([id1]); expect(!sel.isSelected(id1) && sel.isSelected(id2)); });
test('clearSelection', ()=>{ const sel=new SelectionManager(); sel.replaceSelection([uuid(), uuid()]); sel.clearSelection(); expect(sel.getState().selectedNodeIds.length===0); });
test('setActiveNode', ()=>{ const sel=new SelectionManager(); const id1=uuid(), id2=uuid(); sel.replaceSelection([id1, id2]); sel.setActiveNode(id1); expect(sel.getState().activeNodeId===id1); });
test('selection ordering deterministic', ()=>{ const sel=new SelectionManager(); const ids=[uuid(), uuid(), uuid()]; sel.replaceSelection(ids); const state=sel.getState(); expect(state.selectedNodeIds[0]===ids[0]); });
test('selection transient', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,10,10);
  const obj=doc.objectStore.get(oid);
  expect(!obj.selected);
  const sel=new SelectionManager();
  sel.select(oid);
  const objAfter=doc.objectStore.get(oid);
  expect(!objAfter.selected);
});

console.log('\n=== State Machine ===');
test('Idle -> Hover -> Pressed -> Dragging -> Idle', ()=>{
  const sm=new InteractionStateMachine();
  expect(sm.getState()==='Idle');
  sm.transition('pointermove');
  expect(sm.getState()==='Hover');
  sm.transition('pointerdown');
  expect(sm.getState()==='Pressed');
  sm.transition('dragstart');
  expect(sm.getState()==='Dragging');
  sm.transition('pointerup');
  expect(sm.getState()==='Idle');
});
test('Cancel restores Idle', ()=>{
  const sm=new InteractionStateMachine();
  sm.transition('pointerdown');
  sm.transition('dragstart');
  sm.transition('cancel');
  expect(sm.getState()==='Idle');
});

console.log('\n=== Hover ===');
test('hover update', ()=>{
  const hover=new HoverManager();
  const id=uuid();
  hover.setHover(id, 'fill');
  expect(hover.getState().nodeId===id);
  hover.clear();
  expect(hover.getState().nodeId===null);
});
test('hover no transaction', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const before=JSON.stringify(doc.objectStore.get(oid));
  const viewport=createViewportTransform();
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, viewport, {}, {});
  engine.pointerMove(createPointerInput(1, 'move', {x:50,y:50}));
  const after=JSON.stringify(doc.objectStore.get(oid));
  expect(before===after);
});

console.log('\n=== Drag ===');
test('drag preview no mutate', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id);
  const beforeTx=JSON.stringify(doc.sceneGraph.findNode(node.id).localTransform);
  const drag=new DragManager({dragThreshold:3});
  const initialTransforms=new Map();
  initialTransforms.set(node.id, {...doc.sceneGraph.findNode(node.id).localTransform});
  drag.startDrag({x:0,y:0}, initialTransforms);
  drag.updateDrag({x:100,y:50});
  const afterTx=JSON.stringify(doc.sceneGraph.findNode(node.id).localTransform);
  expect(beforeTx===afterTx);
  expect(drag.isDragging());
  const preview=drag.getPreviewTransforms();
  expect(preview.has(node.id));
  expectClose(preview.get(node.id).tx, 100);
});
test('drag threshold', ()=>{
  const drag=new DragManager({dragThreshold:10});
  const initialTransforms=new Map();
  initialTransforms.set('node1', {a:1,b:0,c:0,d:1,tx:0,ty:0});
  drag.startDrag({x:0,y:0}, initialTransforms);
  drag.updateDrag({x:5,y:0});
  expect(!drag.isDragging());
  drag.updateDrag({x:15,y:0});
  expect(drag.isDragging());
});
test('drag transaction boundary one gesture one transaction', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  let transactionCount=0;
  const viewport=createViewportTransform();
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, viewport, {}, { onTransaction: ()=>{ transactionCount++; } });
  engine.pointerDown(createPointerInput(1, 'down', {x:50,y:50}));
  expect(transactionCount===0);
  engine.pointerMove(createPointerInput(1, 'move', {x:55,y:50}));
  expect(transactionCount===0);
  engine.pointerMove(createPointerInput(1, 'move', {x:100,y:50}));
  expect(transactionCount===0);
  engine.pointerUp(createPointerInput(1, 'up', {x:100,y:50}));
  expect(transactionCount===1);
});

console.log('\n=== Marquee ===');
test('marquee selection', ()=>{
  const doc=createDoc();
  const r1=createRectObject(doc, 0,0,10,10);
  const r2=createRectObject(doc, 100,100,10,10);
  const r3=createRectObject(doc, 50,50,10,10);
  const root=doc.sceneGraph.createRoot();
  const n1=doc.sceneGraph.createNode(r1.oid, root.id, {a:1,b:0,c:0,d:1,tx:0,ty:0});
  const n2=doc.sceneGraph.createNode(r2.oid, root.id, {a:1,b:0,c:0,d:1,tx:100,ty:100});
  const n3=doc.sceneGraph.createNode(r3.oid, root.id, {a:1,b:0,c:0,d:1,tx:50,ty:50});
  const viewport=createViewportTransform();
  let selectedIds=[];
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, viewport, {}, { onSelectionChanged: (ids)=>{ selectedIds=ids; } });
  engine.pointerDown(createPointerInput(1, 'down', {x:-10,y:-10}));
  engine.pointerMove(createPointerInput(1, 'move', {x:60,y:60}));
  engine.pointerUp(createPointerInput(1, 'up', {x:60,y:60}));
  expect(selectedIds.includes(n1.id) && selectedIds.includes(n3.id));
  expect(!selectedIds.includes(n2.id));
});
test('marquee no mutate', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,10,10);
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const before=JSON.stringify(doc.objectStore.get(oid));
  const marquee=new MarqueeManager();
  marquee.startMarquee({x:0,y:0});
  marquee.updateMarquee({x:100,y:100});
  marquee.endMarquee();
  const after=JSON.stringify(doc.objectStore.get(oid));
  expect(before===after);
});

console.log('\n=== Transform ===');
test('move preview no mutate', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id);
  const before=JSON.stringify(doc.sceneGraph.findNode(node.id).localTransform);
  const transformManager=new TransformInteractionManager();
  const initialTransforms=new Map();
  initialTransforms.set(node.id, {...doc.sceneGraph.findNode(node.id).localTransform});
  const bounds={minX:0,minY:0,maxX:100,maxY:100};
  const pivot={x:50,y:50};
  transformManager.startTransform('move', pivot, bounds, initialTransforms);
  transformManager.updateMove({x:100,y:50});
  const after=JSON.stringify(doc.sceneGraph.findNode(node.id).localTransform);
  expect(before===after);
});
test('scale', ()=>{
  const transformManager=new TransformInteractionManager();
  const initialTransforms=new Map();
  initialTransforms.set('node1', {a:1,b:0,c:0,d:1,tx:0,ty:0});
  const bounds={minX:0,minY:0,maxX:100,maxY:100};
  const pivot={x:0,y:0};
  transformManager.startTransform('scale', pivot, bounds, initialTransforms);
  transformManager.updateScale(2,2);
  const preview=transformManager.getPreviewTransforms();
  const mat=preview.get('node1');
  expectClose(mat.a, 2);
});
test('rotate', ()=>{
  const transformManager=new TransformInteractionManager();
  const initialTransforms=new Map();
  initialTransforms.set('node1', {a:1,b:0,c:0,d:1,tx:0,ty:0});
  const bounds={minX:0,minY:0,maxX:100,maxY:100};
  const pivot={x:50,y:50};
  transformManager.startTransform('rotate', pivot, bounds, initialTransforms);
  transformManager.updateRotate(90);
  const preview=transformManager.getPreviewTransforms();
  const mat=preview.get('node1');
  expectClose(Math.abs(mat.a), 0, 1e-5);
  expectClose(Math.abs(mat.b), 1, 1e-5);
});
test('transform handle hit', ()=>{
  const bounds={minX:0,minY:0,maxX:100,maxY:100};
  const handles=TransformInteractionManager.calculateHandles(bounds);
  expect(handles.length===9);
  const hit=TransformInteractionManager.hitTestHandles({x:0,y:0}, handles, 10);
  expect(hit && hit.kind==='top-left');
});

console.log('\n=== Anchor ===');
test('anchor selection', ()=>{
  const doc=createDoc();
  const gid=uuid(); doc.geometryStore.create(gid, {type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:0,y:0}, handleOut:{x:10,y:0}, type:'corner'}, {id:'a2', position:{x:100,y:0}, handleIn:{x:-10,y:0}, handleOut:{x:0,y:0}, type:'corner'}], closed:false}], fillRule:'nonZero'});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'path', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id);
  const anchorManager=new AnchorInteractionManager();
  const geom=doc.geometryStore.get(gid);
  anchorManager.startEditing(node.id, geom);
  anchorManager.selectAnchor(0);
  expect(anchorManager.getState().selectedAnchorIndices.includes(0));
});
test('anchor move preview no mutate', ()=>{
  const doc=createDoc();
  const gid=uuid(); doc.geometryStore.create(gid, {type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:0,y:0}, handleOut:{x:10,y:0}, type:'corner'}, {id:'a2', position:{x:100,y:0}, handleIn:{x:-10,y:0}, handleOut:{x:0,y:0}, type:'corner'}], closed:false}], fillRule:'nonZero'});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'path', locked:false, visible:true, selectable:true}});
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const before=JSON.stringify(doc.geometryStore.get(gid));
  const anchorManager=new AnchorInteractionManager();
  const geom=doc.geometryStore.get(gid);
  anchorManager.startEditing('node1', geom);
  anchorManager.startDrag(0, 'position');
  anchorManager.updateDrag({x:10,y:10});
  const after=JSON.stringify(doc.geometryStore.get(gid));
  expect(before===after);
  const preview=anchorManager.getPreviewGeometry();
  expectClose(preview.contours[0].anchors[0].position.x, 10);
});
test('smooth anchor', ()=>{
  const gid=uuid();
  const geom={type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:-10,y:0}, handleOut:{x:10,y:0}, type:'smooth'}], closed:false}], fillRule:'nonZero'};
  const anchorManager=new AnchorInteractionManager();
  anchorManager.startEditing('node1', geom);
  anchorManager.startDrag(0, 'out');
  anchorManager.updateDrag({x:10,y:10});
  const preview=anchorManager.getPreviewGeometry();
  const anchor=preview.contours[0].anchors[0];
  const dot=anchor.handleIn.x*anchor.handleOut.x + anchor.handleIn.y*anchor.handleOut.y;
  expect(dot<0);
});
test('symmetric anchor', ()=>{
  const geom={type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:-10,y:0}, handleOut:{x:10,y:0}, type:'symmetric'}], closed:false}], fillRule:'nonZero'};
  const anchorManager=new AnchorInteractionManager();
  anchorManager.startEditing('node1', geom);
  anchorManager.startDrag(0, 'out');
  anchorManager.updateDrag({x:5,y:0});
  const preview=anchorManager.getPreviewGeometry();
  const anchor=preview.contours[0].anchors[0];
  const lenIn=Math.hypot(anchor.handleIn.x, anchor.handleIn.y);
  const lenOut=Math.hypot(anchor.handleOut.x, anchor.handleOut.y);
  expectClose(lenIn, lenOut, 1e-5);
});

console.log('\n=== Keyboard ===');
test('arrow key transaction', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,10,10);
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id);
  let txCount=0;
  const viewport=createViewportTransform();
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, viewport, {}, { onTransaction: ()=>{ txCount++; } });
  engine.getSelection().replaceSelection([node.id]);
  engine.keyDown(createKeyboardInput('down', 'ArrowRight', createModifiers()));
  expect(txCount===1);
});
test('shift arrow', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,10,10);
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id);
  let lastTx=null;
  const viewport=createViewportTransform();
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, viewport, {keyboardMoveStep:1, keyboardMoveStepShift:10}, { onTransaction: (tx)=>{ lastTx=tx; } });
  engine.getSelection().replaceSelection([node.id]);
  engine.keyDown(createKeyboardInput('down', 'ArrowRight', createModifiers(true,false,false,false)));
  expect(lastTx && lastTx.commands[0].payload.delta.x===10);
});
test('delete transaction', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,10,10);
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id);
  let txCount=0;
  const viewport=createViewportTransform();
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, viewport, {}, { onTransaction: (tx)=>{ txCount++; } });
  engine.getSelection().replaceSelection([node.id]);
  engine.keyDown(createKeyboardInput('down', 'Delete'));
  expect(txCount===1);
});
test('escape cancels', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(oid, root.id);
  const viewport=createViewportTransform();
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, viewport, {}, {});
  engine.pointerDown(createPointerInput(1, 'down', {x:50,y:50}));
  engine.pointerMove(createPointerInput(1, 'move', {x:100,y:50}));
  const beforeCancel=engine.getPreview();
  expect(beforeCancel.transforms && beforeCancel.transforms.size>0);
  engine.keyDown(createKeyboardInput('down', 'Escape'));
  const afterCancel=engine.getPreview();
  expect(!afterCancel.transforms || afterCancel.transforms.size===0);
});

console.log('\n=== Immutability ===');
test('canonical unchanged during preview', ()=>{
  const doc=createDoc();
  const {oid, gid}=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  const node=doc.sceneGraph.createNode(oid, root.id);
  const beforeGeom=JSON.stringify(doc.geometryStore.get(gid));
  const beforeNode=JSON.stringify(doc.sceneGraph.findNode(node.id));
  const viewport=createViewportTransform();
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, viewport, {}, {});
  engine.pointerDown(createPointerInput(1, 'down', {x:50,y:50}));
  engine.pointerMove(createPointerInput(1, 'move', {x:100,y:50}));
  engine.pointerMove(createPointerInput(1, 'move', {x:150,y:50}));
  const afterGeom=JSON.stringify(doc.geometryStore.get(gid));
  const afterNode=JSON.stringify(doc.sceneGraph.findNode(node.id));
  expect(beforeGeom===afterGeom);
  expect(beforeNode===afterNode);
});

console.log('\n=== Architecture ===');
test('no direct Store.write', ()=>{
  const doc=createDoc();
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, createViewportTransform(), {}, {});
  expect(engine.createObject===undefined);
});
test('no direct GeometryStore.write', ()=>{
  const doc=createDoc();
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, createViewportTransform(), {}, {});
  expect(engine.updateGeometry===undefined);
});
test('no direct SceneGraph mutation', ()=>{
  const doc=createDoc();
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, createViewportTransform(), {}, {});
  expect(engine.setLocalTransform===undefined);
});
test('no History mutation', ()=>{
  const doc=createDoc();
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, createViewportTransform(), {}, {});
  expect(engine.undo===undefined);
});
test('no Renderer mutation', ()=>{
  const doc=createDoc();
  const engine=new InteractionEngine({objectStore:doc.objectStore, geometryStore:doc.geometryStore, appearanceStore:doc.appearanceStore, sceneGraph:doc.sceneGraph}, createViewportTransform(), {}, {});
  expect(engine.render===undefined);
});

console.log('\n=== Input Abstraction ===');
test('PointerInput abstract', ()=>{
  const input=createPointerInput(1, 'down', {x:100,y:200}, 1, createModifiers());
  expect(input.pointerId===1);
  expect(input.type==='down');
});
test('ViewportTransform', ()=>{
  const viewport=createViewportTransform({a:2,b:0,c:0,d:2,tx:100,ty:50});
  const world=viewport.screenToWorld({x:200,y:100});
  expectClose(world.x, 50);
  expectClose(world.y, 25);
});

console.log('\n=== Overlay ===');
test('overlay transient', ()=>{
  const overlay=new OverlayManager();
  overlay.setSelectionBounds({minX:0,minY:0,maxX:100,maxY:100});
  const o=overlay.getOverlay();
  expect(o.selectionBounds!==undefined);
});
test('selection bounds handles', ()=>{
  const bounds={minX:0,minY:0,maxX:100,maxY:100};
  const handles=TransformInteractionManager.calculateHandles(bounds);
  expect(handles.length===9);
});

console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
if(failed>0) process.exit(1);
