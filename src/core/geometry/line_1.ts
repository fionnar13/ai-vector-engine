
import { LineParams, LineGeometry } from './types.js';
import { createError } from '../errors/index.js';
import { Vec2, vec2 } from '../math/vec2.js';
import { isFiniteVec2 } from '../math/vec2.js';

export function validateLineParams(p: LineParams): void {
  if (!isFiniteVec2(p.start) || !isFiniteVec2(p.end)) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: 'Line points not finite', severity: 'error' });
  }
}

export function createLineGeometry(params: LineParams): LineGeometry {
  validateLineParams(params);
  return { isParametric: true, type: 'line', params: { start: vec2(params.start.x, params.start.y), end: vec2(params.end.x, params.end.y) } };
}

export function lineLength(p: LineParams): number {
  const dx = p.end.x - p.start.x;
  const dy = p.end.y - p.start.y;
  return Math.sqrt(dx*dx+dy*dy);
}

export function lineMidpoint(p: LineParams): Vec2 {
  return vec2((p.start.x + p.end.x)/2, (p.start.y + p.end.y)/2);
}

export function lineBBox(p: LineParams) {
  return { minX: Math.min(p.start.x, p.end.x), minY: Math.min(p.start.y, p.end.y), maxX: Math.max(p.start.x, p.end.x), maxY: Math.max(p.start.y, p.end.y) };
}

export function isDegenerateLine(p: LineParams): boolean {
  return lineLength(p) < 1e-10;
}
