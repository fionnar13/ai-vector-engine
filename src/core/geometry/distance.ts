
import { Vec2, vec2 } from '../math/vec2.js';
import { evaluateCubicBezier } from './bezier.js';

export function distancePointToSegment(point: Vec2, segA: Vec2, segB: Vec2): { distance: number, closest: Vec2, t: number } {
  const abx = segB.x - segA.x;
  const aby = segB.y - segA.y;
  const apx = point.x - segA.x;
  const apy = point.y - segA.y;
  const abLen2 = abx*abx + aby*aby;
  if (abLen2 < 1e-12) {
    return { distance: Math.hypot(apx, apy), closest: segA, t: 0 };
  }
  let t = (apx*abx + apy*aby) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const closest = vec2(segA.x + abx*t, segA.y + aby*t);
  const dx = point.x - closest.x;
  const dy = point.y - closest.y;
  return { distance: Math.sqrt(dx*dx+dy*dy), closest, t };
}

export function distancePointToBezier(point: Vec2, p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, samples: number = 20): { distance: number, closest: Vec2, t: number } {
  // Brute force sampling + refine - deterministic but approximate
  let bestDist = Infinity;
  let bestT = 0;
  let bestPt = p0;
  for (let i=0;i<=samples;i++) {
    const t = i/samples;
    const pt = evaluateCubicBezier(p0,p1,p2,p3,t);
    const dx = point.x - pt.x;
    const dy = point.y - pt.y;
    const d2 = dx*dx+dy*dy;
    if (d2 < bestDist*bestDist) {
      bestDist = Math.sqrt(d2);
      bestT = t;
      bestPt = pt;
    }
  }
  // Refine around bestT
  for (let iter=0; iter<3; iter++) {
    const step = 1/(samples * Math.pow(2, iter+1));
    for (let dt of [-step, step]) {
      const t = Math.max(0, Math.min(1, bestT+dt));
      const pt = evaluateCubicBezier(p0,p1,p2,p3,t);
      const dx = point.x - pt.x;
      const dy = point.y - pt.y;
      const d = Math.sqrt(dx*dx+dy*dy);
      if (d < bestDist) { bestDist=d; bestT=t; bestPt=pt; }
    }
  }
  return { distance: bestDist, closest: bestPt, t: bestT };
}

export function pointOnSegment(point: Vec2, segA: Vec2, segB: Vec2, tolerance: number = 1e-6): boolean {
  const { distance } = distancePointToSegment(point, segA, segB);
  return distance <= tolerance;
}

export function pointInPolygon(point: Vec2, polygon: Vec2[], fillRule: 'nonZero' | 'evenOdd' = 'nonZero'): boolean {
  // Ray casting
  let inside = false;
  const n = polygon.length;
  for (let i=0, j=n-1; i<n; j=i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi)*(point.y - yi)/(yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  // For nonZero, ray casting with winding count would be more accurate, but for MVP evenOdd approximation is ok for simple polygons
  // We'll implement winding count for nonZero
  if (fillRule === 'nonZero') {
    let winding = 0;
    for (let i=0;i<n;i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i+1)%n];
      if (p1.y <= point.y) {
        if (p2.y > point.y && (p2.x - p1.x)*(point.y - p1.y) - (point.x - p1.x)*(p2.y - p1.y) > 0) winding++;
      } else {
        if (p2.y <= point.y && (p2.x - p1.x)*(point.y - p1.y) - (point.x - p1.x)*(p2.y - p1.y) < 0) winding--;
      }
    }
    return winding !== 0;
  }
  return inside;
}
