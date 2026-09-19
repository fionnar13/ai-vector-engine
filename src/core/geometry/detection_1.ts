
import { PathGeometry, RectParams, EllipseParams, PolygonParams, StarParams, LineParams } from './types.js';
import { vec2 } from '../math/vec2.js';

export type DetectedShape =
  | { type: 'rect', params: RectParams }
  | { type: 'ellipse', params: EllipseParams }
  | { type: 'polygon', params: PolygonParams }
  | { type: 'star', params: StarParams }
  | { type: 'line', params: LineParams }
  | null;

export function detectParametricShape(path: PathGeometry): DetectedShape {
  // Safe failure: return null if not confident
  if (!path.contours || path.contours.length !==1) return null;
  const contour = path.contours[0];
  const anchors = contour.anchors;
  if (anchors.length===0) return null;

  // Detect line: 2 anchors, open
  if (!contour.closed && anchors.length===2) {
    const allCorner = anchors.every(a=> Math.hypot(a.handleIn.x,a.handleIn.y)<1e-9 && Math.hypot(a.handleOut.x,a.handleOut.y)<1e-9);
    if (allCorner) {
      return { type: 'line', params: { start: anchors[0].position, end: anchors[1].position } };
    }
  }

  // Detect rect: 4 anchors, closed, all corner, axis-aligned
  if (contour.closed && anchors.length===4) {
    const allCorner = anchors.every(a=> Math.hypot(a.handleIn.x,a.handleIn.y)<1e-9 && Math.hypot(a.handleOut.x,a.handleOut.y)<1e-9);
    if (allCorner) {
      // Check axis-aligned: points should form rectangle
      const xs = anchors.map(a=>a.position.x);
      const ys = anchors.map(a=>a.position.y);
      const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
      // Count points at corners
      const corners = [
        {x:minX,y:minY}, {x:maxX,y:minY}, {x:maxX,y:maxY}, {x:minX,y:maxY}
      ];
      let matches=0;
      for (const c of corners) {
        if (anchors.some(a=> Math.hypot(a.position.x-c.x, a.position.y-c.y)<1e-6)) matches++;
      }
      if (matches===4) {
        return { type: 'rect', params: { x: minX, y: minY, width: maxX-minX, height: maxY-minY, rx:0, ry:0 } };
      }
    }
  }

  // Detect ellipse: 4 anchors, closed, all smooth, with handles approx kappa
  if (contour.closed && anchors.length===4) {
    const allSmooth = anchors.every(a=> a.type==='smooth' || (Math.hypot(a.handleIn.x,a.handleIn.y)>1e-9 && Math.hypot(a.handleOut.x,a.handleOut.y)>1e-9));
    if (allSmooth) {
      // Compute bbox
      const xs = anchors.map(a=>a.position.x);
      const ys = anchors.map(a=>a.position.y);
      const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
      const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
      const rx=(maxX-minX)/2, ry=(maxY-minY)/2;
      // Check positions are at cardinal points
      const expected = [
        vec2(cx+rx, cy), vec2(cx, cy+ry), vec2(cx-rx, cy), vec2(cx, cy-ry)
      ];
      let ok=true;
      for (const exp of expected) {
        if (!anchors.some(a=> Math.hypot(a.position.x-exp.x, a.position.y-exp.y)<1e-3)) { ok=false; break; }
      }
      if (ok) {
        return { type: 'ellipse', params: { cx, cy, rx, ry } };
      }
    }
  }

  // Detect polygon: closed, all corner, >=3 points, no self-intersection (not checked here)
  if (contour.closed && anchors.length>=3) {
    const allCorner = anchors.every(a=> Math.hypot(a.handleIn.x,a.handleIn.y)<1e-9 && Math.hypot(a.handleOut.x,a.handleOut.y)<1e-9);
    if (allCorner) {
      // Return polygon
      return { type: 'polygon', params: { points: anchors.map(a=>a.position) } };
    }
  }

  // Star detection: would need to check alternating radii - complex, return null for MVP
  return null;
}
