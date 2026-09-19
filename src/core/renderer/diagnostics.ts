
import { RenderDiagnostic } from './types.js';

export function createDiagnostic(code: string, message: string, severity: 'warning' | 'error' = 'warning', nodeId?: string): RenderDiagnostic {
  return { code, message, severity, nodeId };
}

export const DiagnosticCodes = {
  RENDER_INVALID_GEOMETRY: 'RENDER_INVALID_GEOMETRY',
  RENDER_UNSUPPORTED_APPEARANCE: 'RENDER_UNSUPPORTED_APPEARANCE',
  RENDER_MISSING_OBJECT: 'RENDER_MISSING_OBJECT',
  RENDER_MISSING_GEOMETRY: 'RENDER_MISSING_GEOMETRY',
  RENDER_MISSING_APPEARANCE: 'RENDER_MISSING_APPEARANCE',
  RENDER_INVALID_TRANSFORM: 'RENDER_INVALID_TRANSFORM',
  RENDER_CANVAS_FAILURE: 'RENDER_CANVAS_FAILURE',
  FONT_FALLBACK: 'FONT_FALLBACK'
};
