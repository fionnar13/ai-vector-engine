
import { FillData, SolidColor } from './types.js';
import { validateSolidColor } from './colors.js';
import { createError } from '../errors/index.js';

export function validateFillData(data: FillData): void {
  if (!data || typeof data !== 'object') throw createError({ code: 'VALIDATION_SCHEMA', message: 'FillData missing', severity: 'error' });
  if (data.kind !== 'solid') throw createError({ code: 'VALIDATION_SCHEMA', message: `Fill kind must be solid, got ${data.kind}`, severity: 'error' });
  validateSolidColor(data.color);
  if (!Number.isFinite(data.opacity) || data.opacity < 0 || data.opacity > 1) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: `Fill opacity out of range [0,1]: ${data.opacity}`, severity: 'error' });
  }
  if (Number.isNaN(data.opacity) || !Number.isFinite(data.opacity)) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Fill opacity NaN/Infinity', severity: 'error' });
}

export function createFillData(color: SolidColor, opacity: number = 1): FillData {
  const data: FillData = { kind: 'solid', color, opacity };
  validateFillData(data);
  return data;
}
