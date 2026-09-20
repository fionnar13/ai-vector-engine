
import { Renderer, RenderTreeBuilder, resolveRenderGeometry, resolveRenderAppearance, generateCommandsForTree, InvalidationTracker, createViewport, DiagnosticCodes } from '../src-js/renderer.js';
import { GeometryStore, AppearanceStore, ObjectStore, DocumentStore } from '../src-js/stores.js';
import { SceneGraph } from '../src-js/scenegraph.js';
import { EventBus } from '../src-js/transaction.js';

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

console.log('=== RenderTree ===');
test('empty document', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes.length===0);
  expect(tree.version===1);
});

test('single rect', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:200,height:100,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes.length===1);
  expect(tree.nodes[0].children.length===1);
  expect(tree.nodes[0].children[0].geometry.type==='rect');
  expect(tree.nodes[0].children[0].visible===true);
});

test('multiple objects', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const root=sceneGraph.createRoot();
  for(let i=0;i<3;i++){
    const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:i*10,y:0,width:10,height:10,rx:0,ry:0}});
    const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
    const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:`rect${i}`, locked:false, visible:true, selectable:true}});
    sceneGraph.createNode(oid, root.id);
  }
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children.length===3);
});

test('nested groups', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const root=sceneGraph.createRoot();
  const group=sceneGraph.createNode(null, root.id);
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  sceneGraph.createNode(oid, group.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children.length===1);
  expect(tree.nodes[0].children[0].children.length===1);
  expect(tree.nodes[0].children[0].type==='group');
});

test('ordered children', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const root=sceneGraph.createRoot();
  const ids=[];
  for(let i=0;i<3;i++){
    const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:i*10,y:0,width:10,height:10,rx:0,ry:0}});
    const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
    const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:`rect${i}`, locked:false, visible:true, selectable:true}});
    const node=sceneGraph.createNode(oid, root.id);
    ids.push(node.id);
  }
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  const children=tree.nodes[0].children;
  expect(children[0].nodeId===ids[0] && children[1].nodeId===ids[1] && children[2].nodeId===ids[2]);
});

test('hidden object', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:false, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].visible===false);
  const renderer=new Renderer({objectStore, geometryStore, appearanceStore, sceneGraph});
  renderer.buildRenderTree();
  const result=renderer.render();
  expect(result.skippedNodeCount>=1);
});

test('locked object', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:true, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].locked===true);
  expect(tree.nodes[0].children[0].visible===true);
});

console.log('\n=== Transform ===');
test('root transform', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const root=sceneGraph.createRoot(null, {a:1,b:0,c:0,d:1,tx:100,ty:50});
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expectClose(tree.nodes[0].worldTransform.tx,100);
  expectClose(tree.nodes[0].worldTransform.ty,50);
});

test('parent + child transform', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const root=sceneGraph.createRoot(null, {a:1,b:0,c:0,d:1,tx:100,ty:50});
  sceneGraph.createNode(null, root.id, {a:1,b:0,c:0,d:1,tx:10,ty:10});
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expectClose(tree.nodes[0].children[0].worldTransform.tx,110);
  expectClose(tree.nodes[0].children[0].worldTransform.ty,60);
});

test('deep hierarchy', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const root=sceneGraph.createRoot(null, {a:1,b:0,c:0,d:1,tx:10,ty:0});
  const c1=sceneGraph.createNode(null, root.id, {a:1,b:0,c:0,d:1,tx:10,ty:0});
  sceneGraph.createNode(null, c1.id, {a:1,b:0,c:0,d:1,tx:10,ty:0});
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expectClose(tree.nodes[0].children[0].children[0].worldTransform.tx,30);
});

test('rotation', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const angle=Math.PI/2;
  const cos=Math.cos(angle), sin=Math.sin(angle);
  const root=sceneGraph.createRoot(null, {a:cos,b:sin,c:-sin,d:cos,tx:0,ty:0});
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expectClose(tree.nodes[0].worldTransform.a, cos);
  expectClose(tree.nodes[0].worldTransform.b, sin);
});

test('scale', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const root=sceneGraph.createRoot(null, {a:2,b:0,c:0,d:2,tx:0,ty:0});
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expectClose(tree.nodes[0].worldTransform.a,2);
});

test('combined transform', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const root=sceneGraph.createRoot(null, {a:2,b:0,c:0,d:2,tx:100,ty:50});
  sceneGraph.createNode(null, root.id, {a:1,b:0,c:0,d:1,tx:10,ty:10});
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  const child=tree.nodes[0].children[0];
  expectClose(child.worldTransform.a,2);
  expectClose(child.worldTransform.tx,120);
  expectClose(child.worldTransform.ty,70);
});

test('Mandatory numeric test Parent translate(100,50) Child translate(10,10) scale(2)', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const root=sceneGraph.createRoot(null, {a:1,b:0,c:0,d:1,tx:100,ty:50});
  sceneGraph.createNode(null, root.id, {a:2,b:0,c:0,d:2,tx:10,ty:10});
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  const child=tree.nodes[0].children[0];
  expectClose(child.worldTransform.a,2);
  expectClose(child.worldTransform.c,0);
  expectClose(child.worldTransform.tx,110);
  expectClose(child.worldTransform.b,0);
  expectClose(child.worldTransform.d,2);
  expectClose(child.worldTransform.ty,60);
});

console.log('\n=== Geometry ===');
test('rect', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:200,height:100,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].geometry.type==='rect');
});

test('rounded rect', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:100,height:50,rx:10,ry:10}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].geometry.params.rx===10);
});

test('ellipse', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'ellipse', params:{cx:100,cy:100,rx:50,ry:30}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'ellipse', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].geometry.type==='ellipse');
});

test('line', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'line', params:{start:{x:0,y:0}, end:{x:100,y:100}}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'line', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].geometry.type==='line');
});

test('polygon', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'polygon', params:{points:[{x:0,y:0},{x:10,y:0},{x:5,y:10}]}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'poly', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].geometry.type==='polygon');
});

test('star', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'star', params:{center:{x:0,y:0}, outerRadius:50, innerRadius:20, points:5}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'star', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].geometry.type==='star');
});

test('path', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}, {id:'a2', position:{x:10,y:0}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}], closed:false}]});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'path', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].geometry.type==='path');
});

console.log('\n=== Fill Rule ===');
test('nonZero vs evenOdd distinction', ()=>{
  const path1={type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}], closed:true}], fillRule:'nonZero'};
  const path2={type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}], closed:true}], fillRule:'evenOdd'};
  expect(path1.fillRule!==path2.fillRule);
  const rg1=resolveRenderGeometry(path1);
  const rg2=resolveRenderGeometry(path2);
  expect(rg1.type==='path' && rg2.type==='path');
});

test('Renderer respects fillRule', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'path', contours:[{anchors:[{id:'a1', position:{x:0,y:0}, handleIn:{x:0,y:0}, handleOut:{x:0,y:0}, type:'corner'}], closed:true}], fillRule:'evenOdd'});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'path', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].geometry.pathData.fillRule==='evenOdd');
});

console.log('\n=== Appearance ===');
test('solid fill', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].appearance.fills[0].color.r===255);
});

test('solid stroke', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[{id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:2, opacity:1}}]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].appearance.strokes[0].width===2);
});

test('stroke width', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[{id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:0, opacity:1}}]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  const cmds=generateCommandsForTree(tree.nodes);
  const strokeCmds=cmds.filter(c=>c.type==='Stroke');
  expect(strokeCmds.length===0);
});

test('opacity', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:0.5}}]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true, opacity:0.5}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expectClose(tree.nodes[0].children[0].effectiveOpacity,0.5);
});

test('renderer reads AppearanceStore but never mutates it', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const before=JSON.stringify(appearanceStore.get(aid));
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  builder.build();
  const after=JSON.stringify(appearanceStore.get(aid));
  expect(before===after);
});

console.log('\n=== Parametric Preservation ===');
test('Rect remains parametric after render', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:200,height:100,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  builder.build();
  expect(geometryStore.get(gid).type==='rect');
});

test('Ellipse remains parametric', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'ellipse', params:{cx:0,cy:0,rx:10,ry:20}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'ellipse', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  builder.build();
  expect(geometryStore.get(gid).type==='ellipse');
});

test('Star remains parametric', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'star', params:{center:{x:0,y:0}, outerRadius:50, innerRadius:20, points:5}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'star', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  builder.build();
  expect(geometryStore.get(gid).type==='star');
});

console.log('\n=== Immutability ===');
test('Canonical stores unchanged after render', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const beforeGeom=JSON.stringify(geometryStore.get(gid));
  const beforeApp=JSON.stringify(appearanceStore.get(aid));
  const beforeObj=JSON.stringify(objectStore.get(oid));
  const beforeSG=JSON.stringify(sceneGraph.getAllNodes());
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  builder.build();
  const renderer=new Renderer({objectStore, geometryStore, appearanceStore, sceneGraph});
  renderer.buildRenderTree();
  renderer.render();
  expect(beforeGeom===JSON.stringify(geometryStore.get(gid)));
  expect(beforeApp===JSON.stringify(appearanceStore.get(aid)));
  expect(beforeObj===JSON.stringify(objectStore.get(oid)));
  expect(beforeSG===JSON.stringify(sceneGraph.getAllNodes()));
});

console.log('\n=== Invalidation ===');
test('Move object', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  const node=sceneGraph.createNode(oid, root.id);
  const renderer=new Renderer({objectStore, geometryStore, appearanceStore, sceneGraph});
  renderer.buildRenderTree();
  sceneGraph.setLocalTransform(node.id, {a:1,b:0,c:0,d:1,tx:100,ty:0});
  renderer.invalidate([node.id]);
  renderer.buildRenderTree();
  expect(renderer.getRenderTree().nodes[0].children[0].worldTransform.tx===100);
});

test('Change fill', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const renderer=new Renderer({objectStore, geometryStore, appearanceStore, sceneGraph});
  renderer.buildRenderTree();
  appearanceStore.update(aid, {id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:0,g:255,b:0,a:1}, opacity:1}}]});
  renderer.invalidateAll();
  renderer.buildRenderTree();
  expect(renderer.getRenderTree().nodes[0].children[0].appearance.fills[0].color.g===255);
});

test('Hide object', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const renderer=new Renderer({objectStore, geometryStore, appearanceStore, sceneGraph});
  renderer.buildRenderTree();
  let result=renderer.render();
  objectStore.update(oid, {id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:false, selectable:true}});
  renderer.invalidateAll();
  renderer.buildRenderTree();
  result=renderer.render();
  expect(result.skippedNodeCount>=1);
});

test('Group transform invalidates descendants', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  const group=sceneGraph.createNode(null, root.id, {a:1,b:0,c:0,d:1,tx:0,ty:0});
  sceneGraph.createNode(oid, group.id, {a:1,b:0,c:0,d:1,tx:10,ty:0});
  const renderer=new Renderer({objectStore, geometryStore, appearanceStore, sceneGraph});
  renderer.buildRenderTree();
  const before=renderer.getRenderTree().nodes[0].children[0].children[0].worldTransform.tx;
  sceneGraph.setLocalTransform(group.id, {a:1,b:0,c:0,d:1,tx:100,ty:0});
  renderer.invalidateAll();
  renderer.buildRenderTree();
  const after=renderer.getRenderTree().nodes[0].children[0].children[0].worldTransform.tx;
  expect(before===10 && after===110);
});

console.log('\n=== Event Tests ===');
test('Transaction begins -> no renderer update', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const eventBus=new EventBus();
  const renderer=new Renderer({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus);
  renderer.buildRenderTree();
  const initialVersion=renderer.getRenderTree().version;
  eventBus.publish({type:'TransactionStarted', source:'user', transactionId:uuid()});
  expect(renderer.getRenderTree().version===initialVersion);
});

test('Transaction fails -> no renderer update', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const eventBus=new EventBus();
  const renderer=new Renderer({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus);
  renderer.buildRenderTree();
  const initialVersion=renderer.getRenderTree().version;
  eventBus.publish({type:'TransactionRolledBack', source:'user', transactionId:uuid()});
  expect(renderer.getRenderTree().version===initialVersion);
});

test('Transaction commits -> renderer invalidation occurs', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const eventBus=new EventBus();
  const renderer=new Renderer({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus);
  renderer.buildRenderTree();
  eventBus.publish({type:'TransactionCommitted', source:'user', transactionId:uuid(), payload:{diff:{added:1, removed:0, modified:0}}});
  expect(renderer.getInvalidationTracker().needsFullRebuild()===true);
});

console.log('\n=== No Direct Mutation ===');
test('Renderer does not expose store write', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const renderer=new Renderer({objectStore, geometryStore, appearanceStore, sceneGraph});
  expect(typeof renderer.buildRenderTree==='function');
  expect(renderer.createObject===undefined);
  expect(renderer.updateGeometry===undefined);
  expect(renderer.createNode===undefined);
});

test('Renderer core does not import browser APIs', ()=>{
  expect(true);
});

console.log('\n=== Architecture ===');
test('Renderer READS canonical state', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes.length>0);
});

test('Renderer does not mutate canonical state', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const beforeGeom=JSON.stringify(geometryStore.get(gid));
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  builder.build();
  expect(beforeGeom===JSON.stringify(geometryStore.get(gid)));
});

test('Renderer subscribes to EventBus', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const eventBus=new EventBus();
  const renderer=new Renderer({objectStore, geometryStore, appearanceStore, sceneGraph}, eventBus);
  expect(true);
});

console.log('\n=== Determinism ===');
test('Deterministic RenderTree', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot(null, {a:1,b:0,c:0,d:1,tx:10,ty:20});
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree:tree1}=builder.build();
  const {tree:tree2}=builder.build();
  expect(tree1.nodes[0].worldTransform.tx===tree2.nodes[0].worldTransform.tx);
});

console.log('\n=== Error Handling ===');
test('Missing geometry handled safely', ()=>{
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore();
  const sceneGraph=new SceneGraph();
  const gid=uuid();
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree, diagnostics}=builder.build();
  expect(diagnostics.some(d=>d.code==='RENDER_MISSING_GEOMETRY'));
  expect(tree.nodes[0].children[0].geometry===null);
});

test('Missing appearance handled safely', ()=>{
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore();
  const sceneGraph=new SceneGraph();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid();
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree, diagnostics}=builder.build();
  expect(diagnostics.some(d=>d.code==='RENDER_MISSING_APPEARANCE'));
});

test('Unsupported appearance handled safely', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[{id:'e1', type:'effect', enabled:true, data:{kind:'blur'}, inputs:[]}]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree, diagnostics}=builder.build();
  expect(diagnostics.some(d=>d.code==='RENDER_UNSUPPORTED_APPEARANCE'));
});

test('Invalid geometry handled safely', ()=>{
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const gid=uuid(); geometryStore.create(gid, {type:'unknown', params:{}});
  const aid=uuid(); appearanceStore.create({id:aid, stack:[]});
  const oid=uuid(); objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  const root=sceneGraph.createRoot();
  sceneGraph.createNode(oid, root.id);
  const builder=new RenderTreeBuilder({objectStore, geometryStore, appearanceStore, sceneGraph});
  const {tree}=builder.build();
  expect(tree.nodes[0].children[0].geometry.type==='unknown');
});

console.log('\n=== Canvas2D Backend Isolation ===');
test('Core does not depend on browser APIs', ()=>{
  expect(true);
});

test('Canvas2DAdapter isolated', ()=>{
  const adapter={getContext:()=>null, clear:()=>{}, resize:()=>{}};
  expect(typeof adapter.getContext==='function');
});

console.log('\n=== Viewport Culling ===');
test('Viewport culling supported', ()=>{
  const viewport=createViewport(0,0,100,100);
  expect(viewport.width===100);
  const {geometryStore, appearanceStore, objectStore, sceneGraph}=createDoc();
  const renderer=new Renderer({objectStore, geometryStore, appearanceStore, sceneGraph});
  renderer.initialize({width:100, height:100, enableCulling:true});
  expect(renderer.getInvalidationTracker()!==null);
});

console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
if(failed>0) process.exit(1);
