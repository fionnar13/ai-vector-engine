
import { PolygonParams, PolygonGeometry } from './types.js';
import { createError } from '../errors/index.js';
import { Vec2, vec2 } from '../math/vec2.js';
import { isFiniteVec2 } from '../math/vec2.js';

export function validatePolygonParams(p: PolygonParams): void {
  if (!Array.isArray(p.points)) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Polygon points not array', severity: 'error' });
  if (p.points.length < 3) throw createError({ code: 'GEOMETRY_DEGENERATE', message: `Polygon needs >=3 points, got ${p.points.length}`, severity: 'warning', rollbackRequired: false });
  for (const pt of p.points) {
    if (!isFiniteVec2(pt)) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Polygon point not finite', severity: 'error' });
  }
  // duplicate detection
  for (let i=0;i<p.points.length;i++) {
    for (let j=i+1;j<p.points.length;j++) {
      const dx = p.points[i].x - p.points[j].x;
      const dy = p.points[i].y - p.points[j].y;
      if (dx*dx+dy*dy < 1e-12) {
        throw createError({ code: 'GEOMETRY_DEGENERATE', message: `Duplicate points in polygon at ${i},${j}`, severity: 'warning', rollbackRequired: false });
      }
    }
  }
}

export function createPolygonGeometry(params: PolygonParams): PolygonGeometry {
  validatePolygonParams(params);
  return { isParametric: true, type: 'polygon', params: { points: params.points.map(pt=>vec2(pt.x, pt.y)) } };
}

export function polygonArea(points: Vec2[]): number {
  // Shoelace formula, Y-down: signed area will be negative for cw? In Y-down, standard shoelace still works but orientation interpretation differs.
  // We'll compute signed area, then absolute for area
  let sum = 0;
  const n = points.length;
  for (let i=0;i<n;i++) {
    const p1 = points[i];
    const p2 = points[(i+1)%n];
    sum += (p1.x * p2.y - p2.x * p1.y);
  }
  return Math.abs(sum)/2;
}

export function polygonSignedArea(points: Vec2[]): number {
  let sum = 0;
  const n = points.length;
  for (let i=0;i<n;i++) {
    const p1 = points[i];
    const p2 = points[(i+1)%n];
    sum += (p1.x * p2.y - p2.x * p1.y);
  }
  return sum/2;
}

export function polygonOrientation(points: Vec2[]): 'cw' | 'ccw' | 'unknown' {
  const signed = polygonSignedArea(points);
  if (Math.abs(signed) < 1e-10) return 'unknown';
  // In Y-down coordinate system: standard math with Y-up, positive signed area = CCW.
  // With Y-down, Y is flipped, so sign flips: positive signed area in Y-down corresponds to CW in screen?
  // Let's define: In Y-down, we want orientation relative to screen.
  // Standard shoelace with Y-down: if points go clockwise on screen, signed area is negative? Let's test: square (0,0)->(10,0)->(10,10)->(0,10) in Y-down: this is clockwise? In Y-down, (0,0) top-left, (10,0) top-right, (10,10) bottom-right, (0,10) bottom-left -> going around clockwise is actually (0,0)->(10,0)->(10,10)->(0,10) which is clockwise on screen.
  // Compute signed area: (0*0 -10*0)=0, (10*10 -10*0)=100, (10*10 -0*10)=100, (0*0 -0*10)=0 => sum=200/2=100 positive.
  // So in Y-down, positive signed area = cw on screen. We'll document this.
  // So: signed >0 => cw, signed <0 => ccw in Y-down screen coordinates.
  return signed > 0 ? 'cw' : 'ccw';
}

export function polygonBBox(points: Vec2[]) {
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const p of points) {
    minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y);
  }
  return { minX, minY, maxX, maxY };
}
