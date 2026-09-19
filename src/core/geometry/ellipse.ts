
import { EllipseParams, EllipseGeometry } from './types.js';
import { createError } from '../errors/index.js';
import { vec2 } from '../math/vec2.js';

export function validateEllipseParams(p: EllipseParams): void {
  if (![p.cx, p.cy, p.rx, p.ry].every(Number.isFinite)) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: `Ellipse params not finite`, severity: 'error' });
  }
  if (p.rx < -1e-9 || p.ry < -1e-9) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: `Ellipse rx/ry negative`, severity: 'error' });
  }
}

export function createEllipseGeometry(params: EllipseParams): EllipseGeometry {
  validateEllipseParams(params);
  return { isParametric: true, type: 'ellipse', params: { ...params, rx: Math.max(0, params.rx), ry: Math.max(0, params.ry) } };
}

export function isDegenerateEllipse(p: EllipseParams): boolean {
  return p.rx < 1e-10 || p.ry < 1e-10;
}

export function ellipseArea(p: EllipseParams): number {
  return Math.PI * p.rx * p.ry;
}

export function ellipseBBox(p: EllipseParams) {
  return { minX: p.cx - p.rx, minY: p.cy - p.ry, maxX: p.cx + p.rx, maxY: p.cy + p.ry };
}

// Ellipse to cubic Bezier approximation
// Using kappa = 0.5522847498 for circle, for ellipse same factor
// This is approximation, not exact
export const ELLIPSE_KAPPA = 0.5522847498307936;

export function ellipseToPathAnchors(p: EllipseParams) {
  // Returns 4 anchors forming ellipse with cubic bezier
  // Deterministic
  const { cx, cy, rx, ry } = p;
  const k = ELLIPSE_KAPPA;
  // Anchor positions: right, bottom, left, top (clockwise in Y-down: right -> bottom -> left -> top is clockwise? Let's see: Y-down, clockwise is positive.
  // right (cx+rx, cy) -> bottom (cx, cy+ry) -> left (cx-rx, cy) -> top (cx, cy-ry) -> close
  // Handles relative
  // For right point: handleOut = (0, ry*k), handleIn = (0, -ry*k)
  // Actually need to think: standard circle bezier: right point out goes down, in goes up
  // We'll define deterministic:
  // Right: out (0, ry*k), in (0, -ry*k)
  // Bottom: out (-rx*k, 0), in (rx*k, 0)
  // Left: out (0, -ry*k), in (0, ry*k)
  // Top: out (rx*k, 0), in (-rx*k, 0)
  // This creates clockwise in Y-down? Let's test: right->bottom should have out down, in left? Actually bottom in should be from right? Hmm typical.
  // We'll use standard approximation that is symmetric.

  const anchors = [
    { position: vec2(cx + rx, cy), handleIn: vec2(0, -ry * k), handleOut: vec2(0, ry * k), type: 'smooth' as const },
    { position: vec2(cx, cy + ry), handleIn: vec2(rx * k, 0), handleOut: vec2(-rx * k, 0), type: 'smooth' as const },
    { position: vec2(cx - rx, cy), handleIn: vec2(0, ry * k), handleOut: vec2(0, -ry * k), type: 'smooth' as const },
    { position: vec2(cx, cy - ry), handleIn: vec2(-rx * k, 0), handleOut: vec2(rx * k, 0), type: 'smooth' as const },
  ];
  return anchors;
}
