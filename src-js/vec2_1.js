
export const TOLERANCE = 1e-9;
export function vec2(x,y){
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Vec2 must be finite: (${x}, ${y})`);
  return {x,y};
}
export function vec(x,y){ return vec2(x,y); }
export function isFiniteVec2(v){
  return v && typeof v==='object' && typeof v.x==='number' && typeof v.y==='number' && Number.isFinite(v.x) && Number.isFinite(v.y);
}
export function add(a,b){ return vec2(a.x+b.x, a.y+b.y); }
export function subtract(a,b){ return vec2(a.x-b.x, a.y-b.y); }
export function multiply(a,s){ return vec2(a.x*s, a.y*s); }
export function divide(a,s){ return vec2(a.x/s, a.y/s); }
export function dot(a,b){ return a.x*b.x + a.y*b.y; }
export function cross(a,b){ return a.x*b.y - a.y*b.x; }
export function lengthSq(v){ return v.x*v.x+v.y*v.y; }
export function length(v){ return Math.sqrt(lengthSq(v)); }
export function distance(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }
export function normalize(v){ const len=length(v); if(len<1e-9) throw new Error('zero'); return divide(v,len); }
export function equals(a,b,tol=1e-9){ return Math.abs(a.x-b.x)<=tol && Math.abs(a.y-b.y)<=tol; }
