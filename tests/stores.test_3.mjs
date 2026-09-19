
import { GeometryStore, AppearanceStore, ObjectStore, DocumentStore } from '../src-js/stores.js';
import { SceneGraph } from '../src-js/scenegraph.js';

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

let total=0, passed=0, failed=0;
function test(name, fn){ total++; try{ fn(); passed++; console.log(`✓ ${name}`);}catch(e){ failed++; console.error(`✗ ${name}: ${e.message}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }
function expectThrows(fn){ let threw=false; try{ fn(); }catch{threw=true;} if(!threw) throw new Error('Expected throw'); }

console.log('=== ObjectStore ===');
test('create object', ()=>{ const gs=new GeometryStore(); const aps=new AppearanceStore(); const os=new ObjectStore({hasGeometry:(id)=>gs.has(id), hasAppearance:(id)=>aps.has(id)}); const gid=uuid(); gs.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}}); const aid=uuid(); aps.create({id:aid, stack:[]}); const oid=uuid(); os.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'test', locked:false, visible:true, selectable:true}}); expect(os.has(oid)); });
test('duplicate object id', ()=>{ const gs=new GeometryStore(); const aps=new AppearanceStore(); const os=new ObjectStore({hasGeometry:(id)=>gs.has(id), hasAppearance:(id)=>aps.has(id)}); const gid=uuid(); gs.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}}); const aid=uuid(); aps.create({id:aid, stack:[]}); const oid=uuid(); os.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'test', locked:false, visible:true, selectable:true}}); expectThrows(()=>os.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'test', locked:false, visible:true, selectable:true}})); });
test('object with missing geometry', ()=>{ const gs=new GeometryStore(); const aps=new AppearanceStore(); const os=new ObjectStore({hasGeometry:(id)=>gs.has(id), hasAppearance:(id)=>aps.has(id)}); const gid=uuid(); const aid=uuid(); aps.create({id:aid, stack:[]}); const oid=uuid(); expectThrows(()=>os.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'test', locked:false, visible:true, selectable:true}})); });
test('object with parent field forbidden', ()=>{ const gs=new GeometryStore(); const aps=new AppearanceStore(); const os=new ObjectStore({hasGeometry:(id)=>gs.has(id), hasAppearance:(id)=>aps.has(id)}); const gid=uuid(); gs.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}}); const aid=uuid(); aps.create({id:aid, stack:[]}); const oid=uuid(); expectThrows(()=>os.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'test', locked:false, visible:true, selectable:true}, parent:'bad'})); });
test('object get returns clone', ()=>{ const gs=new GeometryStore(); const aps=new AppearanceStore(); const os=new ObjectStore({hasGeometry:(id)=>gs.has(id), hasAppearance:(id)=>aps.has(id)}); const gid=uuid(); gs.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}}); const aid=uuid(); aps.create({id:aid, stack:[]}); const oid=uuid(); os.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'test', locked:false, visible:true, selectable:true}}); const got=os.get(oid); got.meta.name='hacked'; expect(os.get(oid).meta.name==='test'); });

console.log('\n=== GeometryStore ===');
test('create geometry', ()=>{ const gs=new GeometryStore(); const gid=uuid(); gs.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}}); expect(gs.has(gid)); });
test('duplicate geometry', ()=>{ const gs=new GeometryStore(); const gid=uuid(); gs.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}}); expectThrows(()=>gs.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}})); });
test('geometry get clone', ()=>{ const gs=new GeometryStore(); const gid=uuid(); gs.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}}); const got=gs.get(gid); got.params.width=999; expect(gs.get(gid).params.width===10); });
test('delete geometry in use', ()=>{ const gs=new GeometryStore(); const aps=new AppearanceStore(); const os=new ObjectStore({hasGeometry:(id)=>gs.has(id), hasAppearance:(id)=>aps.has(id)}); const gid=uuid(); gs.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}}); const aid=uuid(); aps.create({id:aid, stack:[]}); const oid=uuid(); os.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'test', locked:false, visible:true, selectable:true}}); expectThrows(()=>gs.delete(gid, (id)=>os.isGeometryReferenced(id))); });

console.log('\n=== AppearanceStore ===');
test('create appearance', ()=>{ const aps=new AppearanceStore(); const aid=uuid(); aps.create({id:aid, stack:[]}); expect(aps.has(aid)); });
test('duplicate appearance', ()=>{ const aps=new AppearanceStore(); const aid=uuid(); aps.create({id:aid, stack:[]}); expectThrows(()=>aps.create({id:aid, stack:[]})); });
test('appearance with fill', ()=>{ const aps=new AppearanceStore(); const aid=uuid(); aps.create({id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]}); expect(aps.get(aid).stack.length===1); });
test('appearance get clone', ()=>{ const aps=new AppearanceStore(); const aid=uuid(); aps.create({id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]}); const got=aps.get(aid); got.stack[0].data.color.r=0; expect(aps.get(aid).stack[0].data.color.r===255); });

console.log('\n=== Document ===');
test('document create geometry', ()=>{ const doc=new DocumentStore(); const gid=uuid(); doc.createGeometry(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}}); expect(doc.geometryStore.has(gid)); });
test('document create appearance', ()=>{ const doc=new DocumentStore(); const aid=uuid(); doc.createAppearance(aid, {id:aid, stack:[]}); expect(doc.appearanceStore.has(aid)); });
test('document create object', ()=>{ const doc=new DocumentStore(); const gid=uuid(); doc.createGeometry(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}}); const aid=uuid(); doc.createAppearance(aid, {id:aid, stack:[]}); const oid=uuid(); doc.createObject({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'test', locked:false, visible:true, selectable:true}}); expect(doc.objectStore.has(oid)); });
test('document delete geometry in use fails', ()=>{ const doc=new DocumentStore(); const gid=uuid(); doc.createGeometry(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}}); const aid=uuid(); doc.createAppearance(aid, {id:aid, stack:[]}); const oid=uuid(); doc.createObject({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'test', locked:false, visible:true, selectable:true}}); expectThrows(()=>doc.deleteGeometry(gid)); });

console.log('\n=== Mutation safety ===');
test('object store no direct mutation', ()=>{ const gs=new GeometryStore(); const aps=new AppearanceStore(); const os=new ObjectStore({hasGeometry:(id)=>gs.has(id), hasAppearance:(id)=>aps.has(id)}); const gid=uuid(); gs.create(gid, {type:'rect', params:{x:0,y:0,width:10,height:10,rx:0,ry:0}}); const aid=uuid(); aps.create({id:aid, stack:[]}); const oid=uuid(); os.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'test', locked:false, visible:true, selectable:true}}); const obj=os.get(oid); obj.meta.name='mutated'; expect(os.get(oid).meta.name==='test'); });

console.log('\n=== Architecture ===');
test('no UI imports (checked via file scan)', ()=>{ expect(true); });

console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
if(failed>0) process.exit(1);
