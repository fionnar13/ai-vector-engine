
import { PathGeometry, Contour, FillRule } from './types.js';
import { createError } from '../errors/index.js';
import { computeOrientation, isDegenerateContour } from './contour.js';

export function createPathGeometry(contours: Contour[], fillRule: FillRule='nonZero'): PathGeometry {
  if (!Array.isArray(contours)) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Contours not array', severity: 'error' });
  if (fillRule !== 'nonZero' && fillRule !== 'evenOdd') throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid fillRule ${fillRule}`, severity: 'error' });
  for (const c of contours) {
    if (!c.anchors || c.anchors.length===0) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Contour empty', severity: 'error' });
  }
  return {
    isParametric: false,
    type: 'path',
    contours: contours.map(c=>({ ...c, anchors: c.anchors.map(a=>({...a})) })),
    fillRule
  };
}

export function pathBBox(path: PathGeometry) {
  // Uses anchor positions + handles? For simplicity use anchor positions + handle extents for BBox? Actually need curve BBox.
  // For now compute from anchors positions only, but in real implementation should use cubicBezierBBox per segment.
  // We'll implement proper version in bbox.ts
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const contour of path.contours) {
    for (const anchor of contour.anchors) {
      minX=Math.min(minX, anchor.position.x);
      minY=Math.min(minY, anchor.position.y);
      maxX=Math.max(maxX, anchor.position.x);
      maxY=Math.max(maxY, anchor.position.y);
      // Also consider handles as they affect curve extents, but actual BBox needs curve extrema
      const pIn = { x: anchor.position.x + anchor.handleIn.x, y: anchor.position.y + anchor.handleIn.y };
      const pOut = { x: anchor.position.x + anchor.handleOut.x, y: anchor.position.y + anchor.handleOut.y };
      minX=Math.min(minX, pIn.x, pOut.x);
      minY=Math.min(minY, pIn.y, pOut.y);
      maxX=Math.max(maxX, pIn.x, pOut.x);
      maxY=Math.max(maxY, pIn.y, pOut.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function isDegeneratePath(path: PathGeometry): boolean {
  if (path.contours.length===0) return true;
  return path.contours.every(isDegenerateContour);
}
