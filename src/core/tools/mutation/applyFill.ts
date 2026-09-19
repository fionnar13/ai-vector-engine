
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const applyFillTool: ToolDefinition = {
  id: 'T07',
  name: 'apply_fill',
  version: '1.0.0',
  category: 'mutation',
  description: 'Apply fill to objects through Appearance system',
  inputSchema: {
    type: 'object',
    required: ['objectIds', 'fill'],
    properties: {
      objectIds: { type: 'array' },
      fill: { type: 'object' }
    }
  },
  outputSchema: { type: 'object', properties: { applied: { type: 'array' } } },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    const errors: any[] = [];
    if (!Array.isArray(input.objectIds) || input.objectIds.length === 0) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectIds required' });
    }
    if (!input.fill || typeof input.fill !== 'object') {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'fill must be object' });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    if (context.workingCopy) {
      for (const oid of input.objectIds) {
        const obj = context.workingCopy.getObject(oid);
        if (!obj) continue;
        const appearance = context.workingCopy.getAppearance(obj.appearanceRef);
        if (!appearance) continue;
        const newStack = appearance.stack.filter((item: any) => item.type !== 'fill');
        newStack.push({ id: `fill-${Date.now()}`, type: 'fill', enabled: true, data: input.fill });
        context.workingCopy.setAppearance({ ...appearance, stack: newStack });
      }
      return { success: true, output: { applied: input.objectIds } };
    } else if (context.appearanceStore && context.objectStore) {
      for (const oid of input.objectIds) {
        const obj = context.objectStore.get(oid);
        if (!obj) continue;
        const app = context.appearanceStore.get(obj.appearanceRef);
        if (!app) continue;
        const newStack = app.stack.filter((i: any) => i.type !== 'fill');
        newStack.push({ id: `fill-${Date.now()}`, type: 'fill', enabled: true, data: input.fill });
        if (context.appearanceStore.update) {
          context.appearanceStore.update(app.id, { ...app, stack: newStack });
        } else {
          // fallback
          try { context.appearanceStore.delete(app.id); } catch {}
          try { context.appearanceStore.create({ ...app, stack: newStack }); } catch {}
        }
      }
      return { success: true, output: { applied: input.objectIds } };
    }
    return { success: false, errors: [{ code: 'TOOL_PRECONDITION_FAILED', message: 'No appearance store' }] };
  }
};
