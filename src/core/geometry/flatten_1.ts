
import { PathGeometry, FlattenedPath, FlattenedPoint } from './types.js';
import { Vec2, vec2 } from '../math/vec2.js';
import { evaluateCubicBezier } from './bezier.js';

export interface FlattenOptions {
  tolerance: number; // max distance from curve to line
  maxDepth?: number; // prevent infinite recursion
}

const DEFAULT_TOLERANCE = 0.5;

function isFlatEnough(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance: number): boolean {
  // Compute distance of control points from line p0-p3
  // Using area method
  const ux = p3.x - p0.x;
  const uy = p3.y - p0.y;
  const len2 = ux*ux + uy*uy;
  if (len2 < 1e-12) {
    // p0==p3, check distance of p1,p2 from p0
    const d1 = Math.hypot(p1.x-p0.x, p1.y-p0.y);
    const d2 = Math.hypot(p2.x-p0.x, p2.y-p0.y);
    return Math.max(d1,d2) <= tolerance;
  }
  // distance from point to line
  function dist2(px: Vec2): number {
    const cross = Math.abs((px.x - p0.x)*uy - (px.y - p0.y)*ux);
    return (cross*cross)/len2;
  }
  const d1 = dist2(p1);
  const d2 = dist2(p2);
  return Math.sqrt(Math.max(d1,d2)) <= tolerance;
}

function subdivideCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): [Vec2,Vec2,Vec2,Vec2,Vec2,Vec2,Vec2,Vec2] {
  // De Casteljau at t=0.5
  const p01 = vec2((p0.x+p1.x)/2, (p0.y+p1.y)/2);
  const p12 = vec2((p1.x+p2.x)/2, (p1.y+p2.y)/2);
  const p23 = vec2((p2.x+p3.x)/2, (p2.y+p3.y)/2);
  const p012 = vec2((p01.x+p12.x)/2, (p01.y+p12.y)/2);
  const p123 = vec2((p12.x+p23.x)/2, (p12.y+p23.y)/2);
  const p0123 = vec2((p012.x+p123.x)/2, (p012.y+p123.y)/2);
  // left: p0, p01, p012, p0123
  // right: p0123, p123, p23, p3
  return [p0, p01, p012, p0123, p0123, p123, p23, p3];
}

function flattenCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance: number, maxDepth: number, depth: number, out: Vec2[]) {
  if (depth >= maxDepth) {
    out.push(p3);
    return;
  }
  if (isFlatEnough(p0,p1,p2,p3,tolerance)) {
    out.push(p3);
  } else {
    const [l0,l1,l2,l3,r0,r1,r2,r3] = subdivideCubic(p0,p1,p2,p3);
    flattenCubic(l0,l1,l2,l3,tolerance,maxDepth,depth+1,out);
    flattenCubic(r0,r1,r2,r3,tolerance,maxDepth,depth+1,out);
  }
}

export function flattenPath(path: PathGeometry, tolerance: number = DEFAULT_TOLERANCE): FlattenedPath {
  if (!Number.isFinite(tolerance) || tolerance <=0) throw new Error(`Invalid flatten tolerance ${tolerance}`);
  const maxDepth = 12; // prevent infinite
  const contours: FlattenedPoint[][] = [];
  const closed: boolean[] = [];
  for (const contour of path.contours) {
    const points: Vec2[] = [];
    if (contour.anchors.length===0) continue;
    points.push(contour.anchors[0].position);
    const n = contour.anchors.length;
    const segCount = contour.closed ? n : n-1;
    for (let i=0;i<segCount;i++) {
      const a0 = contour.anchors[i];
      const a1 = contour.anchors[(i+1)%n];
      const p0 = a0.position;
      const p1 = vec2(a0.position.x + a0.handleOut.x, a0.position.y + a0.handleOut.y);
      const p2 = vec2(a1.position.x + a1.handleIn.x, a1.position.y + a1.handleIn.y);
      const p3 = a1.position;
      const isLine = Math.hypot(a0.handleOut.x, a0.handleOut.y) < 1e-12 && Math.hypot(a1.handleIn.x, a1.handleIn.y) < 1e-12;
      if (isLine) {
        points.push(p3);
      } else {
        const segOut: Vec2[] = [];
        flattenCubic(p0,p1,p2,p3,tolerance,maxDepth,0,segOut);
        for (const pt of segOut) points.push(pt);
      }
    }
    // Convert to FlattenedPoint (plain)
    const flatPoints = points.map(p=>({ x: p.x, y: p.y }));
    contours.push(flatPoints);
    closed.push(contour.closed);
  }
  return { contours, closed };
}
