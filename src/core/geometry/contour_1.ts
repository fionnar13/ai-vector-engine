
import { Contour, Anchor, Orientation } from './types.js';
import { Vec2, vec2 } from '../math/vec2.js';
import { createError } from '../errors/index.js';

export function createAnchor(position: Vec2, handleIn: Vec2, handleOut: Vec2, type: Anchor['type']='corner', id?: string): Anchor {
  if (!position || !handleIn || !handleOut) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Anchor invalid', severity: 'error' });
  if (![position.x, position.y, handleIn.x, handleIn.y, handleOut.x, handleOut.y].every(Number.isFinite)) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: 'Anchor not finite', severity: 'error' });
  }
  return {
    id: id ?? `anchor_${Math.random().toString(36).slice(2,9)}`, // will be deterministic in conversion layer, but for manual creation random is ok
    position,
    handleIn,
    handleOut,
    type
  };
}

export function signedAreaOfContour(anchors: readonly Anchor[]): number {
  // Shoelace using anchor positions only (ignores handles for orientation)
  let sum = 0;
  const n = anchors.length;
  if (n < 3) return 0;
  for (let i=0;i<n;i++) {
    const p1 = anchors[i].position;
    const p2 = anchors[(i+1)%n].position;
    sum += (p1.x * p2.y - p2.x * p1.y);
  }
  return sum/2;
}

export function computeOrientation(anchors: readonly Anchor[]): Orientation {
  const area = signedAreaOfContour(anchors);
  if (Math.abs(area) < 1e-10) return 'unknown';
  // In Y-down, positive signed area = cw on screen (as documented in polygon.ts)
  return area > 0 ? 'cw' : 'ccw';
}

export function createContour(anchors: Anchor[], closed: boolean, id?: string, orientation?: Orientation): Contour {
  if (!Array.isArray(anchors) || anchors.length===0) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Contour anchors invalid', severity: 'error' });
  if (closed && anchors.length < 3) {
    // For closed, need at least 3? But allow? We'll warn if <3
    // throw?
  }
  const computed = orientation ?? computeOrientation(anchors);
  return {
    id: id ?? `contour_${Math.random().toString(36).slice(2,9)}`,
    closed,
    anchors: anchors.map(a=>({ ...a })),
    orientation: computed
  };
}

export function isDegenerateContour(contour: Contour): boolean {
  if (contour.anchors.length < 2) return true;
  const area = Math.abs(signedAreaOfContour(contour.anchors));
  if (contour.closed && area < 1e-10) return true;
  // Check all points same?
  const first = contour.anchors[0].position;
  let allSame = true;
  for (const a of contour.anchors) {
    if (Math.hypot(a.position.x-first.x, a.position.y-first.y) > 1e-9) { allSame=false; break; }
  }
  return allSame;
}
