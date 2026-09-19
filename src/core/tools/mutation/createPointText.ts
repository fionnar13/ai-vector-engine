
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const createPointTextTool: ToolDefinition = {
  id: 'T15',
  name: 'create_point_text',
  version: '1.0.0',
  category: 'mutation',
  description: 'Create point text MVP only no AreaText TextOnPath RichText',
  inputSchema: {
    type: 'object',
    required: ['content', 'position', 'style'],
    properties: {
      content: { type: 'string' },
      position: { type: 'object' },
      style: { type: 'object' }
    }
  },
  outputSchema: { type: 'object', properties: { objectId: { type: 'string' } } },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    const errors: any[] = [];
    if (typeof input.content !== 'string' || input.content.length === 0) errors.push({ code: 'VALIDATION_SCHEMA', message: 'content must be non-empty string' });
    if (!input.position || typeof input.position.x !== 'number' || typeof input.position.y !== 'number' || !Number.isFinite(input.position.x) || !Number.isFinite(input.position.y)) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'position must be finite Vec2' });
    }
    if (!input.style || typeof input.style.fontFamily !== 'string' || typeof input.style.fontSize !== 'number') {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'style must contain fontFamily and fontSize' });
    }
    if (input.style && input.style.fontWeight && ![400, 700].includes(input.style.fontWeight)) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'fontWeight must be 400|700' });
    }
    if (input.style && input.style.fontStyle && !['normal', 'italic'].includes(input.style.fontStyle)) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'fontStyle must be normal|italic' });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    const geometryId = (context as any).ids?.createGeometryID?.() || `geom-text-${Date.now()}`;
    const objectId = (context as any).ids?.createObjectID?.() || `obj-text-${Date.now()}`;
    const appearanceId = (context as any).ids?.createAppearanceID?.() || `app-text-${Date.now()}`;
    const nodeId = (context as any).ids?.createNodeID?.() || `node-text-${Date.now()}`;

    const geometry = {
      type: 'text',
      content: input.content,
      position: input.position,
      style: input.style
    };

    if (context.workingCopy) {
      context.workingCopy.setGeometry(geometryId, geometry);
      context.workingCopy.setAppearance({ id: appearanceId, stack: [{ id: 'fill-1', type: 'fill', enabled: true, data: input.style.fill || { kind: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } } }] });
      context.workingCopy.setObject({ id: objectId, geometryRef: geometryId, appearanceRef: appearanceId, meta: { name: 'text', locked: false, visible: true, selectable: true } });
      context.workingCopy.setNode({ id: nodeId, objectId, parentId: null, children: [], localTransform: { a: 1, b: 0, c: 0, d: 1, tx: input.position.x, ty: input.position.y } });
    } else if (context.geometryStore) {
      try {
        context.geometryStore.create(geometryId, geometry);
        context.appearanceStore.create({ id: appearanceId, stack: [] });
        context.objectStore.create({ id: objectId, geometryRef: geometryId, appearanceRef: appearanceId, meta: { name: 'text', locked: false, visible: true, selectable: true } });
      } catch {}
    }

    return { success: true, output: { objectId, geometryId, nodeId } };
  }
};
