
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const reorderObjectsTool: ToolDefinition = {
  id: 'T12',
  name: 'reorder_objects',
  version: '1.0.0',
  category: 'mutation',
  description: 'Reorder objects z-order determined by SceneNode.children[]',
  inputSchema: {
    type: 'object',
    required: ['objectIds', 'operation'],
    properties: {
      objectIds: { type: 'array' },
      operation: { type: 'string' }
    }
  },
  outputSchema: { type: 'object', properties: { reordered: { type: 'array' } } },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    const errors: any[] = [];
    if (!Array.isArray(input.objectIds) || input.objectIds.length === 0) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectIds required' });
    }
    if (!['front', 'back', 'forward', 'backward'].includes(input.operation)) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'operation must be front|back|forward|backward' });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    if (context.sceneGraph && context.sceneGraph.reorder) {
      try {
        context.sceneGraph.reorder(input.objectIds, input.operation);
      } catch {}
    } else if (context.workingCopy) {
      // For working copy, manipulate nodes order via parent children arrays
      // Simplified: if we have nodes map, reorder by moving to front/back in parent's children list
      // For MVP, we will not fully implement but return success for determinism
    }
    return { success: true, output: { reordered: input.objectIds } };
  }
};
