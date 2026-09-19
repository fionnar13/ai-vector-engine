
import { PathGeometry, Contour } from './types.js';
import { Vec2 } from '../math/vec2.js';
import { cubicBezierBBox } from './bezier.js';

export function contourExactBBox(contour: Contour) {
  // Compute exact BBox using cubic bezier segments between anchors
  if (contour.anchors.length===0) return null;
  if (contour.anchors.length===1) {
    const p = contour.anchors[0].position;
    return { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
  }
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  const n = contour.anchors.length;
  const segCount = contour.closed ? n : n-1;
  for (let i=0;i<segCount;i++) {
    const a0 = contour.anchors[i];
    const a1 = contour.anchors[(i+1)%n];
    const p0 = a0.position;
    const p1 = { x: a0.position.x + a0.handleOut.x, y: a0.position.y + a0.handleOut.y } as Vec2;
    const p2 = { x: a1.position.x + a1.handleIn.x, y: a1.position.y + a1.handleIn.y } as Vec2;
    const p3 = a1.position;
    // If both handles zero, it's line segment
    const isLine = Math.hypot(a0.handleOut.x, a0.handleOut.y) < 1e-12 && Math.hypot(a1.handleIn.x, a1.handleIn.y) < 1e-12;
    if (isLine) {
      minX=Math.min(minX, p0.x, p3.x); minY=Math.min(minY, p0.y, p3.y);
      maxX=Math.max(maxX, p0.x, p3.x); maxY=Math.max(maxY, p0.y, p3.y);
    } else {
      const bb = cubicBezierBBox(p0, p1 as any, p2 as any, p3);
      minX=Math.min(minX, bb.minX); minY=Math.min(minY, bb.minY);
      maxX=Math.max(maxX, bb.maxX); maxY=Math.max(maxY, bb.maxY);
    }
  }
  return { minX, minY, maxX, maxY };
}

export function pathExactBBox(path: PathGeometry) {
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  let has=false;
  for (const contour of path.contours) {
    const bb = contourExactBBox(contour);
    if (!bb) continue;
    has=true;
    minX=Math.min(minX, bb.minX); minY=Math.min(minY, bb.minY);
    maxX=Math.max(maxX, bb.maxX); maxY=Math.max(maxY, bb.maxY);
  }
  if (!has) return null;
  return { minX, minY, maxX, maxY };
}
