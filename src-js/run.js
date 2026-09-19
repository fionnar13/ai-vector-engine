
import { vec2, add, subtract, dot, cross, length, normalize, equals } from './vec2.js';
import * as Mat from './matrix.js';
import * as BBox from './bbox.js';

let total=0, passed=0, failed=0;
function test(name,fn){ total++; try{ fn(); passed++; console.log('✓ '+name);}catch(e){ failed++; console.error('✗ '+name+': '+e.message); } }
function expect(c){ if(!c) throw new Error('expect failed'); }
function expectClose(a,b,tol=1e-9){ if(Math.abs(a-b)>tol) throw new Error(`${a} not close to ${b}`); }

test('vec2 add', ()=>{ const c=add(vec2(1,2), vec2(3,4)); expect(c.x===4&&c.y===6); });
test('vec2 distance', ()=>{ const d=Math.sqrt((3*3+4*4)); const p=vec2(0,0); const q=vec2(3,4); const dist=Math.hypot(3,4); expectClose(dist,5); });
test('matrix numeric example', ()=>{
  const parent=Mat.translation(100,50);
  const childLocal=Mat.multiply(Mat.translation(10,10), Mat.scale(2));
  const world=Mat.multiply(parent, childLocal);
  expectClose(world.a,2); expectClose(world.b,0); expectClose(world.c,0); expectClose(world.d,2); expectClose(world.tx,110); expectClose(world.ty,60);
  const wp=Mat.transformPoint(world, vec2(0,0));
  expectClose(wp.x,110); expectClose(wp.y,60);
  const inv=Mat.inverse(world);
  const id=Mat.multiply(inv,world);
  expect(Mat.equals(id, Mat.identity(),1e-9));
});
test('bbox union', ()=>{ const a=BBox.create(0,0,10,10); const b=BBox.create(5,5,15,15); const u=BBox.union(a,b); expect(u.minX===0&&u.maxX===15); });
console.log(`Tests: ${total} total, ${passed} passed, ${failed} failed`);
