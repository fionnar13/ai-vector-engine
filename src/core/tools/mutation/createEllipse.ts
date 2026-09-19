
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const createEllipseTool: ToolDefinition = {
  id: 'T02',
  name: 'create_ellipse',
  version: '1.0.0',
  category: 'mutation',
  description: 'Create an ellipse object with parametric representation',
  inputSchema: {
    type: 'object',
    required: ['cx', 'cy', 'rx', 'ry'],
    properties: {
      cx: { type: 'number' },
      cy: { type: 'number' },
      rx: { type: 'number' },
      ry: { type: 'number' },
      fill: { type: 'object' },
      stroke: { type: 'object' }
    }
  },
  outputSchema: {
    type: 'object',
    required: ['objectId'],
    properties: { objectId: { type: 'string' } }
  },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    const errors: any[] = [];
    for (const k of ['cx', 'cy', 'rx', 'ry']) {
      if (typeof input[k] !== 'number' || !Number.isFinite(input[k])) {
        errors.push({ code: 'VALIDATION_SCHEMA', message: `${k} must be finite number` });
      }
    }
    if (input.rx <= 0 || input.ry <= 0) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'rx and ry must be positive' });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    const geometryId = (context as any).ids?.createGeometryID?.() || `geom-${Date.now()}`;
    const objectId = (context as any).ids?.createObjectID?.() || `obj-${Date.now()}`;
    const appearanceId = (context as any).ids?.createAppearanceID?.() || `app-${Date.now()}`;
    const nodeId = (context as any).ids?.createNodeID?.() || `node-${Date.now()}`;

    const geometry = { type: 'ellipse', params: { cx: input.cx, cy: input.cy, rx: input.rx, ry: input.ry } };

    if (context.workingCopy) {
      const appearance = { id: appearanceId, stack: [] };
      context.workingCopy.setGeometry(geometryId, geometry);
      context.workingCopy.setAppearance(appearance);
      context.workingCopy.setObject({ id: objectId, geometryRef: geometryId, appearanceRef: appearanceId, meta: { name: 'ellipse', locked: false, visible: true, selectable: true } });
      context.workingCopy.setNode({ id: nodeId, objectId, parentId: null, children: [], localTransform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } });
    } else if (context.geometryStore) {
      try { context.geometryStore.create(geometryId, geometry); } catch {}
      try { context.appearanceStore.create({ id: appearanceId, stack: [] }); } catch {}
      context.objectStore.create({ id: objectId, geometryRef: geometryId, appearanceRef: appearanceId, meta: { name: 'ellipse', locked: false, visible: true, selectable: true } });
    }

    return { success: true, output: { objectId, geometryId, nodeId } };
  }
};
