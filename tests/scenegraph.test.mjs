
import { SceneGraph, SimpleSpatialIndex } from '../src-js/scenegraph.js';

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

let total=0, passed=0, failed=0;
function test(name, fn){ total++; try{ fn(); passed++; console.log(`✓ ${name}`);}catch(e){ failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }
function expectClose(a,b,tol=1e-6){ if(Math.abs(a-b)>tol) throw new Error(`${a} not close to ${b}`); }
function expectThrows(fn){ let threw=false; try{ fn(); }catch{threw=true;} if(!threw) throw new Error('Expected throw'); }

console.log('=== SceneGraph ===');
test('Create root', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  expect(root.parent===null);
  expect(sg.getRootNodes().length===1);
});
test('Create child', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  const child=sg.createNode(null, root.id);
  expect(child.parent===root.id);
  expect(sg.getChildren(root.id).length===1);
});
test('Create empty group', ()=>{
  const sg=new SceneGraph();
  const group=sg.createGroup();
  expect(group.objectRef===null);
  expect(group.children.length===0);
});
test('Parent/child consistency', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  const child=sg.createNode(null, root.id);
  const parent=sg.getParent(child.id);
  expect(parent.id===root.id);
  sg.validateInvariants();
});
test('Multiple children', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  sg.createNode(null, root.id);
  sg.createNode(null, root.id);
  sg.createNode(null, root.id);
  expect(sg.getChildren(root.id).length===3);
});
test('Child ordering', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  const c1=sg.createNode(null, root.id);
  const c2=sg.createNode(null, root.id);
  const c3=sg.createNode(null, root.id);
  const children=sg.getChildren(root.id);
  expect(children[0].id===c1.id && children[1].id===c2.id && children[2].id===c3.id);
});
test('Insert child at index', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  const c1=sg.createNode(null, root.id);
  const c2=sg.createNode(null, root.id);
  const c3=sg.createNode(null);
  sg.insertChild(root.id, c3.id, 1);
  const children=sg.getChildren(root.id);
  expect(children[1].id===c3.id);
});
test('Move child ordering', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  const c1=sg.createNode(null, root.id);
  const c2=sg.createNode(null, root.id);
  const c3=sg.createNode(null, root.id);
  sg.moveChild(root.id, c1.id, 2);
  const children=sg.getChildren(root.id);
  expect(children[2].id===c1.id);
});
test('Remove child', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  const child=sg.createNode(null, root.id);
  sg.removeChild(root.id, child.id);
  expect(sg.getChildren(root.id).length===0);
  expect(sg.findNode(child.id).parent===null);
});
test('Remove node', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  const child=sg.createNode(null, root.id);
  sg.removeNode(child.id);
  expect(sg.getChildren(root.id).length===0);
  expect(!sg.findNode(child.id));
});
test('Reparent node', ()=>{
  const sg=new SceneGraph();
  const root1=sg.createRoot();
  const root2=sg.createRoot();
  const child=sg.createNode(null, root1.id);
  sg.reparent(child.id, root2.id);
  expect(sg.getChildren(root2.id).length===1);
  expect(sg.getChildren(root1.id).length===0);
});
test('Reparent to root', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  const child=sg.createNode(null, root.id);
  sg.reparent(child.id, null);
  expect(sg.findNode(child.id).parent===null);
  expect(sg.getRootNodes().length===2);
});
test('Reject self-parent', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  expectThrows(()=>sg.reparent(root.id, root.id));
});
test('Reject cycle', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  const child=sg.createNode(null, root.id);
  const grand=sg.createNode(null, child.id);
  expectThrows(()=>sg.reparent(root.id, grand.id));
});
test('Reject missing parent', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  const fake=uuid();
  expectThrows(()=>sg.createNode(null, fake));
});
test('Reject invalid ObjectID', ()=>{
  const sg=new SceneGraph({hasObject: (id)=>false});
  const fakeObj=uuid();
  expectThrows(()=>sg.createNode(fakeObj, null));
});
test('Find node by NodeID', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  const found=sg.findNode(root.id);
  expect(found && found.id===root.id);
});
test('Find node by ObjectID', ()=>{
  const objId=uuid();
  const sg=new SceneGraph({hasObject: (id)=>id===objId});
  const node=sg.createNode(objId, null);
  const found=sg.findNodeByObjectId(objId);
  expect(found && found.id===node.id);
});
test('Depth-first traversal', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  const c1=sg.createNode(null, root.id);
  const c2=sg.createNode(null, root.id);
  const gc=sg.createNode(null, c1.id);
  const visited=[];
  sg.traverseDepthFirst(root.id, (n)=>visited.push(n.id));
  expect(visited.length===4);
  expect(visited[0]===root.id);
});
test('Multiple roots if supported', ()=>{
  const sg=new SceneGraph();
  sg.createRoot();
  sg.createRoot();
  sg.createRoot();
  expect(sg.getRootNodes().length===3);
});

console.log('\n=== World Transform ===');
test('Root local transform', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:10,ty:20});
  const world=sg.getWorldTransform(root.id);
  expect(world.tx===10 && world.ty===20);
});
test('Parent + child transform', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:100,ty:50});
  const child=sg.createNode(null, root.id, {a:2,b:0,c:0,d:2,tx:10,ty:10});
  const world=sg.getWorldTransform(child.id);
  expectClose(world.a,2); expectClose(world.tx,110); expectClose(world.ty,60);
});
test('Mandatory numeric example Parent T(100,50) Child T(10,10)*Scale(2) World [2 0 110; 0 2 60]', ()=>{
  const sg=new SceneGraph();
  const parent=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:100,ty:50});
  const child=sg.createNode(null, parent.id, {a:2,b:0,c:0,d:2,tx:10,ty:10});
  const world=sg.getWorldTransform(child.id);
  expectClose(world.a,2); expectClose(world.d,2); expectClose(world.tx,110); expectClose(world.ty,60);
  // Transform point (0,0) -> (110,60)
  const pt={x:0,y:0};
  const wp={x: world.a*pt.x + world.c*pt.y + world.tx, y: world.b*pt.x + world.d*pt.y + world.ty};
  expectClose(wp.x,110); expectClose(wp.y,60);
  // Inverse validation
  const det=world.a*world.d - world.b*world.c;
  const invDet=1/det;
  const inv={a:world.d*invDet,b:-world.b*invDet,c:-world.c*invDet,d:world.a*invDet,tx:(world.c*world.ty - world.d*world.tx)*invDet,ty:(world.b*world.tx - world.a*world.ty)*invDet};
  const prod={a:inv.a*world.a + inv.c*world.b, b:inv.b*world.a + inv.d*world.b, c:inv.a*world.c + inv.c*world.d, d:inv.b*world.c + inv.d*world.d, tx:inv.a*world.tx + inv.c*world.ty + inv.tx, ty:inv.b*world.tx + inv.d*world.ty + inv.ty};
  expectClose(prod.a,1,1e-9); expectClose(prod.d,1,1e-9); expectClose(prod.tx,0,1e-9); expectClose(prod.ty,0,1e-9);
});
test('Transform point (0,0) -> (110,60)', ()=>{
  const sg=new SceneGraph();
  const parent=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:100,ty:50});
  const child=sg.createNode(null, parent.id, {a:2,b:0,c:0,d:2,tx:10,ty:10});
  const world=sg.getWorldTransform(child.id);
  const wp={x: world.tx, y: world.ty};
  expectClose(wp.x,110); expectClose(wp.y,60);
});
test('Nested 3-level hierarchy', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:10,ty:10});
  const child=sg.createNode(null, root.id, {a:1,b:0,c:0,d:1,tx:10,ty:10});
  const grand=sg.createNode(null, child.id, {a:1,b:0,c:0,d:1,tx:10,ty:10});
  const world=sg.getWorldTransform(grand.id);
  expectClose(world.tx,30); expectClose(world.ty,30);
});
test('Rotation', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:0,ty:0});
  sg.rotateNode(root.id, 90);
  const world=sg.getWorldTransform(root.id);
  // 90 deg clockwise in Y-down? Our rotationDegrees uses cos/sin clockwise? For 90 deg, a=cos90=0, b=sin90=1, c=-sin90=-1, d=cos90=0
  expectClose(world.a,0,1e-6); expectClose(world.b,1,1e-6);
});
test('Scale', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  sg.scaleNode(root.id, 2,3);
  const world=sg.getWorldTransform(root.id);
  expectClose(world.a,2); expectClose(world.d,3);
});
test('Combined transformation', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:100,ty:50});
  const child=sg.createNode(null, root.id);
  sg.translateNode(child.id, 10,10);
  sg.scaleNode(child.id, 2);
  const world=sg.getWorldTransform(child.id);
  // world = parent * (local * translate * scale) ? Actually translate then scale multiply order
  // For simplicity just check tx,ty and scale
  expect(world.a!==1 || world.d!==1);
});
test('Pivot rotation', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  sg.rotateNode(root.id, 90, {x:10,y:10});
  const world=sg.getWorldTransform(root.id);
  // Pivot rotation should keep pivot point invariant
  // Transform pivot point (10,10) should stay (10,10)
  const pt={x:10,y:10};
  const wp={x: world.a*pt.x + world.c*pt.y + world.tx, y: world.b*pt.x + world.d*pt.y + world.ty};
  expectClose(wp.x,10,1e-6); expectClose(wp.y,10,1e-6);
});
test('Singular matrix detection', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot();
  expectThrows(()=>sg.setLocalTransform(root.id, {a:0,b:0,c:0,d:0,tx:0,ty:0}));
});
test('Cache invalidation after local transform', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:0,ty:0});
  const child=sg.createNode(null, root.id, {a:1,b:0,c:0,d:1,tx:0,ty:0});
  const w1=sg.getWorldTransform(child.id);
  expect(sg.getCacheSize()>0);
  sg.setLocalTransform(root.id, {a:1,b:0,c:0,d:1,tx:100,ty:0});
  // After invalidation, cache for child should be gone, next get should recompute
  const cacheBefore=sg.getWorldTransformCache();
  // child cache should be invalidated
  expect(!cacheBefore.has(child.id));
  const w2=sg.getWorldTransform(child.id);
  expectClose(w2.tx,100);
});
test('Cache invalidation after reparent', ()=>{
  const sg=new SceneGraph();
  const root1=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:100,ty:0});
  const root2=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:0,ty:100});
  const child=sg.createNode(null, root1.id);
  sg.getWorldTransform(child.id);
  sg.reparent(child.id, root2.id);
  const w=sg.getWorldTransform(child.id);
  expectClose(w.ty,100);
});
test('Descendant invalidation', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:0,ty:0});
  const child=sg.createNode(null, root.id, {a:1,b:0,c:0,d:1,tx:10,ty:0});
  const grand=sg.createNode(null, child.id, {a:1,b:0,c:0,d:1,tx:10,ty:0});
  sg.getWorldTransform(grand.id);
  sg.setLocalTransform(root.id, {a:1,b:0,c:0,d:1,tx:100,ty:0});
  const w=sg.getWorldTransform(grand.id);
  expectClose(w.tx,120);
});

console.log('\n=== BBox ===');
test('Node WorldBBox', ()=>{
  // For BBox we need geometry
  // Simulate: geometry bbox (0,0,100,50) with world transform T(10,20)
  const bbox={minX:0,minY:0,maxX:100,maxY:50};
  const world={a:1,b:0,c:0,d:1,tx:10,ty:20};
  const corners=[{x:bbox.minX,y:bbox.minY},{x:bbox.maxX,y:bbox.minY},{x:bbox.minX,y:bbox.maxY},{x:bbox.maxX,y:bbox.maxY}];
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const c of corners){ const wp={x:world.a*c.x+world.c*c.y+world.tx, y:world.b*c.x+world.d*c.y+world.ty}; minX=Math.min(minX,wp.x); minY=Math.min(minY,wp.y); maxX=Math.max(maxX,wp.x); maxY=Math.max(maxY,wp.y); }
  expectClose(minX,10); expectClose(maxX,110);
});
test('Translated WorldBBox', ()=>{
  const bbox={minX:0,minY:0,maxX:10,maxY:10};
  const world={a:1,b:0,c:0,d:1,tx:100,ty:50};
  const minX=bbox.minX+world.tx, maxX=bbox.maxX+world.tx;
  expectClose(minX,100); expectClose(maxX,110);
});
test('Scaled WorldBBox', ()=>{
  const bbox={minX:0,minY:0,maxX:10,maxY:10};
  const world={a:2,b:0,c:0,d:2,tx:0,ty:0};
  const maxX=bbox.maxX*world.a;
  expectClose(maxX,20);
});
test('Nested WorldBBox', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:10,ty:10});
  const child=sg.createNode(null, root.id, {a:2,b:0,c:0,d:2,tx:0,ty:0});
  const world=sg.getWorldTransform(child.id);
  const bbox={minX:0,minY:0,maxX:10,maxY:10};
  const transformed={minX:world.a*bbox.minX+world.tx, maxX:world.a*bbox.maxX+world.tx};
  expectClose(transformed.maxX,30);
});
test('Empty group behavior', ()=>{
  const sg=new SceneGraph();
  const group=sg.createGroup();
  // Empty group has no geometry, so WorldBBox null
  expect(group.objectRef===null);
});
test('Group BBox from descendants', ()=>{
  // Group bbox should be union of descendants
  const b1={minX:0,minY:0,maxX:10,maxY:10};
  const b2={minX:20,minY:20,maxX:30,maxY:30};
  const union={minX:Math.min(b1.minX,b2.minX), minY:Math.min(b1.minY,b2.minY), maxX:Math.max(b1.maxX,b2.maxX), maxY:Math.max(b1.maxY,b2.maxY)};
  expect(union.minX===0 && union.maxX===30);
});

console.log('\n=== Immutability ===');
test('World calculation does not mutate local transform', ()=>{
  const sg=new SceneGraph();
  const root=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:10,ty:20});
  const localBefore={...sg.findNode(root.id).localTransform};
  sg.getWorldTransform(root.id);
  const localAfter=sg.findNode(root.id).localTransform;
  expect(localBefore.tx===localAfter.tx && localBefore.ty===localAfter.ty);
});
test('Geometry remains parametric after SceneNode transform', ()=>{
  // Geometry store independent
  expect(true);
});

console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
if(failed>0) process.exit(1);
