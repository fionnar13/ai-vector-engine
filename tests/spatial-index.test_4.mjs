
import { SceneGraph, SimpleSpatialIndex } from '../src-js/scenegraph.js';

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

let total=0, passed=0, failed=0;
function test(name, fn){ total++; try{ fn(); passed++; console.log(`✓ ${name}`);}catch(e){ failed++; console.error(`✗ ${name}: ${e.message}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }

console.log('=== SpatialIndex ===');
test('Insert', ()=>{ const idx=new SimpleSpatialIndex(); const id=uuid(); idx.insert(id, {minX:0,minY:0,maxX:10,maxY:10}); expect(idx.size()===1); });
test('Update', ()=>{ const idx=new SimpleSpatialIndex(); const id=uuid(); idx.insert(id, {minX:0,minY:0,maxX:10,maxY:10}); idx.update(id, {minX:0,minY:0,maxX:20,maxY:20}); const entries=idx.getAllEntries(); expect(entries.get(id).maxX===20); });
test('Delete', ()=>{ const idx=new SimpleSpatialIndex(); const id=uuid(); idx.insert(id, {minX:0,minY:0,maxX:10,maxY:10}); idx.delete(id); expect(idx.size()===0); });
test('Query intersection', ()=>{ const idx=new SimpleSpatialIndex(); const id1=uuid(), id2=uuid(), id3=uuid(); idx.insert(id1, {minX:0,minY:0,maxX:10,maxY:10}); idx.insert(id2, {minX:20,minY:20,maxX:30,maxY:30}); idx.insert(id3, {minX:5,minY:5,maxX:15,maxY:15}); const result=idx.query({minX:0,minY:0,maxX:12,maxY:12}); expect(result.includes(id1) && result.includes(id3) && !result.includes(id2)); });
test('Query point', ()=>{ const idx=new SimpleSpatialIndex(); const id=uuid(); idx.insert(id, {minX:0,minY:0,maxX:10,maxY:10}); const result=idx.queryPoint({x:5,y:5}, 0.1); expect(result.includes(id)); });
test('Tolerance', ()=>{ const idx=new SimpleSpatialIndex(); const id=uuid(); idx.insert(id, {minX:0,minY:0,maxX:10,maxY:10}); const result=idx.queryPoint({x:15,y:5}, 6); expect(result.includes(id)); });
test('Multiple candidates', ()=>{ const idx=new SimpleSpatialIndex(); const ids=[uuid(),uuid(),uuid()]; ids.forEach(id=>idx.insert(id, {minX:0,minY:0,maxX:10,maxY:10})); const result=idx.query({minX:0,minY:0,maxX:10,maxY:10}); expect(result.length===3); });
test('Deterministic result ordering', ()=>{ const idx=new SimpleSpatialIndex(); const id1='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'; const id2='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'; const id3='cccccccc-cccc-4ccc-cccc-cccccccccccc'; idx.insert(id2, {minX:0,minY:0,maxX:10,maxY:10}); idx.insert(id1, {minX:0,minY:0,maxX:10,maxY:10}); idx.insert(id3, {minX:0,minY:0,maxX:10,maxY:10}); const r1=idx.query({minX:0,minY:0,maxX:10,maxY:10}); const r2=idx.query({minX:0,minY:0,maxX:10,maxY:10}); expect(JSON.stringify(r1)===JSON.stringify(r2)); expect(r1[0]===id1 && r1[1]===id2 && r1[2]===id3); });
test('Rebuild', ()=>{ let rebuildCalled=false; const idx=new SimpleSpatialIndex(()=>{ rebuildCalled=true; }); idx.insert(uuid(), {minX:0,minY:0,maxX:10,maxY:10}); idx.rebuild(); expect(rebuildCalled); });
test('Empty index', ()=>{ const idx=new SimpleSpatialIndex(); const result=idx.query({minX:0,minY:0,maxX:10,maxY:10}); expect(result.length===0); });
test('Stale-index fallback', ()=>{ const sg=new SceneGraph(); const root=sg.createRoot(); const child=sg.createNode(null, root.id); const allNodes=sg.getAllNodes(); expect(allNodes.length===2); const idx=new SimpleSpatialIndex(); let fallbackResult=[]; for(const node of allNodes){ fallbackResult.push(node.id); } expect(fallbackResult.length===2); });
test('Transform causes index update', ()=>{ const idx=new SimpleSpatialIndex(); const sg=new SceneGraph(); const root=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:0,ty:0}); idx.insert(root.id, {minX:0,minY:0,maxX:10,maxY:10}); sg.setLocalTransform(root.id, {a:1,b:0,c:0,d:1,tx:100,ty:100}); const world=sg.getWorldTransform(root.id); idx.update(root.id, {minX:world.tx, minY:world.ty, maxX:world.tx+10, maxY:world.ty+10}); const result=idx.query({minX:100,minY:100,maxX:110,maxY:110}); expect(result.includes(root.id)); });
test('Reparent causes appropriate bbox/index update', ()=>{ const idx=new SimpleSpatialIndex(); const sg=new SceneGraph(); const root1=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:0,ty:0}); const root2=sg.createRoot(null, {a:1,b:0,c:0,d:1,tx:100,ty:0}); const child=sg.createNode(null, root1.id); idx.insert(child.id, {minX:0,minY:0,maxX:10,maxY:10}); sg.reparent(child.id, root2.id); const world=sg.getWorldTransform(child.id); idx.update(child.id, {minX:world.tx, minY:world.ty, maxX:world.tx+10, maxY:world.ty+10}); expect(world.tx===100); });

console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
if(failed>0) process.exit(1);
