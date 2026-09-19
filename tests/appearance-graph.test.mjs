
import { AppearanceStore, resolveAppearance } from '../src-js/appearance.js';

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

let total=0, passed=0, failed=0;
function test(name, fn){ total++; try{ fn(); passed++; console.log(`✓ ${name}`);}catch(e){ failed++; console.error(`✗ ${name}: ${e.message}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }
function expectThrows(fn){ let threw=false; try{ fn(); }catch{threw=true;} if(!threw) throw new Error('Expected throw'); }

console.log('=== Effect Graph ===');
test('Valid effect input', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const stroke={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:1, cap:'butt', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  const effect={id:'e1', type:'effect', enabled:true, inputs:['f1','s1'], data:{effectType:'blur', parameters:{radius:5}}};
  store.create({id, stack:[fill, stroke, effect]});
  expect(store.get(id).stack.length===3);
});
test('Forward reference rejection', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const effect={id:'e1', type:'effect', enabled:true, inputs:['f1'], data:{effectType:'blur', parameters:{}}};
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  expectThrows(()=>store.create({id, stack:[effect, fill]}));
});
test('Self-reference rejection', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const effect={id:'e1', type:'effect', enabled:true, inputs:['e1'], data:{effectType:'blur', parameters:{}}};
  expectThrows(()=>store.create({id, stack:[effect]}));
});
test('Direct cycle detection', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const e1={id:'e1', type:'effect', enabled:true, inputs:['e2'], data:{effectType:'blur', parameters:{}}};
  const e2={id:'e2', type:'effect', enabled:true, inputs:['e1'], data:{effectType:'blur', parameters:{}}};
  expectThrows(()=>store.create({id, stack:[f1, e1, e2]}));
});
test('Indirect cycle detection via forward ref', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const e4={id:'e4', type:'effect', enabled:true, inputs:['e5'], data:{effectType:'blur', parameters:{}}};
  const e5={id:'e5', type:'effect', enabled:true, inputs:['e4'], data:{effectType:'blur', parameters:{}}};
  expectThrows(()=>store.create({id, stack:[f1,e4,e5]}));
});
test('Missing input rejection', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const effect={id:'e1', type:'effect', enabled:true, inputs:['nonexistent'], data:{effectType:'blur', parameters:{}}};
  expectThrows(()=>store.create({id, stack:[effect]}));
});
test('Duplicate input rejection', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const effect={id:'e1', type:'effect', enabled:true, inputs:['f1','f1'], data:{effectType:'blur', parameters:{}}};
  expectThrows(()=>store.create({id, stack:[f1, effect]}));
});

console.log('\n=== Stack Operations ===');
test('Insert', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  store.create({id, stack:[f1]});
  const s1={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:1, cap:'butt', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  store.addItem(id, s1);
  expect(store.get(id).stack.length===2);
});
test('Remove', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  store.create({id, stack:[f1]});
  store.removeItem(id, 'f1');
  expect(store.get(id).stack.length===0);
});
test('Move', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const s1={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:1, cap:'butt', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  store.create({id, stack:[f1,s1]});
  store.moveItem(id, 'f1', 1);
  expect(store.get(id).stack[0].id==='s1');
});
test('Update', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  store.create({id, stack:[f1]});
  store.updateItem(id, 'f1', {color:{r:0,g:255,b:0,a:1}});
  expect(store.get(id).stack[0].data.color.g===255);
});
test('Enable', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:false, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  store.create({id, stack:[f1]});
  store.enableItem(id, 'f1');
  expect(store.get(id).stack[0].enabled===true);
});
test('Disable', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  store.create({id, stack:[f1]});
  store.disableItem(id, 'f1');
  expect(store.get(id).stack[0].enabled===false);
});
test('Get item', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  store.create({id, stack:[f1]});
  const got=store.getItem(id, 'f1');
  expect(got.id==='f1');
});

console.log('\n=== Dependency ===');
test('Delete input used by Effect', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const e1={id:'e1', type:'effect', enabled:true, inputs:['f1'], data:{effectType:'blur', parameters:{}}};
  store.create({id, stack:[f1,e1]});
  const warnings=store.removeItem(id, 'f1');
  expect(warnings.length===1);
});
test('Effect becomes disabled', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const e1={id:'e1', type:'effect', enabled:true, inputs:['f1'], data:{effectType:'blur', parameters:{}}};
  store.create({id, stack:[f1,e1]});
  store.removeItem(id, 'f1');
  const remaining=store.get(id).stack[0];
  expect(remaining.enabled===false);
});
test('Warning generated', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const e1={id:'e1', type:'effect', enabled:true, inputs:['f1'], data:{effectType:'blur', parameters:{}}};
  store.create({id, stack:[f1,e1]});
  const warnings=store.removeItem(id, 'f1');
  expect(warnings[0].code==='APPEARANCE_INPUT_REMOVED');
});
test('No dangling reference for enabled effects', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const s1={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:1, cap:'butt', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  const e1={id:'e1', type:'effect', enabled:true, inputs:['f1'], data:{effectType:'blur', parameters:{}}};
  store.create({id, stack:[f1,s1,e1]});
  store.removeItem(id, 'f1');
  const items=store.getItems(id);
  const s1After=items.find(it=>it.id==='s1');
  expect(s1After.enabled===true);
});

console.log('\n=== Resolution ===');
test('Resolve fill', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  store.create({id, stack:[f1]});
  const resolved=resolveAppearance(store.get(id));
  expect(resolved.fills.length===1);
});
test('Resolve stroke', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const s1={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:1, cap:'butt', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  store.create({id, stack:[s1]});
  const resolved=resolveAppearance(store.get(id));
  expect(resolved.strokes.length===1);
});
test('Resolve disabled item', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:false, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  store.create({id, stack:[f1]});
  const resolved=resolveAppearance(store.get(id));
  expect(resolved.fills[0].enabled===false);
});
test('Resolve effect graph deterministically', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const e1={id:'e1', type:'effect', enabled:true, inputs:['f1'], data:{effectType:'blur', parameters:{radius:5}}};
  store.create({id, stack:[f1,e1]});
  const r1=resolveAppearance(store.get(id));
  const r2=resolveAppearance(store.get(id));
  expect(JSON.stringify(r1)===JSON.stringify(r2));
});

console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
if(failed>0) process.exit(1);
