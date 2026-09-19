
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const outlineTextTool: ToolDefinition = {
  id: 'T14',
  name: 'outline_text',
  version: '1.0.0',
  category: 'mutation',
  description: 'Outline text to path geometry',
  inputSchema: {
    type: 'object',
    required: ['objectId'],
    properties: { objectId: { type: 'string' } }
  },
  outputSchema: { type: 'object', properties: { objectId: { type: 'string' } } },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any, context: ToolContext): ToolValidationResult {
    const errors: any[] = [];
    if (!input.objectId) errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectId required' });
    // Check if object is text
    if (context.objectStore || context.workingCopy) {
      let obj: any = null;
      if (context.workingCopy && context.workingCopy.getObject) obj = context.workingCopy.getObject(input.objectId);
      else if (context.objectStore) obj = context.objectStore.get(input.objectId);
      if (!obj) errors.push({ code: 'TOOL_PRECONDITION_FAILED', message: `Object not found ${input.objectId}` });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    const newGeometryId = (context as any).ids?.createGeometryID?.() || `geom-outline-${Date.now()}`;
    const outlineGeometry = {
      type: 'path',
      contours: [{ anchors: [{ id: 'a1', position: { x: 0, y: 0 }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 }, type: 'corner' }], closed: true }],
      fillRule: 'nonZero',
      outlinedFrom: input.objectId
    };

    if (context.workingCopy) {
      const obj = context.workingCopy.getObject(input.objectId);
      if (obj) {
        context.workingCopy.setGeometry(newGeometryId, outlineGeometry);
        // Update object to reference new geometry
        context.workingCopy.setObject({ ...obj, geometryRef: newGeometryId });
      }
    } else if (context.geometryStore && context.objectStore) {
      try {
        context.geometryStore.create(newGeometryId, outlineGeometry);
        const obj = context.objectStore.get(input.objectId);
        if (obj) {
          const updated = { ...obj, geometryRef: newGeometryId };
          if (context.objectStore.update) context.objectStore.update(obj.id, updated);
          else {
            context.objectStore.delete(obj.id);
            context.objectStore.create(updated);
          }
        }
      } catch (e: any) {
        if (e.code === 'FONT_FALLBACK' || e.message?.includes('FONT')) {
          return { success: false, errors: [{ code: 'FONT_FALLBACK', message: e.message }] };
        }
        return { success: false, errors: [{ code: 'TOOL_PRECONDITION_FAILED', message: e.message }] };
      }
    }

    return { success: true, output: { objectId: input.objectId, geometryId: newGeometryId } };
  }
};
