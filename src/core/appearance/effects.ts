
import { EffectData } from './types.js';
import { createError } from '../errors/index.js';

export function validateEffectData(data: EffectData): void {
  if (!data || typeof data !== 'object') throw createError({ code: 'VALIDATION_SCHEMA', message: 'EffectData missing', severity: 'error' });
  if (typeof data.effectType !== 'string' || data.effectType.length === 0) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Effect effectType must be non-empty string', severity: 'error' });
  if (!data.parameters || typeof data.parameters !== 'object') throw createError({ code: 'VALIDATION_SCHEMA', message: 'Effect parameters must be object', severity: 'error' });
  for (const [k,v] of Object.entries(data.parameters)) {
    if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `Effect parameter ${k} must be number|string|boolean`, severity: 'error' });
    }
    if (typeof v === 'number' && !Number.isFinite(v)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Effect param ${k} not finite`, severity: 'error' });
  }
}

export function createEffectData(effectType: string, parameters: Record<string, number | string | boolean> = {}): EffectData {
  const data: EffectData = { effectType, parameters };
  validateEffectData(data);
  return data;
}
