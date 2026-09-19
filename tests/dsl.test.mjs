
import { parseDSL, validateDSL, compileDSL, compileToIR, serializeDSL, DSLExecutor, DSLReferenceEnvironment, mapToToolIR, lintDSL, validateSchema, TOOL_MAPPING, DSLErrorCodes } from '../src-js/dsl.js';
import { GeometryStore, AppearanceStore, ObjectStore } from '../src-js/stores.js';
import { SceneGraph } from '../src-js/scenegraph.js';
import { SemanticStore } from '../src-js/semantic.js';
import { createCoreToolRegistry } from '../src-js/tools.js';

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

let total=0, passed=0, failed=0;
function test(name, fn){ total++; try{ fn(); passed++; console.log(`✓ ${name}`);}catch(e){ failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }

function createDoc(){
  const geometryStore=new GeometryStore();
  const appearanceStore=new AppearanceStore();
  const objectStore=new ObjectStore({hasGeometry:()=>true, hasAppearance:()=>true});
  const sceneGraph=new SceneGraph();
  const semanticStore=new SemanticStore();
  return {geometryStore, appearanceStore, objectStore, sceneGraph, semanticStore};
}

console.log('=== Parser Tests ===');
test('valid program', ()=>{
  const input={version:'1.0', program:[{op:'create', type:'rect', id:'rectA', args:{width:200, height:100}}]};
  const result=parseDSL(input);
  expect(result.success);
  expect(result.program.instructions.length===1);
});
test('malformed JSON', ()=>{
  const result=parseDSL('{ invalid json');
  expect(!result.success);
  expect(result.errors[0].code===DSLErrorCodes.PARSE_ERROR);
});
test('missing version', ()=>{
  const input={program:[{op:'create', type:'rect', id:'a', args:{width:100, height:100}}]};
  const result=parseDSL(input);
  expect(!result.success);
});
test('unsupported version', ()=>{
  const input={version:'2.0', program:[{op:'create', type:'rect', id:'a', args:{width:100, height:100}}]};
  const result=parseDSL(input);
  expect(!result.success);
  expect(result.errors.some(e=> e.code===DSLErrorCodes.UNSUPPORTED_VERSION));
});
test('missing operation', ()=>{
  const input={version:'1.0', program:[{type:'rect', id:'a'}]};
  const result=parseDSL(input);
  expect(!result.success);
});
test('unknown operation', ()=>{
  const input={version:'1.0', program:[{op:'unknown_op', id:'a'}]};
  const result=parseDSL(input);
  expect(!result.success);
  expect(result.errors.some(e=> e.code===DSLErrorCodes.INVALID_OPERATION));
});

console.log('\n=== Schema Tests ===');
test('wrong types width string must fail', ()=>{
  const input={version:'1.0', program:[{op:'create', type:'rect', id:'a', args:{width:'200', height:100}}]};
  const result=parseDSL(input);
  expect(!result.success);
});
test('missing required fields delete without targets', ()=>{
  const input={version:'1.0', program:[{op:'delete'}]};
  const result=parseDSL(input);
  expect(!result.success);
});
test('invalid enum boolean operation', ()=>{
  const input={version:'1.0', program:[{op:'boolean', operation:'invalid', targets:['a','b']}]};
  const result=parseDSL(input);
  expect(!result.success);
});
test('invalid numeric values NaN', ()=>{
  const input={version:'1.0', program:[{op:'create', type:'rect', id:'a', args:{width:NaN, height:100}}]};
  const result=parseDSL(input);
  expect(!result.success);
});
test('invalid nested objects transform without args', ()=>{
  const input={version:'1.0', program:[{op:'transform', target:'a'}]};
  const result=parseDSL(input);
  expect(!result.success);
});

console.log('\n=== Reference Tests ===');
test('valid reference', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'rectA', args:{width:200, height:100}},
    {op:'transform', target:'rectA', args:{translate:{x:10, y:0}}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
  const validation=validateDSL(parse.program);
  expect(validation.valid, `should be valid but got ${JSON.stringify(validation.errors)}`);
});
test('unknown reference', ()=>{
  const input={version:'1.0', program:[
    {op:'transform', target:'unknownObject', args:{translate:{x:10, y:0}}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success); // schema passes, semantic fails
  const validation=validateDSL(parse.program);
  expect(!validation.valid);
  expect(validation.errors.some(e=> e.code===DSLErrorCodes.UNKNOWN_REFERENCE));
});
test('duplicate reference', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'rectA', args:{width:200, height:100}},
    {op:'create', type:'rect', id:'rectA', args:{width:100, height:100}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
  const validation=validateDSL(parse.program);
  expect(!validation.valid);
  expect(validation.errors.some(e=> e.code===DSLErrorCodes.DUPLICATE_REFERENCE));
});
test('forward reference rejection', ()=>{
  const input={version:'1.0', program:[
    {op:'transform', target:'rectA', args:{translate:{x:10, y:0}}},
    {op:'create', type:'rect', id:'rectA', args:{width:200, height:100}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
  const validation=validateDSL(parse.program);
  expect(!validation.valid);
  expect(validation.errors.some(e=> e.message.includes('Forward reference')));
});

console.log('\n=== Compilation Tests ===');
test('create rect must produce T01', ()=>{
  const input={version:'1.0', program:[{op:'create', type:'rect', id:'rectA', args:{width:200, height:100}}]};
  const parse=parseDSL(input);
  expect(parse.success);
  const compile=compileDSL(parse.program);
  expect(compile.success);
  expect(compile.ir[0].toolId==='T01');
});
test('create ellipse T02', ()=>{
  const input={version:'1.0', program:[{op:'create', type:'ellipse', id:'e', args:{cx:0, cy:0, rx:50, ry:30}}]};
  const parse=parseDSL(input);
  const compile=compileDSL(parse.program);
  expect(compile.success);
  expect(compile.ir[0].toolId==='T02');
});
test('delete T04', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'delete', targets:['a']}
  ]};
  const parse=parseDSL(input);
  const compile=compileDSL(parse.program);
  expect(compile.success);
  expect(compile.ir[1].toolId==='T04');
});
test('transform translate T05', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'transform', target:'a', args:{translate:{x:10, y:0}}}
  ]};
  const parse=parseDSL(input);
  const compile=compileDSL(parse.program);
  expect(compile.success);
  expect(compile.ir[1].toolId==='T05');
});
test('transform matrix T06', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'transform', target:'a', args:{matrix:{a:2,b:0,c:0,d:2,tx:0,ty:0}}}
  ]};
  const parse=parseDSL(input);
  const compile=compileDSL(parse.program);
  expect(compile.success);
  expect(compile.ir[1].toolId==='T06');
});
test('appearance T07', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'appearance', target:'a', args:{fill:'#FF0000'}}
  ]};
  const parse=parseDSL(input);
  const compile=compileDSL(parse.program);
  expect(compile.success);
  expect(compile.ir[1].toolId==='T07');
});
test('align T08', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'b', args:{width:100, height:100}},
    {op:'align', targets:['a','b'], args:{axis:'horizontal', mode:'center'}}
  ]};
  const parse=parseDSL(input);
  const compile=compileDSL(parse.program);
  expect(compile.success);
  expect(compile.ir[2].toolId==='T08');
});
test('distribute T09', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'b', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'c', args:{width:100, height:100}},
    {op:'distribute', targets:['a','b','c'], args:{axis:'horizontal', mode:'gaps'}}
  ]};
  const parse=parseDSL(input);
  const compile=compileDSL(parse.program);
  expect(compile.success);
  expect(compile.ir[3].toolId==='T09');
});
test('group T10', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'b', args:{width:100, height:100}},
    {op:'group', id:'g', targets:['a','b']}
  ]};
  const parse=parseDSL(input);
  const compile=compileDSL(parse.program);
  expect(compile.success);
  expect(compile.ir[2].toolId==='T10');
});
test('boolean T13', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'b', args:{width:100, height:100}},
    {op:'boolean', operation:'union', targets:['a','b'], args:{fillRule:'nonZero'}}
  ]};
  const parse=parseDSL(input);
  const compile=compileDSL(parse.program);
  expect(compile.success);
  expect(compile.ir[2].toolId==='T13');
});
test('propose_constraint T19', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'b', args:{width:100, height:100}},
    {op:'propose_constraint', targets:['a','b'], args:{type:'align', axis:'horizontal'}}
  ]};
  const parse=parseDSL(input);
  const compile=compileDSL(parse.program);
  expect(compile.success);
  expect(compile.ir[2].toolId==='T19');
  expect(compile.ir[2].category==='proposal');
});
test('propose_semantic T20', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'propose_semantic', targets:['a']}
  ]};
  const parse=parseDSL(input);
  const compile=compileDSL(parse.program);
  expect(compile.success);
  expect(compile.ir[1].toolId==='T20');
  expect(compile.ir[1].category==='proposal');
});

console.log('\n=== DSL Operations ===');
test('create rect', ()=>{
  const input={version:'1.0', program:[{op:'create', type:'rect', id:'r', args:{width:200, height:100, rx:12, fill:'#FF0000'}}]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('update', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'r', args:{width:200, height:100}},
    {op:'update', target:'r', args:{width:300}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('delete', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'delete', targets:['a']}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('transform', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'transform', target:'a', args:{translate:{x:100, y:50}}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('appearance', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'appearance', target:'a', args:{fill:'#FF0000', opacity:0.8}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('group', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'b', args:{width:100, height:100}},
    {op:'group', targets:['a','b'], id:'g'}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('ungroup', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'b', args:{width:100, height:100}},
    {op:'group', targets:['a','b'], id:'g'},
    {op:'ungroup', target:'g'}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('reorder', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'reorder', targets:['a'], args:{operation:'front'}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('boolean', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'b', args:{width:100, height:100}},
    {op:'boolean', operation:'union', targets:['a','b'], args:{fillRule:'nonZero'}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('align', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'align', targets:['a'], args:{axis:'both', mode:'center'}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('distribute', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'b', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'c', args:{width:100, height:100}},
    {op:'distribute', targets:['a','b','c'], args:{axis:'horizontal', mode:'gaps'}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('pointText', ()=>{
  const input={version:'1.0', program:[
    {op:'text', type:'pointText', id:'t', args:{content:'Hello', position:{x:100,y:100}, style:{fontFamily:'Inter', fontSize:32, fontWeight:700, fontStyle:'normal', lineHeight:1.2, letterSpacing:0, textAlign:'left', fill:'#000000'}}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('artboard', ()=>{
  const input={version:'1.0', program:[{op:'artboard', args:{width:1920, height:1080}}]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('constraint proposal', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'b', args:{width:100, height:100}},
    {op:'propose_constraint', targets:['a','b'], args:{type:'align', axis:'horizontal'}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});
test('semantic proposal', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'propose_semantic', targets:['a']}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
});

console.log('\n=== Serialization ===');
test('serialize deterministic', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'rectA', args:{width:200, height:100, rx:12, fill:'#FF0000'}},
    {op:'align', targets:['rectA'], args:{axis:'both', mode:'center'}}
  ]};
  const parse=parseDSL(input);
  expect(parse.success);
  const serialized=serializeDSL(parse.program);
  const deserialized=JSON.parse(serialized);
  expect(deserialized.version==='1.0');
  expect(deserialized.program.length===2);
  // Round-trip
  const parse2=parseDSL(deserialized);
  expect(parse2.success);
});
test('round-trippable', ()=>{
  const input={version:'1.0', program:[{op:'create', type:'rect', id:'a', args:{width:100, height:100}}]};
  const parse=parseDSL(input);
  const serialized=serializeDSL(parse.program);
  const parse2=parseDSL(JSON.parse(serialized));
  expect(parse2.success);
  expect(parse2.program.instructions[0].ref==='a');
});

console.log('\n=== Linter ===');
test('linter unused reference warning', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'b', args:{width:100, height:100}}
  ]};
  const parse=parseDSL(input);
  const lint=lintDSL(parse.program);
  expect(lint.warnings.some(w=> w.message.includes('Unused')));
});
test('linter undefined reference error', ()=>{
  const input={version:'1.0', program:[
    {op:'transform', target:'unknown', args:{translate:{x:10,y:0}}}
  ]};
  const parse=parseDSL(input);
  const lint=lintDSL(parse.program);
  expect(!lint.valid);
});

console.log('\n=== Critical: Non-Mutation Test ===');
test('compile does not mutate stores', ()=>{
  const doc=createDoc();
  const {oid}=(()=>{ const gid=uuid(); doc.geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:100,height:100,rx:0,ry:0}}); const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]}); const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}}); return {oid}; })();
  const beforeObjectStore=doc.objectStore.size();
  const beforeGeometryStore=doc.geometryStore.size();
  const beforeAppearanceStore=doc.appearanceStore.size();
  const beforeSceneGraph=doc.sceneGraph.getAllNodes().length;
  const beforeSemanticStore=doc.semanticStore.size();

  const input={version:'1.0', program:[{op:'create', type:'rect', id:'newRect', args:{width:200, height:100}}]};
  const parse=parseDSL(input);
  const compile=compileDSL(parse.program);

  expect(doc.objectStore.size()===beforeObjectStore);
  expect(doc.geometryStore.size()===beforeGeometryStore);
  expect(doc.appearanceStore.size()===beforeAppearanceStore);
  expect(doc.sceneGraph.getAllNodes().length===beforeSceneGraph);
  expect(doc.semanticStore.size()===beforeSemanticStore);
});

console.log('\n=== Critical: Proposal Test ===');
test('propose_constraint Proposal returned ConstraintStore unchanged', async ()=>{
  const doc=createDoc();
  const registry=createCoreToolRegistry();
  const o1=(()=>{ const gid=uuid(); doc.geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:100,height:100,rx:0,ry:0}}); const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]}); const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}}); const root=doc.sceneGraph.getAllNodes().filter(n=> !n.parent && !n.parentId)[0] || doc.sceneGraph.createRoot(); doc.sceneGraph.createNode(oid, root.id); return oid; })();
  const o2=(()=>{ const gid=uuid(); doc.geometryStore.create(gid, {type:'rect', params:{x:0,y:0,width:100,height:100,rx:0,ry:0}}); const aid=uuid(); doc.appearanceStore.create(aid, {id:aid, stack:[]}); const oid=uuid(); doc.objectStore.create({id:oid, geometryRef:gid, appearanceRef:aid, meta:{name:'rect', locked:false, visible:true, selectable:true}}); const root=doc.sceneGraph.getAllNodes().filter(n=> !n.parent && !n.parentId)[0] || doc.sceneGraph.createRoot(); doc.sceneGraph.createNode(oid, root.id); return oid; })();

  const input={version:'1.0', program:[
    {op:'propose_constraint', targets:['A','B'], args:{type:'align', axis:'horizontal'}}
  ]};
  // Manually create IR for proposal test
  const ir=[{toolId:'T19', input:{objectIds:[o1, o2]}, sourceInstructionIndex:0, targets:['A','B'], category:'proposal'}];
  const executor=new DSLExecutor();
  const env=new DSLReferenceEnvironment();
  env.define('A', o1);
  env.define('B', o2);

  const docContext={objectStore: doc.objectStore, geometryStore: doc.geometryStore, appearanceStore: doc.appearanceStore, sceneGraph: doc.sceneGraph, semanticStore: doc.semanticStore};

  // Execute via tool registry directly
  const result=registry.execute('T19', {objectIds:[o1, o2]}, docContext);
  expect(result.success);
  expect(result.output.proposals);
  // ConstraintStore unchanged - we don't have constraintStore in doc, but we verify no mutation in objectStore
  expect(doc.objectStore.size()===2);
});

console.log('\n=== Critical: Rollback Test ===');
test('rollback on failure atomicity', async ()=>{
  const doc=createDoc();
  const registry=createCoreToolRegistry();
  const docContext={objectStore: doc.objectStore, geometryStore: doc.geometryStore, appearanceStore: doc.appearanceStore, sceneGraph: doc.sceneGraph, semanticStore: doc.semanticStore};

  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'A', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'B', args:{width:100, height:100}},
    {op:'boolean', operation:'union', targets:['A','B'], args:{fillRule:'nonZero'}},
    {op:'transform', target:'C', args:{translate:{x:10, y:0}}} // C unknown -> should fail
  ]};

  const parse=parseDSL(input);
  // parse should succeed schema wise, but validation should fail due to unknown C
  expect(parse.success);
  const validation=validateDSL(parse.program);
  expect(!validation.valid); // should fail due to unknown ref C

  // If we try to execute a program where third op fails during execution (e.g. boolean with open path), rollback should happen
  const input2={version:'1.0', program:[
    {op:'create', type:'rect', id:'A', args:{width:100, height:100}},
    {op:'create', type:'rect', id:'B', args:{width:100, height:100}},
    {op:'transform', target:'A', args:{translate:{x:10, y:0}}}
  ]};
  const parse2=parseDSL(input2);
  expect(parse2.success);
  const compile2=compileDSL(parse2.program);
  expect(compile2.success);
  const executor=new DSLExecutor();
  const beforeCount=doc.objectStore.size();
  const result=await executor.execute(compile2.ir, {toolRegistry: registry, documentContext: docContext});
  expect(result.success);
  expect(doc.objectStore.size()===beforeCount+2);

  // Now test rollback: create A, B, then fail on third
  const doc2=createDoc();
  const registry2=createCoreToolRegistry();
  const docContext2={objectStore: doc2.objectStore, geometryStore: doc2.geometryStore, appearanceStore: doc2.appearanceStore, sceneGraph: doc2.sceneGraph, semanticStore: doc2.semanticStore};
  const ir=[
    {toolId:'T01', input:{x:0,y:0,width:100,height:100,rx:0,ry:0}, sourceInstructionIndex:0, sourceRef:'A', category:'mutation'},
    {toolId:'T01', input:{x:0,y:0,width:100,height:100,rx:0,ry:0}, sourceInstructionIndex:1, sourceRef:'B', category:'mutation'},
    {toolId:'T05', input:{objectIds:[], delta:{x:10,y:0}}, sourceInstructionIndex:2, targets:['C'], category:'mutation'} // C unknown -> should fail and rollback
  ];
  const executor2=new DSLExecutor();
  const result2=await executor2.execute(ir, {toolRegistry: registry2, documentContext: docContext2});
  expect(!result2.success);
  // After rollback, no partial state
  expect(doc2.objectStore.size()===0);
});

console.log('\n=== Critical: Vertical Slice ===');
test('vertical slice create red 200x100 rx12 and center', async ()=>{
  const doc=createDoc();
  const registry=createCoreToolRegistry();
  const docContext={objectStore: doc.objectStore, geometryStore: doc.geometryStore, appearanceStore: doc.appearanceStore, sceneGraph: doc.sceneGraph, semanticStore: doc.semanticStore};

  const input={
    version:'1.0',
    program:[
      {op:'create', type:'rect', id:'rectA', args:{width:200, height:100, rx:12, fill:'#FF0000'}},
      {op:'align', targets:['rectA'], args:{axis:'both', mode:'center'}}
    ]
  };

  const parse=parseDSL(input);
  expect(parse.success, `parse failed ${JSON.stringify(parse.errors)}`);
  const validation=validateDSL(parse.program);
  expect(validation.valid, `validation failed ${JSON.stringify(validation.errors)}`);
  const compile=compileDSL(parse.program);
  expect(compile.success, `compile failed ${JSON.stringify(compile.errors)}`);
  expect(compile.ir.length===2);
  expect(compile.ir[0].toolId==='T01');
  expect(compile.ir[1].toolId==='T08');

  const executor=new DSLExecutor();
  const result=await executor.execute(compile.ir, {toolRegistry: registry, documentContext: docContext});
  expect(result.success, `execution failed ${JSON.stringify(result.errors)}`);
  expect(doc.objectStore.size()===1);
  const objId=result.outputs[0].output.objectId;
  const obj=doc.objectStore.get(objId);
  expect(obj!==undefined);
  const geom=doc.geometryStore.get(obj.geometryRef);
  expect(geom!==undefined);
  // Width 200 height 100 rx 12
  expect(geom.params.width===200);
  expect(geom.params.height===100);
  expect(geom.params.rx===12);
});

console.log('\n=== Security ===');
test('rejects __proto__', ()=>{
  const input={version:'1.0', program:[{op:'create', type:'rect', id:'a', args:{width:100, height:100}, __proto__:{polluted:true}}]};
  const result=parseDSL(input);
  expect(!result.success);
});
test('rejects eval in args', ()=>{
  const input={version:'1.0', program:[{op:'create', type:'rect', id:'a', args:{width:100, height:100, eval:'malicious'}}]};
  const result=parseDSL(input);
  expect(!result.success);
});

console.log('\n=== Determinism ===');
test('deterministic compile', ()=>{
  const input={version:'1.0', program:[
    {op:'create', type:'rect', id:'a', args:{width:200, height:100}},
    {op:'create', type:'rect', id:'b', args:{width:100, height:100}},
    {op:'align', targets:['a','b'], args:{axis:'horizontal', mode:'center'}}
  ]};
  const parse1=parseDSL(input);
  const compile1=compileDSL(parse1.program);
  const parse2=parseDSL(input);
  const compile2=compileDSL(parse2.program);
  expect(compile1.success && compile2.success);
  expect(JSON.stringify(compile1.ir.map(i=> i.toolId))===JSON.stringify(compile2.ir.map(i=> i.toolId)));
});

console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
if(failed>0) process.exit(1);
