
import { vec2 } from './vec2.js';
import { transformPoint } from './matrix.js';

/** @typedef {{minX: number, minY: number, maxX: number, maxY: number}} BBox */
/**
 * @param {number} minX
 * @param {number} minY
 * @param {number} maxX
 * @param {number} maxY
 * @returns {BBox}
 */
export function create(minX,minY,maxX,maxY){
  if(minX>maxX||minY>maxY) throw new Error('invalid bbox');
  return {minX,minY,maxX,maxY};
}
/**
 * @param {{x: number, y: number}[]} points
 * @returns {BBox|null}
 */
export function fromPoints(points){
  if(points.length===0) return null;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of points){ minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); }
  return create(minX,minY,maxX,maxY);
}
/**
 * @param {BBox} b
 * @returns {number}
 */
export function width(b){ return b.maxX-b.minX; }
/**
 * @param {BBox} b
 * @returns {number}
 */
export function height(b){ return b.maxY-b.minY; }
/**
 * @param {BBox} b
 * @returns {{x: number, y: number}}
 */
export function center(b){ return vec2((b.minX+b.maxX)/2,(b.minY+b.maxY)/2); }
/**
 * @param {BBox} a
 * @param {BBox} b
 * @returns {boolean}
 */
export function intersects(a,b){ return !(a.maxX<b.minX||a.minX>b.maxX||a.maxY<b.minY||a.minY>b.maxY); }
/**
 * @param {BBox} a
 * @param {BBox} b
 * @returns {BBox}
 */
export function union(a,b){ return create(Math.min(a.minX,b.minX),Math.min(a.minY,b.minY),Math.max(a.maxX,b.maxX),Math.max(a.maxY,b.maxY)); }
/**
 * @param {BBox} b
 * @param {{x: number, y: number}} p
 * @returns {boolean}
 */
export function containsPoint(b,p){ return p.x>=b.minX&&p.x<=b.maxX&&p.y>=b.minY&&p.y<=b.maxY; }
/**
 * @param {BBox} b
 * @param {import('./matrix.js').Matrix2D} m
 * @returns {BBox|null}
 */
export function transform(b,m){
  const p1=transformPoint(m,vec2(b.minX,b.minY));
  const p2=transformPoint(m,vec2(b.maxX,b.minY));
  const p3=transformPoint(m,vec2(b.minX,b.maxY));
  const p4=transformPoint(m,vec2(b.maxX,b.maxY));
  return fromPoints([p1,p2,p3,p4]);
}
