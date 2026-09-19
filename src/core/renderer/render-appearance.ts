
import { RenderAppearance } from './types.js';
import { Appearance } from '../appearance/types.js';
import { DiagnosticCodes, createDiagnostic } from './diagnostics.js';
import { RenderDiagnostic } from './types.js';

export function resolveRenderAppearance(appearance: Appearance | undefined, diagnostics: RenderDiagnostic[]): RenderAppearance {
  const result: RenderAppearance = {
    fills: [],
    strokes: [],
    opacity: 1
  };

  if (!appearance) {
    diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_MISSING_APPEARANCE, 'Appearance missing, using default', 'warning'));
    // Safe fallback: no fill, no stroke - will be skipped but not crash
    return result;
  }

  for (const item of appearance.stack || []) {
    if (!item.enabled) continue;

    if (item.type === 'fill') {
      const data = (item as any).data;
      if (data?.kind === 'solid' && data.color) {
        result.fills.push({
          color: data.color,
          opacity: data.opacity ?? 1
        });
      } else {
        diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_UNSUPPORTED_APPEARANCE, `Unsupported fill kind: ${data?.kind}`, 'warning', appearance.id));
      }
    } else if (item.type === 'stroke') {
      const data = (item as any).data;
      if (data?.color) {
        result.strokes.push({
          color: data.color,
          width: data.width ?? 1,
          opacity: data.opacity ?? 1
        });
      } else {
        diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_UNSUPPORTED_APPEARANCE, `Unsupported stroke`, 'warning', appearance.id));
      }
    } else if (item.type === 'effect') {
      diagnostics.push(createDiagnostic(DiagnosticCodes.RENDER_UNSUPPORTED_APPEARANCE, `Effect not supported in MVP: ${item.type}`, 'warning', appearance.id));
    }
  }

  return result;
}
