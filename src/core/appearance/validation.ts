
import { Appearance, AppearanceItem } from './types.js';
import { isUUID } from '../ids/index.js';
import { createError } from '../errors/index.js';
import { validateSolidColor } from './colors.js';
import { validateFillData } from './fill.js';
import { validateStrokeData } from './stroke.js';
import { validateEffectData } from './effects.js';
import { validateAppearanceGraph } from './graph.js';

export function validateAppearance(appearance: Appearance): void {
  if (!appearance || typeof appearance !== 'object') throw createError({ code: 'VALIDATION_SCHEMA', message: 'Appearance missing', severity: 'error' });
  if (!isUUID(appearance.id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid AppearanceID ${appearance.id}`, severity: 'error' });
  if (!Array.isArray(appearance.stack)) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Appearance stack must be array', severity: 'error' });

  const seen = new Set<string>();
  for (const item of appearance.stack) {
    validateAppearanceItem(item, seen);
    seen.add(item.id);
  }

  // Graph validation (forward ref, missing, cycle, duplicate input, self-ref)
  validateAppearanceGraph(appearance);
}

export function validateAppearanceItem(item: AppearanceItem, seenSoFar?: Set<string>): void {
  if (!item || typeof item !== 'object') throw createError({ code: 'VALIDATION_SCHEMA', message: 'AppearanceItem missing', severity: 'error' });
  if (!item.id || typeof item.id !== 'string') throw createError({ code: 'VALIDATION_SCHEMA', message: 'AppearanceItem id invalid', severity: 'error' });
  if (seenSoFar && seenSoFar.has(item.id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Duplicate AppearanceItem ID: ${item.id}`, severity: 'error' });
  if (typeof item.enabled !== 'boolean') throw createError({ code: 'VALIDATION_SCHEMA', message: `AppearanceItem enabled must be boolean for ${item.id}`, severity: 'error' });
  if (item.type !== 'fill' && item.type !== 'stroke' && item.type !== 'effect') {
    throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid AppearanceItem type: ${(item as any).type}`, severity: 'error' });
  }
  if ((item as any).parent !== undefined || (item as any).children !== undefined) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: `AppearanceItem must NOT have parent/children: ${item.id}`, severity: 'error' });
  }
  if (item.type === 'fill') {
    validateFillData((item as any).data);
  } else if (item.type === 'stroke') {
    validateStrokeData((item as any).data);
  } else if (item.type === 'effect') {
    validateEffectData((item as any).data);
    // inputs validated in graph
  }
}
