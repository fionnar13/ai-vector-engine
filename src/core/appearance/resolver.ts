
import { Appearance, ResolvedAppearance, ResolvedFill, ResolvedStroke, ResolvedEffect } from './types.js';

export function resolveAppearance(appearance: Appearance): ResolvedAppearance {
  const fills: ResolvedFill[] = [];
  const strokes: ResolvedStroke[] = [];
  const effects: ResolvedEffect[] = [];

  // Deterministic order: iterate stack in order
  for (const item of appearance.stack) {
    if (item.type === 'fill') {
      fills.push({
        id: item.id,
        color: item.data.color,
        opacity: item.data.opacity,
        enabled: item.enabled
      });
    } else if (item.type === 'stroke') {
      strokes.push({
        id: item.id,
        color: item.data.color,
        width: item.data.width,
        cap: item.data.cap,
        join: item.data.join,
        miterLimit: item.data.miterLimit,
        alignment: item.data.alignment,
        opacity: item.data.opacity,
        enabled: item.enabled
      });
    } else if (item.type === 'effect') {
      effects.push({
        id: item.id,
        effectType: item.data.effectType,
        parameters: item.data.parameters,
        inputs: item.inputs,
        enabled: item.enabled
      });
    }
  }

  return {
    id: appearance.id,
    fills: Object.freeze(fills) as any,
    strokes: Object.freeze(strokes) as any,
    effects: Object.freeze(effects) as any
  };
}
