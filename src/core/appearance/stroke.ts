
import { StrokeData, SolidColor } from './types.js';
import { validateSolidColor } from './colors.js';
import { createError } from '../errors/index.js';

const VALID_CAPS = new Set(['butt', 'round', 'square']);
const VALID_JOINS = new Set(['miter', 'round', 'bevel']);

export function validateStrokeData(data: StrokeData): void {
  if (!data || typeof data !== 'object') throw createError({ code: 'VALIDATION_SCHEMA', message: 'StrokeData missing', severity: 'error' });
  validateSolidColor(data.color);
  if (!Number.isFinite(data.width) || data.width < 0) throw createError({ code: 'VALIDATION_SCHEMA', message: `Stroke width must be >=0 finite: ${data.width}`, severity: 'error' });
  if (Number.isNaN(data.width)) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Stroke width NaN', severity: 'error' });
  if (!VALID_CAPS.has(data.cap)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid cap ${data.cap}`, severity: 'error' });
  if (!VALID_JOINS.has(data.join)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid join ${data.join}`, severity: 'error' });
  if (!Number.isFinite(data.miterLimit) || data.miterLimit <= 0) throw createError({ code: 'VALIDATION_SCHEMA', message: `miterLimit must be >0: ${data.miterLimit}`, severity: 'error' });
  if (data.alignment !== 'center') throw createError({ code: 'VALIDATION_SCHEMA', message: `Only center alignment supported in MVP, got ${data.alignment}`, severity: 'error' });
  if (!Number.isFinite(data.opacity) || data.opacity < 0 || data.opacity > 1) throw createError({ code: 'VALIDATION_SCHEMA', message: `Stroke opacity out of range [0,1]: ${data.opacity}`, severity: 'error' });
}

export function createStrokeData(
  color: SolidColor,
  width: number,
  cap: 'butt' | 'round' | 'square' = 'butt',
  join: 'miter' | 'round' | 'bevel' = 'miter',
  miterLimit: number = 4,
  alignment: 'center' = 'center',
  opacity: number = 1
): StrokeData {
  const data: StrokeData = { color, width, cap, join, miterLimit, alignment, opacity };
  validateStrokeData(data);
  return data;
}
