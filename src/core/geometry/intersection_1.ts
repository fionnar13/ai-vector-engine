
import { Vec2, vec2 } from '../math/vec2.js';
import { PathGeometry } from './types.js';
import { flattenPath } from './flatten.js';

export interface Intersection {
  readonly contourA: number;
  readonly contourB: number;
  readonly segmentA: number;
  readonly segmentB: number;
  readonly point: Vec2;
  readonly tA: number;
  readonly tB: number;
}

function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): { intersect: boolean, point?: Vec2, t1?: number, t2?: number } {
  // Line segments p1-p2 and p3-p4
  const denom = (p1.x - p2.x)*(p3.y - p4.y) - (p1.y - p2.y)*(p3.x - p4.x);
  if (Math.abs(denom) < 1e-12) return { intersect: false }; // parallel
  const t = ((p1.x - p3.x)*(p3.y - p4.y) - (p1.y - p3.y)*(p3.x - p4.x)) / denom;
  const u = -((p1.x - p2.x)*(p1.y - p3.y) - (p1.y - p2.y)*(p1.x - p3.x)) / denom;
  if (t>= -1e-9 && t<=1+1e-9 && u>= -1e-9 && u<=1+1e-9) {
    const x = p1.x + t*(p2.x - p1.x);
    const y = p1.y + t*(p2.y - p1.y);
    return { intersect: true, point: vec2(x,y), t1: t, t2: u };
  }
  return { intersect: false };
}

export function detectSelfIntersections(path: PathGeometry, tolerance: number = 0.5): Intersection[] {
  // Flatten and check segment intersections
  const flat = flattenPath(path, tolerance);
  const intersections: Intersection[] = [];
  // For each contour, check against itself and other contours
  const allSegments: { p1: Vec2, p2: Vec2, contourIdx: number, segIdx: number }[] = [];
  for (let ci=0; ci<flat.contours.length; ci++) {
    const contour = flat.contours[ci];
    const segCount = flat.closed[ci] ? contour.length : contour.length-1;
    for (let si=0; si<segCount; si++) {
      const p1 = contour[si] as Vec2;
      const p2 = contour[(si+1)%contour.length] as Vec2;
      allSegments.push({ p1, p2, contourIdx: ci, segIdx: si });
    }
  }
  for (let i=0;i<allSegments.length;i++) {
    for (let j=i+1;j<allSegments.length;j++) {
      const s1 = allSegments[i];
      const s2 = allSegments[j];
      // Skip adjacent segments sharing endpoint
      if (s1.contourIdx===s2.contourIdx) {
        const n = flat.contours[s1.contourIdx].length;
        const isAdjacent = Math.abs(s1.segIdx - s2.segIdx) <=1 || (flat.closed[s1.contourIdx] && ( (s1.segIdx===0 && s2.segIdx===n-1) || (s2.segIdx===0 && s1.segIdx===n-1) ));
        if (isAdjacent) continue;
      }
      const res = segmentsIntersect(s1.p1, s1.p2, s2.p1, s2.p2);
      if (res.intersect && res.point) {
        intersections.push({
          contourA: s1.contourIdx,
          contourB: s2.contourIdx,
          segmentA: s1.segIdx,
          segmentB: s2.segIdx,
          point: res.point,
          tA: res.t1 ?? 0,
          tB: res.t2 ?? 0
        });
      }
    }
  }
  return intersections;
}

export function hasSelfIntersection(path: PathGeometry, tolerance?: number): boolean {
  return detectSelfIntersections(path, tolerance).length > 0;
}
