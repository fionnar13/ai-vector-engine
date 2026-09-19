
import { SolidColor } from './types.js';
import { createError } from '../errors/index.js';

export function validateSolidColor(color: SolidColor): void {
  if (!color || typeof color !== 'object') throw createError({ code: 'VALIDATION_SCHEMA', message: 'SolidColor missing', severity: 'error' });
  const { r, g, b, a } = color as any;
  for (const [name, val] of [['r', r], ['g', g], ['b', b], ['a', a]] as const) {
    if (!Number.isFinite(val)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Color ${name} not finite: ${val}`, severity: 'error' });
    if (Number.isNaN(val) || !Number.isFinite(val)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Color ${name} NaN/Infinity`, severity: 'error' });
  }
  if (r < 0 || r > 255) throw createError({ code: 'VALIDATION_SCHEMA', message: `Color r out of range [0,255]: ${r}`, severity: 'error' });
  if (g < 0 || g > 255) throw createError({ code: 'VALIDATION_SCHEMA', message: `Color g out of range: ${g}`, severity: 'error' });
  if (b < 0 || b > 255) throw createError({ code: 'VALIDATION_SCHEMA', message: `Color b out of range: ${b}`, severity: 'error' });
  if (a < 0 || a > 1) throw createError({ code: 'VALIDATION_SCHEMA', message: `Color a out of range [0,1]: ${a}`, severity: 'error' });
}

export function createSolidColor(r: number, g: number, b: number, a: number = 1): SolidColor {
  const color = { r, g, b, a } as SolidColor;
  validateSolidColor(color);
  return color;
}

export function solidColorToHex(color: SolidColor): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

// Backward compatibility: hex string to SolidColor
export function hexToSolidColor(hex: string, opacity: number = 1): SolidColor {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid hex color ${hex}`, severity: 'error' });
  const r = parseInt(clean.slice(0,2), 16);
  const g = parseInt(clean.slice(2,4), 16);
  const b = parseInt(clean.slice(4,6), 16);
  return createSolidColor(r,g,b,opacity);
}
