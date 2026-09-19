
import { Geometry, PathGeometry, FillRule } from './types.js';
import { createError } from '../errors/index.js';
import { isFiniteVec2 } from '../math/vec2.js';
import { isDegenerateContour } from './contour.js';

export function validateFillRule(rule: string): void {
  if (rule !== 'nonZero' && rule !== 'evenOdd') {
    throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid fillRule ${rule}`, severity: 'error' });
  }
}

export function validatePathGeometry(path: PathGeometry): void {
  if (!path.contours) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Path contours missing', severity: 'error' });
  validateFillRule(path.fillRule);
  for (const contour of path.contours) {
    if (!contour.anchors) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Contour anchors missing', severity: 'error' });
    if (contour.anchors.length===0) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Contour empty', severity: 'error' });
    for (const anchor of contour.anchors) {
      if (!isFiniteVec2(anchor.position)) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Anchor position not finite', severity: 'error' });
      if (!isFiniteVec2(anchor.handleIn) || !isFiniteVec2(anchor.handleOut)) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Anchor handle not finite', severity: 'error' });
    }
  }
}

export function checkDegenerate(path: PathGeometry): boolean {
  if (path.contours.length===0) return true;
  return path.contours.every(isDegenerateContour);
}

export function validateGeometry(geom: Geometry): void {
  if (geom.type === 'path') {
    validatePathGeometry(geom as PathGeometry);
  } else {
    // parametric validation done in creation
    // check finite handled elsewhere
  }
}
