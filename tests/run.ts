
import { vec2, add, subtract, multiply, dot, cross, length, normalize, distance, equals as vecEquals } from '../src/core/math/vec2.js';
import * as Mat from '../src/core/math/matrix3x3.js';
import * as BBox from '../src/core/math/bbox.js';
import { createObjectID, createGeometryID, isUUID } from '../src/core/ids/index.js';
import { createError } from '../src/core/errors/index.js';
import { EventBus } from '../src/core/events/index.js';
import { assertFinite, assertVec2, assertBBox, assertMatrix, assertUUID } from '../src/core/validation/index.js';

let total=0, passed=0, failed=0;
function test(name: string, fn: () => void) {
  total++;
  try { fn(); passed++; console.log(`✓ ${name}`); } catch (e:any) { failed++; console.error(`✗ ${name}: ${e.message}`); console.error(e.stack); }
}
function expect(cond: boolean, msg?: string) { if (!cond) throw new Error(msg||'expect failed'); }
function expectClose(a: number, b: number, tol=1e-9) { if (Math.abs(a-b)>tol) throw new Error(`Expected ${a} close to ${b}`); }

// Vec2
test('vec2 add', () => { const a=vec2(1,2), b=vec2(3,4); const c=add(a,b); expect(c.x===4 && c.y===6); });
test('vec2 subtract', () => { const c=subtract(vec2(5,5), vec2(2,3)); expect(c.x===3 && c.y===2); });
test('vec2 dot', () => { expect(dot(vec2(1,0), vec2(0,1))===0); expect(dot(vec2(2,3), vec2(4,5))===23); });
test('vec2 cross', () => { expect(cross(vec2(1,0), vec2(0,1))===1); });
test('vec2 distance', () => { expectClose(distance(vec2(0,0), vec2(3,4)),5); });
test('vec2 normalize', () => { const n=normalize(vec2(3,4)); expectClose(n.x,0.6); expectClose(n.y,0.8); });
test('vec2 invalid throws', () => { let threw=false; try{ vec2(NaN,0);}catch{threw=true;} expect(threw); });
test('vec2 normalize zero throws', () => { let threw=false; try{ normalize(vec2(0,0)); }catch{threw=true;} expect(threw); });

// Matrix
test('matrix identity', () => { const m=Mat.identity(); expect(m.a===1 && m.d===1 && m.tx===0); });
test('matrix translation', () => { const m=Mat.translation(10,20); const p=Mat.transformPoint(m, vec2(0,0)); expect(p.x===10 && p.y===20); });
test('matrix scale', () => { const m=Mat.scale(2,3); const p=Mat.transformPoint(m, vec2(1,1)); expect(p.x===2 && p.y===3); });
test('matrix rotation 90', () => { const m=Mat.rotationDegrees(90); const p=Mat.transformPoint(m, vec2(1,0)); expectClose(p.x,0,1e-9); expectClose(p.y,1,1e-9); });
test('matrix multiplication', () => { const t=Mat.translation(10,0); const s=Mat.scale(2); const m=Mat.multiply(t,s); const p=Mat.transformPoint(m, vec2(1,0)); expect(p.x===12 && p.y===0); });
test('matrix inverse', () => { const m=Mat.multiply(Mat.translation(10,20), Mat.scale(2)); const inv=Mat.inverse(m); const id=Mat.multiply(m, inv); expect(Mat.equals(id, Mat.identity(),1e-9)); });
test('matrix singular detection', () => { const m=Mat.scale(0); expect(!Mat.isInvertible(m)); let threw=false; try{ Mat.inverse(m);}catch{threw=true;} expect(threw); });
test('matrix pivot', () => { const pivot=vec2(50,50); const rot=Mat.rotationDegrees(90); const m=Mat.aroundPivot(rot, pivot); const p=Mat.transformPoint(m, vec2(50,50)); expectClose(p.x,50); expectClose(p.y,50); });

// Numeric example from spec
test('numeric example Parent translate(100,50) Child translate(10,10) scale(2) => World [2 0 110; 0 2 60; 0 0 1]', () => {
  const parent = Mat.translation(100,50);
  const childLocal = Mat.multiply(Mat.translation(10,10), Mat.scale(2));
  // World = Parent * ChildLocal
  const world = Mat.multiply(parent, childLocal);
  // Expected [2 0 110; 0 2 60]
  expectClose(world.a,2); expectClose(world.b,0); expectClose(world.c,0); expectClose(world.d,2); expectClose(world.tx,110); expectClose(world.ty,60);
  const localOrigin = vec2(0,0);
  const worldPoint = Mat.transformPoint(world, localOrigin);
  expectClose(worldPoint.x,110); expectClose(worldPoint.y,60);
  // inverse * world ≈ identity
  const inv = Mat.inverse(world);
  const id = Mat.multiply(inv, world);
  expect(Mat.equals(id, Mat.identity(),1e-9));
});

test('matrix aroundPivot preserves pivot', () => {
  const pivot=vec2(100,100);
  const m=Mat.aroundPivot(Mat.scale(2), pivot);
  const p=Mat.transformPoint(m, pivot);
  expectClose(p.x,100); expectClose(p.y,100);
});

// BBox
test('bbox create width height center', () => { const b=BBox.create(0,0,10,20); expect(BBox.width(b)===10); expect(BBox.height(b)===20); const c=BBox.center(b); expect(c.x===5 && c.y===10); });
test('bbox intersection', () => { const a=BBox.create(0,0,10,10); const b=BBox.create(5,5,15,15); expect(BBox.intersects(a,b)); const c=BBox.create(20,20,30,30); expect(!BBox.intersects(a,c)); });
test('bbox union', () => { const a=BBox.create(0,0,10,10); const b=BBox.create(5,5,15,15); const u=BBox.union(a,b); expect(u.minX===0 && u.maxX===15); });
test('bbox contains point', () => { const b=BBox.create(0,0,10,10); expect(BBox.containsPoint(b, vec2(5,5))); expect(!BBox.containsPoint(b, vec2(15,5))); });
test('bbox transform', () => { const b=BBox.create(0,0,10,10); const m=Mat.translation(5,5); const tb=BBox.transform(b,m); expect(tb.minX===5 && tb.minY===5 && tb.maxX===15 && tb.maxY===15); });

// IDs
test('ids valid uuid', () => { const id=createObjectID(); expect(isUUID(id)); });
test('ids uniqueness', () => { const a=createObjectID(); const b=createObjectID(); expect(a!==b); });
test('ids type separation (branded but runtime string)', () => { const obj=createObjectID(); const geo=createGeometryID(); expect(typeof obj==='string' && typeof geo==='string'); expect(isUUID(obj) && isUUID(geo)); });

// Errors
test('error serialization', () => { const err=createError({code:'GEOMETRY_DEGENERATE', message:'degenerate', severity:'warning'}); expect(err.code==='GEOMETRY_DEGENERATE'); const s=JSON.stringify(err); const d=JSON.parse(s); expect(d.code==='GEOMETRY_DEGENERATE'); });

// EventBus
test('eventbus publish subscribe', () => { const bus=new EventBus(); let received=false; bus.subscribe('ObjectCreated', ()=>{received=true;}); bus.publish({source:'system', type:'ObjectCreated', payload:{}}); expect(received); });
test('eventbus unsubscribe', () => { const bus=new EventBus(); let count=0; const unsub=bus.subscribe('ObjectCreated', ()=>{count++;}); unsub(); bus.publish({source:'system', type:'ObjectCreated'}); expect(count===0); });
test('eventbus deterministic ordering', () => { const bus=new EventBus(); const order:string[]=[]; bus.subscribe('ObjectCreated', ()=>order.push('specific')); bus.subscribe('*', ()=>order.push('wildcard')); bus.publish({source:'system', type:'ObjectCreated'}); expect(order[0]==='specific' && order[1]==='wildcard'); });

// Validation
test('validation assertFinite throws on NaN', () => { let threw=false; try{ assertFinite(NaN);}catch{threw=true;} expect(threw); });
test('validation assertVec2', () => { assertVec2(vec2(1,2)); let threw=false; try{ assertVec2({x:NaN,y:0} as any);}catch{threw=true;} expect(threw); });
test('validation assertBBox', () => { assertBBox(BBox.create(0,0,1,1)); let threw=false; try{ assertBBox({minX:1,maxX:0,minY:0,maxY:1} as any);}catch{threw=true;} expect(threw); });
test('validation assertMatrix', () => { assertMatrix(Mat.identity()); });
test('validation assertUUID', () => { const id=createObjectID(); assertUUID(id); let threw=false; try{ assertUUID('not-uuid'); }catch{threw=true;} expect(threw); });

console.log(`\nTests: ${total} total, ${passed} passed, ${failed} failed`);
if (failed>0) process.exit(1);
