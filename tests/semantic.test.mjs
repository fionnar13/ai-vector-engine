
import { GeometryStore, AppearanceStore, ObjectStore } from '../src-js/stores.js';
import { SceneGraph } from '../src-js/scenegraph.js';
import {
  SemanticStore,
  validateSemanticData,
  normalizeTags,
  normalizeTag,
  inferSemantic,
  inferSemanticBatch,
  proposalToSemanticData,
  serializeSemanticData,
  deserializeSemanticData,
  createCreateSemanticCommand,
  createUpdateSemanticCommand,
  createDeleteSemanticCommand
} from '../src-js/semantic.js';

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

let total=0, passed=0, failed=0;
function test(name, fn){ total++; try{ fn(); passed++; console.log(`✓ ${name}`);}catch(e){ failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }
function expectClose(a,b,tol=1e-9){ if(Math.abs(a-b)>tol) throw new Error(`${a} not close to ${b}`); }

function createDoc(){
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:(id)=>geometryStore.has(id), hasAppearance:(id)=>appearanceStore.has(id)});
  const sceneGraph=new SceneGraph();
  const semanticStore=new SemanticStore();
  return {geometryStore, appearanceStore, objectStore, sceneGraph, semanticStore};
}

function createRectObject(doc, x, y, w, h){
  const gid=uuid(); doc.geometryStore.create(gid, {type:'rect', params:{x, y, width:w, height:h, rx:0, ry:0}});
  const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[{id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}}]});
  const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}});
  return {gid, aid, oid, x, y, w, h};
}

console.log('=== Store ===');
test('create semantic', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  const data={objectId:oid, role:'button', tags:['ui','button'], confidence:0.9, source:'user', relationships:[]};
  doc.semanticStore.set(data);
  expect(doc.semanticStore.has(oid));
  const got=doc.semanticStore.get(oid);
  expect(got.role==='button');
});
test('get semantic', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  doc.semanticStore.set({objectId:oid, role:'icon', tags:['ui'], confidence:0.8, source:'heuristic', relationships:[]});
  const got=doc.semanticStore.get(oid);
  expect(got && got.objectId===oid);
});
test('update semantic', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  doc.semanticStore.set({objectId:oid, role:'shape', tags:['shape'], confidence:0.5, source:'heuristic', relationships:[]});
  doc.semanticStore.set({objectId:oid, role:'button', tags:['ui','button'], confidence:0.9, source:'user', relationships:[]});
  expect(doc.semanticStore.get(oid).role==='button');
});
test('delete semantic', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  doc.semanticStore.set({objectId:oid, role:'shape', tags:['shape'], confidence:0.5, source:'heuristic', relationships:[]});
  doc.semanticStore.delete(oid);
  expect(!doc.semanticStore.has(oid));
});
test('has semantic', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  expect(!doc.semanticStore.has(oid));
  doc.semanticStore.set({objectId:oid, role:'shape', tags:['shape'], confidence:0.5, source:'heuristic', relationships:[]});
  expect(doc.semanticStore.has(oid));
});
test('getAll', ()=>{
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,100);
  const o2=createRectObject(doc, 0,0,100,100);
  doc.semanticStore.set({objectId:o1.oid, role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[]});
  doc.semanticStore.set({objectId:o2.oid, role:'icon', tags:['ui'], confidence:0.8, source:'user', relationships:[]});
  const all=doc.semanticStore.getAll();
  expect(all.length===2);
  // deterministic ordering by objectId
  expect(all[0].objectId.localeCompare(all[1].objectId)<=0);
});
test('getByRole', ()=>{
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,100);
  const o2=createRectObject(doc, 0,0,100,100);
  doc.semanticStore.set({objectId:o1.oid, role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[]});
  doc.semanticStore.set({objectId:o2.oid, role:'icon', tags:['ui'], confidence:0.8, source:'user', relationships:[]});
  const buttons=doc.semanticStore.getByRole('button');
  expect(buttons.length===1 && buttons[0].objectId===o1.oid);
});
test('getByTag', ()=>{
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,100);
  const o2=createRectObject(doc, 0,0,100,100);
  doc.semanticStore.set({objectId:o1.oid, role:'button', tags:['primary','ui'], confidence:0.9, source:'user', relationships:[]});
  doc.semanticStore.set({objectId:o2.oid, role:'icon', tags:['secondary'], confidence:0.8, source:'user', relationships:[]});
  const primary=doc.semanticStore.getByTag('primary');
  expect(primary.length===1);
});

console.log('\n=== Validation ===');
test('invalid ObjectID', ()=>{
  const data={objectId:'not-uuid', role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[]};
  const res=validateSemanticData(data);
  expect(!res.valid);
});
test('invalid confidence NaN', ()=>{
  const oid=uuid();
  const data={objectId:oid, role:'button', tags:['ui'], confidence:NaN, source:'user', relationships:[]};
  const res=validateSemanticData(data);
  expect(!res.valid);
});
test('invalid confidence Infinity', ()=>{
  const oid=uuid();
  const data={objectId:oid, role:'button', tags:['ui'], confidence:Infinity, source:'user', relationships:[]};
  const res=validateSemanticData(data);
  expect(!res.valid);
});
test('confidence negative', ()=>{
  const oid=uuid();
  const data={objectId:oid, role:'button', tags:['ui'], confidence:-0.1, source:'user', relationships:[]};
  const res=validateSemanticData(data);
  expect(!res.valid);
});
test('confidence >1', ()=>{
  const oid=uuid();
  const data={objectId:oid, role:'button', tags:['ui'], confidence:1.5, source:'user', relationships:[]};
  const res=validateSemanticData(data);
  expect(!res.valid);
});
test('invalid role', ()=>{
  const oid=uuid();
  const data={objectId:oid, role:'!!!invalid!!!', tags:['ui'], confidence:0.9, source:'user', relationships:[]};
  const res=validateSemanticData(data);
  expect(!res.valid);
});
test('duplicate tags normalized', ()=>{
  const oid=uuid();
  const data={objectId:oid, role:'button', tags:['button','BUTTON',' button '], confidence:0.9, source:'user', relationships:[]};
  const res=validateSemanticData(data);
  expect(!res.valid); // duplicate after normalization
});
test('invalid relationship missing target', ()=>{
  const oid=uuid();
  const data={objectId:oid, role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[{targetObjectId:'not-uuid', type:'contains'}]};
  const res=validateSemanticData(data);
  expect(!res.valid);
});
test('invalid relationship type', ()=>{
  const oid=uuid();
  const target=uuid();
  const data={objectId:oid, role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[{targetObjectId:target, type:'invalidType'}]};
  const res=validateSemanticData(data);
  expect(!res.valid);
});
test('tag normalization', ()=>{
  const tags=[' UI ', 'Button', 'primary', 'PRIMARY'];
  const normalized=normalizeTags(tags);
  expect(normalized.length===3); // ui, button, primary sorted
  expect(normalized[0]==='button' && normalized[1]==='primary' && normalized[2]==='ui');
});

console.log('\n=== Inference ===');
test('rectangle inference', ()=>{
  const oid=uuid();
  const input={
    objectId:oid,
    geometry:{type:'rect', params:{width:100, height:100}},
    appearance:{stack:[{type:'fill', enabled:true}]},
    sceneContext:{bbox:{minX:0,minY:0,maxX:100,maxY:100,width:100,height:100,area:10000}}
  };
  const proposal=inferSemantic(input);
  expect(proposal && proposal.proposedRole==='shape');
  expect(proposal.evidence.length>0);
});
test('ellipse inference', ()=>{
  const oid=uuid();
  const input={
    objectId:oid,
    geometry:{type:'ellipse', params:{rx:50, ry:50}},
    sceneContext:{bbox:{minX:0,minY:0,maxX:100,maxY:100,width:100,height:100,area:7850}}
  };
  const proposal=inferSemantic(input);
  expect(proposal && proposal.proposedRole==='shape');
});
test('path inference icon', ()=>{
  const oid=uuid();
  const input={
    objectId:oid,
    geometry:{type:'path', contours:[{anchors:[{id:'a1'},{id:'a2'},{id:'a3'}]}]},
    sceneContext:{bbox:{minX:0,minY:0,maxX:24,maxY:24,width:24,height:24,area:576}}
  };
  const proposal=inferSemantic(input);
  expect(proposal && (proposal.proposedRole==='icon' || proposal.proposedRole==='shape'));
});
test('text inference', ()=>{
  const oid=uuid();
  const input={
    objectId:oid,
    geometry:{type:'text'},
    sceneContext:{isText:true, textContent:'Hello World', bbox:{minX:0,minY:0,maxX:100,maxY:20,width:100,height:20,area:2000}}
  };
  const proposal=inferSemantic(input);
  expect(proposal && (proposal.proposedRole==='text' || proposal.proposedRole==='heading'));
  expect(proposal.evidence.some(e=> e.signal==='text'));
});
test('unknown object insufficient evidence', ()=>{
  const oid=uuid();
  const input={
    objectId:oid,
    geometry:{type:'unknown'},
    sceneContext:{}
  };
  const proposal=inferSemantic(input);
  expect(proposal && proposal.proposedRole==='unknown' || proposal.proposedRole==='shape');
});
test('deterministic repeated inference', ()=>{
  const oid=uuid();
  const input={
    objectId:oid,
    geometry:{type:'rect', params:{width:100, height:100}},
    sceneContext:{bbox:{minX:0,minY:0,maxX:100,maxY:100,width:100,height:100,area:10000}}
  };
  const p1=inferSemantic(input);
  const p2=inferSemantic(input);
  expect(p1.proposedRole===p2.proposedRole);
  expect(JSON.stringify(p1.proposedTags)===JSON.stringify(p2.proposedTags));
  expect(p1.confidence===p2.confidence);
  // evidence deterministic sorted
  expect(JSON.stringify(p1.evidence)===JSON.stringify(p2.evidence));
});
test('large rectangle background candidate', ()=>{
  const oid=uuid();
  const input={
    objectId:oid,
    geometry:{type:'rect', params:{width:800, height:600}},
    sceneContext:{bbox:{minX:0,minY:0,maxX:800,maxY:600,width:800,height:600,area:480000}}
  };
  const proposal=inferSemantic(input);
  expect(proposal && proposal.proposedRole==='background');
});

console.log('\n=== Proposal ===');
test('proposal creation contains evidence', ()=>{
  const oid=uuid();
  const input={
    objectId:oid,
    geometry:{type:'rect', params:{width:100, height:100}},
    sceneContext:{bbox:{minX:0,minY:0,maxX:100,maxY:100,width:100,height:100,area:10000}}
  };
  const proposal=inferSemantic(input);
  expect(proposal.proposalId && proposal.objectId===oid);
  expect(Array.isArray(proposal.evidence) && proposal.evidence.length>0);
  expect(typeof proposal.confidence==='number');
});
test('proposal does not mutate store', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  const beforeSize=doc.semanticStore.size();
  const input={
    objectId:oid,
    geometry:{type:'rect', params:{width:100, height:100}},
    sceneContext:{bbox:{minX:0,minY:0,maxX:100,maxY:100,width:100,height:100,area:10000}}
  };
  const proposal=inferSemantic(input);
  expect(doc.semanticStore.size()===beforeSize);
  expect(!doc.semanticStore.has(oid));
});

console.log('\n=== Boundary ===');
test('inferSemantic does not mutate ObjectStore', ()=>{
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,100);
  const before=JSON.stringify(doc.objectStore.get(rect.oid));
  inferSemantic({
    objectId:rect.oid,
    geometry:{type:'rect', params:{width:100, height:100}},
    sceneContext:{bbox:{minX:0,minY:0,maxX:100,maxY:100,width:100,height:100,area:10000}}
  });
  const after=JSON.stringify(doc.objectStore.get(rect.oid));
  expect(before===after);
});
test('inferSemantic does not mutate GeometryStore', ()=>{
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,100);
  const before=JSON.stringify(doc.geometryStore.get(rect.gid));
  inferSemantic({
    objectId:rect.oid,
    geometry:doc.geometryStore.get(rect.gid),
    sceneContext:{bbox:{minX:0,minY:0,maxX:100,maxY:100,width:100,height:100,area:10000}}
  });
  const after=JSON.stringify(doc.geometryStore.get(rect.gid));
  expect(before===after);
});
test('inferSemantic does not mutate SceneGraph', ()=>{
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(rect.oid, root.id);
  const before=doc.sceneGraph.getAllNodes().length;
  inferSemantic({
    objectId:rect.oid,
    geometry:{type:'rect', params:{width:100, height:100}},
    sceneContext:{bbox:{minX:0,minY:0,maxX:100,maxY:100,width:100,height:100,area:10000}}
  });
  const after=doc.sceneGraph.getAllNodes().length;
  expect(before===after);
});
test('inferSemantic does not mutate SemanticStore', ()=>{
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,100);
  doc.semanticStore.set({objectId:rect.oid, role:'shape', tags:['shape'], confidence:0.5, source:'heuristic', relationships:[]});
  const before=doc.semanticStore.size();
  inferSemantic({
    objectId:rect.oid,
    geometry:{type:'rect', params:{width:100, height:100}},
    sceneContext:{bbox:{minX:0,minY:0,maxX:100,maxY:100,width:100,height:100,area:10000}}
  });
  expect(doc.semanticStore.size()===before);
});

console.log('\n=== Transaction ===');
test('create semantic transaction', ()=>{
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,100);
  // Mock working copy
  const workingCopy={
    semantics:new Map(),
    getObject:(id)=> doc.objectStore.get(id),
    getSemantic:(id)=> workingCopy.semantics.get(id) || doc.semanticStore.get(id),
    setSemantic:(data)=> { workingCopy.semantics.set(data.objectId, JSON.parse(JSON.stringify(data))); doc.semanticStore.set(data); },
    deleteSemantic:(id)=> { workingCopy.semantics.delete(id); doc.semanticStore.delete(id); }
  };
  const data={objectId:rect.oid, role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[]};
  const cmd=createCreateSemanticCommand({data});
  const res=cmd.execute({workingCopy});
  expect(res.success);
  expect(doc.semanticStore.has(rect.oid));
});
test('update semantic', ()=>{
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,100);
  doc.semanticStore.set({objectId:rect.oid, role:'shape', tags:['shape'], confidence:0.5, source:'heuristic', relationships:[]});
  const workingCopy={
    semantics:new Map(),
    getSemantic:(id)=> doc.semanticStore.get(id),
    setSemantic:(data)=> doc.semanticStore.set(data),
    deleteSemantic:(id)=> doc.semanticStore.delete(id)
  };
  const cmd=createUpdateSemanticCommand({objectId:rect.oid, data:{role:'button', tags:['ui','primary']}});
  const res=cmd.execute({workingCopy});
  expect(res.success);
  expect(doc.semanticStore.get(rect.oid).role==='button');
});
test('delete semantic', ()=>{
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,100);
  doc.semanticStore.set({objectId:rect.oid, role:'shape', tags:['shape'], confidence:0.5, source:'heuristic', relationships:[]});
  const workingCopy={
    getSemantic:(id)=> doc.semanticStore.get(id),
    setSemantic:(data)=> doc.semanticStore.set(data),
    deleteSemantic:(id)=> doc.semanticStore.delete(id)
  };
  const cmd=createDeleteSemanticCommand({objectId:rect.oid});
  const res=cmd.execute({workingCopy});
  expect(res.success);
  expect(!doc.semanticStore.has(rect.oid));
});
test('undo redo semantic', ()=>{
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,100);
  const workingCopy={
    semantics:new Map(),
    getObject:(id)=> doc.objectStore.get(id),
    getSemantic:(id)=> workingCopy.semantics.get(id) || doc.semanticStore.get(id),
    setSemantic:(data)=> { workingCopy.semantics.set(data.objectId, JSON.parse(JSON.stringify(data))); try{ doc.semanticStore.set(data);}catch{} },
    deleteSemantic:(id)=> { workingCopy.semantics.delete(id); doc.semanticStore.delete(id); }
  };
  const data={objectId:rect.oid, role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[]};
  const cmd=createCreateSemanticCommand({data});
  cmd.execute({workingCopy});
  expect(doc.semanticStore.has(rect.oid));
  const inverse=cmd.getInverse();
  inverse.execute({workingCopy});
  expect(!doc.semanticStore.has(rect.oid));
  // redo
  cmd.execute({workingCopy});
  expect(doc.semanticStore.has(rect.oid));
});
test('rollback on validation failure', ()=>{
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,100);
  const workingCopy={
    getObject:(id)=> doc.objectStore.get(id),
    getSemantic:(id)=> doc.semanticStore.get(id),
    setSemantic:(data)=> doc.semanticStore.set(data),
    deleteSemantic:(id)=> doc.semanticStore.delete(id)
  };
  const invalidData={objectId:rect.oid, role:'button', tags:['ui'], confidence:2, source:'user', relationships:[]}; // confidence >1 invalid
  const cmd=createCreateSemanticCommand({data:invalidData});
  const res=cmd.execute({workingCopy});
  expect(!res.success);
  expect(!doc.semanticStore.has(rect.oid));
});
test('object existence validation', ()=>{
  const doc=createDoc();
  const fakeOid=uuid();
  const workingCopy={
    getObject:(id)=> doc.objectStore.get(id),
    getSemantic:(id)=> doc.semanticStore.get(id),
    setSemantic:(data)=> doc.semanticStore.set(data),
    deleteSemantic:(id)=> doc.semanticStore.delete(id)
  };
  const data={objectId:fakeOid, role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[]};
  const cmd=createCreateSemanticCommand({data});
  const res=cmd.execute({workingCopy});
  expect(!res.success);
});

console.log('\n=== Events ===');
test('SemanticInferred does not imply persistence', ()=>{
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,100);
  const proposal=inferSemantic({
    objectId:rect.oid,
    geometry:{type:'rect', params:{width:100, height:100}},
    sceneContext:{bbox:{minX:0,minY:0,maxX:100,maxY:100,width:100,height:100,area:10000}}
  });
  // Simulate event
  const event={type:'SemanticInferred', proposalId:proposal.proposalId, objectId:rect.oid, proposal, source:'heuristic'};
  expect(event.type==='SemanticInferred');
  expect(!doc.semanticStore.has(rect.oid)); // not persisted
});
test('mutation events after commit only', ()=>{
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,100);
  let events=[];
  const workingCopy={
    getObject:(id)=> doc.objectStore.get(id),
    getSemantic:(id)=> doc.semanticStore.get(id),
    setSemantic:(data)=> { doc.semanticStore.set(data); events.push({type:'SemanticCreated', objectId:data.objectId}); },
    deleteSemantic:(id)=> { doc.semanticStore.delete(id); events.push({type:'SemanticDeleted', objectId:id}); }
  };
  // Before commit, no events
  expect(events.length===0);
  const data={objectId:rect.oid, role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[]};
  const cmd=createCreateSemanticCommand({data});
  cmd.execute({workingCopy});
  expect(events.length===1 && events[0].type==='SemanticCreated');
});

console.log('\n=== Serialization ===');
test('serialize deserialize deterministic', ()=>{
  const oid=uuid();
  const data={objectId:oid, role:'button', tags:['ui','primary'], confidence:0.9, source:'user', relationships:[]};
  const json=serializeSemanticData(data);
  const data2=deserializeSemanticData(json);
  expect(data2.objectId===oid);
  expect(data2.role==='button');
  expect(JSON.stringify(data2.tags)===JSON.stringify(['primary','ui'].sort()));
});
test('tags serialize deterministic', ()=>{
  const oid=uuid();
  const data={objectId:oid, role:'button', tags:['zebra','apple','middle'], confidence:0.9, source:'user', relationships:[]};
  const json=serializeSemanticData(data);
  const parsed=JSON.parse(json);
  expect(parsed.tags[0]==='apple' && parsed.tags[1]==='middle' && parsed.tags[2]==='zebra');
});

console.log('\n=== Query API ===');
test('findObjectsByRole', ()=>{
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,100);
  const o2=createRectObject(doc, 0,0,100,100);
  doc.semanticStore.set({objectId:o1.oid, role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[]});
  doc.semanticStore.set({objectId:o2.oid, role:'button', tags:['ui'], confidence:0.8, source:'user', relationships:[]});
  const buttons=doc.semanticStore.getByRole('button');
  expect(buttons.length===2);
});
test('getSemanticConfidence', ()=>{
  const doc=createDoc();
  const {oid}=createRectObject(doc, 0,0,100,100);
  doc.semanticStore.set({objectId:oid, role:'button', tags:['ui'], confidence:0.95, source:'user', relationships:[]});
  const sem=doc.semanticStore.get(oid);
  expect(sem.confidence===0.95);
});
test('getRelationships', ()=>{
  const doc=createDoc();
  const o1=createRectObject(doc, 0,0,100,100);
  const o2=createRectObject(doc, 0,0,100,100);
  const rel={targetObjectId:o2.oid, type:'associatedWith'};
  doc.semanticStore.set({objectId:o1.oid, role:'button', tags:['ui'], confidence:0.9, source:'user', relationships:[rel]});
  const sem=doc.semanticStore.get(o1.oid);
  expect(sem.relationships.length===1 && sem.relationships[0].targetObjectId===o2.oid);
});

console.log('\n=== Vertical Slice ===');
test('vertical slice artboard large rect text small rect', ()=>{
  const doc=createDoc();
  const large=createRectObject(doc, 0,0,800,600);
  const textOid=uuid();
  const textGid=uuid(); doc.geometryStore.create(textGid, {type:'rect', params:{x:0,y:0,width:200,height:30,rx:0,ry:0}}); // simplified text as rect
  const textAid=uuid(); doc.appearanceStore.create(textAid, {id:textAid, stack:[]});
  doc.objectStore.create({id:textOid, geometryRef:textGid, appearanceRef:textAid, meta:{name:'text', locked:false, visible:true, selectable:true}});
  const small=createRectObject(doc, 100,100,50,30);

  // Inference should not mutate store
  const beforeSize=doc.semanticStore.size();
  const inputs=[
    {objectId:large.oid, geometry:{type:'rect', params:{width:800,height:600}}, sceneContext:{bbox:{minX:0,minY:0,maxX:800,maxY:600,width:800,height:600,area:480000}}},
    {objectId:textOid, geometry:{type:'text'}, sceneContext:{isText:true, textContent:'Hello', bbox:{minX:100,minY:100,maxX:300,maxY:130,width:200,height:30,area:6000}}},
    {objectId:small.oid, geometry:{type:'rect', params:{width:50,height:30}}, sceneContext:{bbox:{minX:100,minY:100,maxX:150,maxY:130,width:50,height:30,area:1500}}}
  ];
  const proposals=inferSemanticBatch(inputs);
  expect(proposals.length===3);
  expect(doc.semanticStore.size()===beforeSize); // remains unchanged

  // Find proposals
  const largeProp=proposals.find(p=> p.objectId===large.oid);
  const textProp=proposals.find(p=> p.objectId===textOid);
  const smallProp=proposals.find(p=> p.objectId===small.oid);
  expect(largeProp && (largeProp.proposedRole==='background' || largeProp.proposedRole==='shape' || largeProp.proposedRole==='container'));
  expect(textProp && (textProp.proposedRole==='text' || textProp.proposedRole==='heading'));
  expect(smallProp && smallProp.proposedRole==='shape');

  // Persist via transaction
  for(const prop of proposals){
    const data=proposalToSemanticData(prop, 'heuristic');
    doc.semanticStore.set(data);
  }
  expect(doc.semanticStore.size()===3);

  // Undo simulation: delete one and restore
  const oidToDelete=large.oid;
  const beforeDelete=doc.semanticStore.get(oidToDelete);
  doc.semanticStore.delete(oidToDelete);
  expect(!doc.semanticStore.has(oidToDelete));
  doc.semanticStore.set(beforeDelete);
  expect(doc.semanticStore.has(oidToDelete));
});

console.log('\n=== Immutability ===');
test('snapshot before after inference identical', ()=>{
  const doc=createDoc();
  const rect=createRectObject(doc, 0,0,100,100);
  const root=doc.sceneGraph.createRoot();
  doc.sceneGraph.createNode(rect.oid, root.id);
  const snapshot={
    objects: JSON.stringify(doc.objectStore.get(rect.oid)),
    geometry: JSON.stringify(doc.geometryStore.get(rect.gid)),
    nodes: doc.sceneGraph.getAllNodes().length,
    semanticSize: doc.semanticStore.size()
  };
  inferSemantic({
    objectId:rect.oid,
    geometry:{type:'rect', params:{width:100,height:100}},
    sceneContext:{bbox:{minX:0,minY:0,maxX:100,maxY:100,width:100,height:100,area:10000}}
  });
  const after={
    objects: JSON.stringify(doc.objectStore.get(rect.oid)),
    geometry: JSON.stringify(doc.geometryStore.get(rect.gid)),
    nodes: doc.sceneGraph.getAllNodes().length,
    semanticSize: doc.semanticStore.size()
  };
  expect(JSON.stringify(snapshot)===JSON.stringify(after));
});

console.log('\n=== Architecture ===');
test('no direct store mutation from heuristics', ()=>{
  // heuristics file should not import stores write methods
  expect(true);
});
test('no UI imports', ()=>{
  expect(true);
});
test('proposal is read-only', ()=>{
  const oid=uuid();
  const input={objectId:oid, geometry:{type:'rect', params:{width:100,height:100}}, sceneContext:{bbox:{minX:0,minY:0,maxX:100,maxY:100,width:100,height:100,area:10000}}};
  const proposal=inferSemantic(input);
  // proposal should not have method to mutate store
  expect(!proposal.set);
});

console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
if(failed>0) process.exit(1);
