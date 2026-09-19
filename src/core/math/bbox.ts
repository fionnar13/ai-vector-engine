
import { Vec2, vec2, isFiniteVec2 } from './vec2.js';
import { Matrix3x3, transformPoint } from './matrix3x3.js';

export type BBox = {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};

export function assertFiniteBBox(b: BBox, ctx?: string): void {
  if (![b.minX,b.minY,b.maxX,b.maxY].every(Number.isFinite)) throw new Error(`BBox not finite ${ctx||''}`);
  if (b.minX > b.maxX + 1e-9 || b.minY > b.maxY + 1e-9) throw new Error(`BBox invalid min>max ${JSON.stringify(b)}`);
}

export function create(minX: number, minY: number, maxX: number, maxY: number): BBox {
  if (![minX,minY,maxX,maxY].every(Number.isFinite)) throw new Error('BBox not finite');
  if (minX > maxX || minY > maxY) throw new Error(`BBox min>max: ${minX},${minY} ${maxX},${maxY}`);
  return { minX, minY, maxX, maxY };
}

export function fromPoints(points: Vec2[]): BBox | null {
  if (points.length===0) return null;
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const p of points) {
    if (!isFiniteVec2(p)) throw new Error('point not finite');
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return create(minX,minY,maxX,maxY);
}

export function width(b: BBox): number { return b.maxX - b.minX; }
export function height(b: BBox): number { return b.maxY - b.minY; }
export function center(b: BBox): Vec2 { return vec2((b.minX+b.maxX)/2, (b.minY+b.maxY)/2); }
export function area(b: BBox): number { return width(b)*height(b); }

export function containsPoint(b: BBox, p: Vec2): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}
export function containsBBox(outer: BBox, inner: BBox): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}
export function intersects(a: BBox, b: BBox): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}
export function union(a: BBox, b: BBox): BBox {
  return create(Math.min(a.minX,b.minX), Math.min(a.minY,b.minY), Math.max(a.maxX,b.maxX), Math.max(a.maxY,b.maxY));
}
export function expand(b: BBox, delta: number): BBox {
  return create(b.minX-delta, b.minY-delta, b.maxX+delta, b.maxY+delta);
}
export function transform(b: BBox, m: Matrix3x3): BBox {
  const p1 = transformPoint(m, vec2(b.minX, b.minY));
  const p2 = transformPoint(m, vec2(b.maxX, b.minY));
  const p3 = transformPoint(m, vec2(b.minX, b.maxY));
  const p4 = transformPoint(m, vec2(b.maxX, b.maxY));
  return fromPoints([p1,p2,p3,p4])!;
}
export function equals(a: BBox, b: BBox, tol=1e-9): boolean {
  return Math.abs(a.minX-b.minX)<=tol && Math.abs(a.minY-b.minY)<=tol && Math.abs(a.maxX-b.maxX)<=tol && Math.abs(a.maxY-b.maxY)<=tol;
}
