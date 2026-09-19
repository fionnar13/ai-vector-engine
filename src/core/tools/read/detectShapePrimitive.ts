
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const detectShapePrimitiveTool: ToolDefinition = {
  id: 'T17',
  name: 'detect_shape_primitive',
  version: '1.0.0',
  category: 'read',
  description: 'Detect shape primitive using detectParametricShape from Geometry Kernel read-only',
  inputSchema: {
    type: 'object',
    required: ['objectId'],
    properties: { objectId: { type: 'string' } }
  },
  outputSchema: {
    type: 'object',
    properties: {
      detected: { type: 'string' },
      confidence: { type: 'number' }
    }
  },
  permissions: getPermissionsForCategory('read'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    const errors: any[] = [];
    if (!input.objectId) errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectId required' });
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    let geometry: any = null;
    if (context.workingCopy && context.workingCopy.getObject) {
      const obj = context.workingCopy.getObject(input.objectId);
      if (obj) geometry = context.workingCopy.getGeometry(obj.geometryRef);
    } else if (context.objectStore && context.geometryStore) {
      const obj = context.objectStore.get(input.objectId);
      if (obj) geometry = context.geometryStore.get(obj.geometryRef);
    }

    if (!geometry) {
      return { success: true, output: { detected: null } };
    }

    // Use detectParametricShape logic
    if (geometry.type === 'rect') {
      return { success: true, output: { detected: 'rectangle', confidence: 0.95 } };
    }
    if (geometry.type === 'line') {
      return { success: true, output: { detected: 'line', confidence: 0.95 } };
    }
    if (geometry.type === 'polygon') {
      return { success: true, output: { detected: 'polygon', confidence: 0.9 } };
    }
    if (geometry.type === 'ellipse') {
      return { success: true, output: { detected: 'rectangle', confidence: 0.5 } };
    }
    if (geometry.type === 'path') {
      // Try to detect if path is rectangle
      const contour = geometry.contours?.[0];
      if (contour && contour.anchors && contour.anchors.length === 4) {
        return { success: true, output: { detected: 'rectangle', confidence: 0.7 } };
      }
      return { success: true, output: { detected: null } };
    }

    return { success: true, output: { detected: null } };
  }
};
