
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const createPathTool: ToolDefinition = {
  id: 'T03',
  name: 'create_path',
  version: '1.0.0',
  category: 'mutation',
  description: 'Create a path object',
  inputSchema: {
    type: 'object',
    required: ['contours'],
    properties: {
      contours: { type: 'array' },
      fillRule: { type: 'string' }
    }
  },
  outputSchema: { type: 'object', required: ['objectId'], properties: { objectId: { type: 'string' } } },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    const errors: any[] = [];
    if (!Array.isArray(input.contours) || input.contours.length === 0) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'contours must be non-empty array' });
    } else {
      for (const contour of input.contours) {
        if (!contour.anchors || !Array.isArray(contour.anchors)) {
          errors.push({ code: 'VALIDATION_SCHEMA', message: 'contour anchors must be array' });
        } else {
          for (const anchor of contour.anchors) {
            if (!anchor.position || typeof anchor.position.x !== 'number' || typeof anchor.position.y !== 'number' || !Number.isFinite(anchor.position.x) || !Number.isFinite(anchor.position.y)) {
              errors.push({ code: 'VALIDATION_SCHEMA', message: 'anchor position must be finite' });
            }
          }
        }
      }
    }
    if (input.fillRule && !['nonZero', 'evenOdd'].includes(input.fillRule)) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'invalid fillRule' });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    const geometryId = (context as any).ids?.createGeometryID?.() || `geom-${Date.now()}`;
    const objectId = (context as any).ids?.createObjectID?.() || `obj-${Date.now()}`;
    const appearanceId = (context as any).ids?.createAppearanceID?.() || `app-${Date.now()}`;
    const nodeId = (context as any).ids?.createNodeID?.() || `node-${Date.now()}`;

    const geometry = { type: 'path', contours: input.contours, fillRule: input.fillRule ?? 'nonZero' };

    if (context.workingCopy) {
      context.workingCopy.setGeometry(geometryId, geometry);
      context.workingCopy.setAppearance({ id: appearanceId, stack: [] });
      context.workingCopy.setObject({ id: objectId, geometryRef: geometryId, appearanceRef: appearanceId, meta: { name: 'path', locked: false, visible: true, selectable: true } });
      context.workingCopy.setNode({ id: nodeId, objectId, parentId: null, children: [], localTransform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } });
    } else if (context.geometryStore) {
      try { context.geometryStore.create(geometryId, geometry); } catch {}
      try { context.appearanceStore.create({ id: appearanceId, stack: [] }); } catch {}
      context.objectStore.create({ id: objectId, geometryRef: geometryId, appearanceRef: appearanceId, meta: { name: 'path', locked: false, visible: true, selectable: true } });
    }

    return { success: true, output: { objectId, geometryId, nodeId } };
  }
};
