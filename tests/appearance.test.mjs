
import { AppearanceStore, createSolidColor, serializeAppearance, deserializeAppearance, resolveAppearance, computeStrokeBBox } from '../src-js/appearance.js';

function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0; const v=c==='x'?r:(r&0x3|0x8); return v.toString(16);}); }

let total=0, passed=0, failed=0;
function test(name, fn){ total++; try{ fn(); passed++; console.log(`✓ ${name}`);}catch(e){ failed++; console.error(`✗ ${name}: ${e.message}\n${e.stack}`);} }
function expect(c,msg){ if(!c) throw new Error(msg||'expect failed'); }
function expectThrows(fn){ let threw=false; try{ fn(); }catch{threw=true;} if(!threw) throw new Error('Expected throw'); }

console.log('=== Appearance ===');
test('Create empty Appearance', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  store.create({id, stack:[]});
  expect(store.has(id));
});
test('Create Appearance with Fill', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const fill={id:'fill1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  store.create({id, stack:[fill]});
  expect(store.get(id).stack.length===1);
});
test('Create Appearance with Stroke', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const stroke={id:'stroke1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:2, cap:'butt', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  store.create({id, stack:[stroke]});
  expect(store.get(id).stack[0].type==='stroke');
});
test('Create Appearance with Fill + Stroke', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const stroke={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:2, cap:'butt', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  store.create({id, stack:[fill, stroke]});
  expect(store.get(id).stack.length===2);
});
test('Stable AppearanceID', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  store.create({id, stack:[]});
  expect(store.get(id).id===id);
});
test('Item ID uniqueness', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const dup={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:0,g:255,b:0,a:1}, opacity:1}};
  expectThrows(()=>store.create({id, stack:[fill, dup]}));
});
test('Stack ordering', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const s1={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:1, cap:'butt', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  store.create({id, stack:[f1,s1]});
  const got=store.get(id);
  expect(got.stack[0].id==='f1' && got.stack[1].id==='s1');
});

console.log('\n=== Fill ===');
test('Valid RGB', ()=>{
  const c=createSolidColor(255,0,0,1);
  expect(c.r===255);
});
test('Valid alpha', ()=>{
  const c=createSolidColor(0,0,0,0.5);
  expect(c.a===0.5);
});
test('Invalid RGB', ()=>{
  expectThrows(()=>createSolidColor(300,0,0,1));
});
test('Invalid alpha', ()=>{
  expectThrows(()=>createSolidColor(0,0,0,1.5));
});
test('NaN rejection', ()=>{
  expectThrows(()=>createSolidColor(NaN,0,0,1));
});
test('Infinity rejection', ()=>{
  expectThrows(()=>createSolidColor(Infinity,0,0,1));
});

console.log('\n=== Stroke ===');
test('Width validation', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const stroke={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:5, cap:'butt', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  store.create({id, stack:[stroke]});
  expect(store.get(id).stack[0].data.width===5);
});
test('Cap validation', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const stroke={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:1, cap:'round', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  store.create({id, stack:[stroke]});
  expect(store.get(id).stack[0].data.cap==='round');
});
test('Join validation', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const stroke={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:1, cap:'butt', join:'bevel', miterLimit:4, alignment:'center', opacity:1}};
  store.create({id, stack:[stroke]});
});
test('Miter validation', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const stroke={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:1, cap:'butt', join:'miter', miterLimit:2, alignment:'center', opacity:1}};
  store.create({id, stack:[stroke]});
});
test('Center alignment', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const stroke={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:1, cap:'butt', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  store.create({id, stack:[stroke]});
  expect(store.get(id).stack[0].data.alignment==='center');
});
test('Invalid width', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const stroke={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:-1, cap:'butt', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  expectThrows(()=>store.create({id, stack:[stroke]}));
});
test('Invalid miter', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const stroke={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:1, cap:'butt', join:'miter', miterLimit:0, alignment:'center', opacity:1}};
  expectThrows(()=>store.create({id, stack:[stroke]}));
});

console.log('\n=== Opacity ===');
test('Opacity 0', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:0}};
  store.create({id, stack:[fill]});
});
test('Opacity 0.5', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:0.5}};
  store.create({id, stack:[fill]});
});
test('Opacity 1', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  store.create({id, stack:[fill]});
});
test('Reject opacity <0', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:-0.1}};
  expectThrows(()=>store.create({id, stack:[fill]}));
});
test('Reject opacity >1', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1.5}};
  expectThrows(()=>store.create({id, stack:[fill]}));
});
test('Reject opacity NaN', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:NaN}};
  expectThrows(()=>store.create({id, stack:[fill]}));
});

console.log('\n=== Serialization ===');
test('Serialize', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  store.create({id, stack:[fill]});
  const json=serializeAppearance(store.get(id));
  expect(typeof json==='string');
});
test('Deserialize', ()=>{
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const app={id, stack:[fill]};
  const json=serializeAppearance(app);
  const des=deserializeAppearance(json);
  expect(des.id===id);
});
test('Round-trip equality', ()=>{
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const app={id, stack:[fill]};
  const json=serializeAppearance(app);
  const des=deserializeAppearance(json);
  const json2=serializeAppearance(des);
  expect(json===json2);
});
test('Stack ordering preserved', ()=>{
  const id=uuid();
  const f1={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const s1={id:'s1', type:'stroke', enabled:true, data:{color:{r:0,g:0,b:0,a:1}, width:1, cap:'butt', join:'miter', miterLimit:4, alignment:'center', opacity:1}};
  const app={id, stack:[f1,s1]};
  const json=serializeAppearance(app);
  const des=deserializeAppearance(json);
  expect(des.stack[0].id==='f1' && des.stack[1].id==='s1');
});
test('IDs preserved', ()=>{
  const id=uuid();
  const f1={id:'my-fill-id', type:'fill', enabled:true, data:{kind:'solid', color:{r:10,g:20,b:30,a:1}, opacity:0.5}};
  const app={id, stack:[f1]};
  const json=serializeAppearance(app);
  const des=deserializeAppearance(json);
  expect(des.stack[0].id==='my-fill-id');
});

console.log('\n=== Immutability ===');
test('get() cannot mutate canonical state', ()=>{
  const store=new AppearanceStore();
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  store.create({id, stack:[fill]});
  const got=store.get(id);
  got.stack[0].data.color.r=0;
  const got2=store.get(id);
  expect(got2.stack[0].data.color.r===255);
});
test('validation does not mutate', ()=>{
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const app={id, stack:[fill]};
  const before=JSON.stringify(app);
  try{ const store=new AppearanceStore(); store.create(app); }catch{}
  const after=JSON.stringify(app);
  expect(before===after);
});
test('resolution does not mutate', ()=>{
  const id=uuid();
  const fill={id:'f1', type:'fill', enabled:true, data:{kind:'solid', color:{r:255,g:0,b:0,a:1}, opacity:1}};
  const app={id, stack:[fill]};
  const before=JSON.stringify(app);
  resolveAppearance(app);
  const after=JSON.stringify(app);
  expect(before===after);
});

console.log('\n=== Visual BBox ===');
test('StrokeBBox expansion', ()=>{
  const worldBBox={minX:0,minY:0,maxX:100,maxY:50};
  const expanded=computeStrokeBBox(worldBBox, 10);
  expect(expanded.minX===-5 && expanded.maxX===105);
});
test('Zero-width stroke BBox = WorldBBox', ()=>{
  const worldBBox={minX:0,minY:0,maxX:100,maxY:50};
  const expanded=computeStrokeBBox(worldBBox, 0);
  expect(expanded.minX===0 && expanded.maxX===100);
});

console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
if(failed>0) process.exit(1);
