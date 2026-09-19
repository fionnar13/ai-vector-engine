
import { RectParams, RectGeometry } from './types.js';
import { createError } from '../errors/index.js';
import { isFiniteVec2 } from '../math/vec2.js';

export const RECT_TOLERANCE = 1e-9;

export function validateRectParams(p: RectParams): void {
  if (![p.x, p.y, p.width, p.height, p.rx, p.ry].every(Number.isFinite)) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: `Rect params not finite: ${JSON.stringify(p)}`, severity: 'error' });
  }
  if (p.width < 0 || p.height < 0) {
    throw createError({ code: 'GEOMETRY_DEGENERATE', message: `Rect width/height negative: ${p.width},${p.height}`, severity: 'warning', rollbackRequired: false });
  }
  if (p.rx < -RECT_TOLERANCE || p.ry < -RECT_TOLERANCE) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: `Rect rx/ry negative: ${p.rx},${p.ry}`, severity: 'error' });
  }
}

export function normalizeRectParams(p: RectParams): RectParams {
  // Deterministic normalization: clamp rx, ry to half width/height
  // Decision: clamp (not error) for usability, but warn via validation if needed. For canonical, we clamp.
  // Documented: invalid radius clamps during normalization, does not produce error, but validation can detect pre-clamp.
  const maxRx = p.width / 2;
  const maxRy = p.height / 2;
  let rx = Math.max(0, p.rx);
  let ry = Math.max(0, p.ry);
  rx = Math.min(rx, maxRx);
  ry = Math.min(ry, maxRy);
  // If only one radius provided? In our model both are explicit. Keep as is.
  return { x: p.x, y: p.y, width: p.width, height: p.height, rx, ry };
}

export function createRectGeometry(params: RectParams): RectGeometry {
  validateRectParams(params);
  const normalized = normalizeRectParams(params);
  return { isParametric: true, type: 'rect', params: normalized };
}

export function rectBBox(params: RectParams) {
  const { x, y, width, height } = normalizeRectParams(params);
  return { minX: x, minY: y, maxX: x+width, maxY: y+height };
}

export function isDegenerateRect(params: RectParams): boolean {
  const n = normalizeRectParams(params);
  return n.width < 1e-10 || n.height < 1e-10;
}
