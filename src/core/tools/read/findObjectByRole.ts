
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const findObjectByRoleTool: ToolDefinition = {
  id: 'T16',
  name: 'find_object_by_role',
  version: '1.0.0',
  category: 'read',
  description: 'Find objects by semantic role read-only no transaction no event',
  inputSchema: {
    type: 'object',
    required: ['role'],
    properties: { role: { type: 'string' } }
  },
  outputSchema: {
    type: 'object',
    required: ['objectIds'],
    properties: { objectIds: { type: 'array' } }
  },
  permissions: getPermissionsForCategory('read'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    const errors: any[] = [];
    if (!input.role || typeof input.role !== 'string') {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'role must be string' });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    if (context.semanticStore) {
      const results = context.semanticStore.getByRole ? context.semanticStore.getByRole(input.role) : context.semanticStore.getAll().filter((d: any) => d.role === input.role);
      const objectIds = results.map((d: any) => d.objectId);
      return { success: true, output: { objectIds } };
    } else if (context.workingCopy && (context.workingCopy as any).getSemantics) {
      const all = Array.from((context.workingCopy as any).semantics.values());
      const filtered = all.filter((d: any) => d.role === input.role);
      return { success: true, output: { objectIds: filtered.map((d: any) => d.objectId) } };
    }
    return { success: true, output: { objectIds: [] } };
  }
};
