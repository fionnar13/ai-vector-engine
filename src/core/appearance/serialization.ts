
import { Appearance } from './types.js';
import { validateAppearance } from './validation.js';

export function serializeAppearance(appearance: Appearance): string {
  // Deterministic serialization: preserve stack order, IDs, etc.
  // No caches
  const obj = {
    id: appearance.id,
    stack: appearance.stack.map(item => ({
      id: item.id,
      type: item.type,
      enabled: item.enabled,
      inputs: item.type === 'effect' ? [...item.inputs] : undefined,
      data: item.data
    }))
  };
  return JSON.stringify(obj);
}

export function deserializeAppearance(json: string): Appearance {
  const parsed = JSON.parse(json);
  if (!parsed.id || !Array.isArray(parsed.stack)) throw new Error('Invalid serialized Appearance');
  const appearance: Appearance = {
    id: parsed.id,
    stack: parsed.stack.map((it: any) => ({
      id: it.id,
      type: it.type,
      enabled: it.enabled,
      inputs: it.inputs,
      data: it.data
    }))
  };
  validateAppearance(appearance);
  return appearance;
}
