
import { RenderGeometry } from './types.js';
import { Geometry } from '../geometry/types.js';

export function resolveRenderGeometry(geometry: Geometry): RenderGeometry {
  if (!geometry) {
    return { type: 'unknown', canonicalType: 'unknown' };
  }

  const type = (geometry as any).type;

  switch (type) {
    case 'rect':
      return {
        type: 'rect',
        canonicalType: 'rect',
        params: (geometry as any).params
      };
    case 'ellipse':
      return {
        type: 'ellipse',
        canonicalType: 'ellipse',
        params: (geometry as any).params
      };
    case 'path':
      return {
        type: 'path',
        canonicalType: 'path',
        pathData: (geometry as any)
      };
    case 'polygon':
      return {
        type: 'polygon',
        canonicalType: 'polygon',
        params: (geometry as any).params
      };
    case 'star':
      return {
        type: 'star',
        canonicalType: 'star',
        params: (geometry as any).params
      };
    case 'line':
      return {
        type: 'line',
        canonicalType: 'line',
        params: (geometry as any).params
      };
    case 'text':
    case 'pointText':
      return {
        type: 'text',
        canonicalType: 'text',
        params: (geometry as any).params
      };
    default:
      // For MVP, try to handle as path if it has contours
      if ((geometry as any).contours) {
        return {
          type: 'path',
          canonicalType: type || 'unknown',
          pathData: geometry
        };
      }
      return {
        type: 'unknown',
        canonicalType: type || 'unknown',
        params: (geometry as any).params
      };
  }
}
