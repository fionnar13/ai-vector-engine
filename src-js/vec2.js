
/** @typedef {{x: number, y: number}} Vec2 */

export const TOLERANCE = 1e-9;
/**
 * @param {number} x
 * @param {number} y
 * @returns {Vec2}
 */
export function vec2(x,y){
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Vec2 must be finite: (${x}, ${y})`);
  return {x,y};
}
/**
 * @param {*} v
 * @returns {boolean}
 */
export function isFiniteVec2(v){
  return v && typeof v==='object' && typeof v.x==='number' && typeof v.y==='number' && Number.isFinite(v.x) && Number.isFinite(v.y);
}
/**
 * @param {Vec2} a
 * @param {Vec2} b
 * @returns {Vec2}
 */
export function add(a,b){ return vec2(a.x+b.x, a.y+b.y); }
/**
 * @param {Vec2} a
 * @param {Vec2} b
 * @returns {Vec2}
 */
export function subtract(a,b){ return vec2(a.x-b.x, a.y-b.y); }
/**
 * @param {Vec2} a
 * @param {number} s
 * @returns {Vec2}
 */
export function multiply(a,s){ return vec2(a.x*s, a.y*s); }
/**
 * @param {Vec2} a
 * @param {number} s
 * @returns {Vec2}
 */
export function divide(a,s){ return vec2(a.x/s, a.y/s); }
/**
 * @param {Vec2} a
 * @param {Vec2} b
 * @returns {number}
 */
export function dot(a,b){ return a.x*b.x + a.y*b.y; }
/**
 * @param {Vec2} a
 * @param {Vec2} b
 * @returns {number}
 */
export function cross(a,b){ return a.x*b.y - a.y*b.x; }
/**
 * @param {Vec2} v
 * @returns {number}
 */
export function lengthSq(v){ return v.x*v.x+v.y*v.y; }
/**
 * @param {Vec2} v
 * @returns {number}
 */
export function length(v){ return Math.sqrt(lengthSq(v)); }
/**
 * @param {Vec2} a
 * @param {Vec2} b
 * @returns {number}
 */
export function distance(a,b){ return length(subtract(a,b)); }
/**
 * @param {Vec2} v
 * @returns {Vec2}
 */
export function normalize(v){ const len=length(v); if(len<1e-9) throw new Error('zero'); return divide(v,len); }
/**
 * @param {Vec2} a
 * @param {Vec2} b
 * @param {number} [tol]
 * @returns {boolean}
 */
export function equals(a,b,tol=1e-9){ return Math.abs(a.x-b.x)<=tol && Math.abs(a.y-b.y)<=tol; }
