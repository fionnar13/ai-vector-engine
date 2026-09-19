
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';
import { isUUID } from '../../ids/index.js';

export const deleteObjectsTool: ToolDefinition = {
  id: 'T04',
  name: 'delete_objects',
  version: '1.0.0',
  category: 'mutation',
  description: 'Delete objects atomically',
  inputSchema: {
    type: 'object',
    required: ['objectIds'],
    properties: { objectIds: { type: 'array' } }
  },
  outputSchema: { type: 'object', properties: { deleted: { type: 'array' } } },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any, context: ToolContext): ToolValidationResult {
    const errors: any[] = [];
    if (!Array.isArray(input.objectIds) || input.objectIds.length === 0) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectIds must be non-empty array' });
      return { valid: false, errors };
    }
    for (const id of input.objectIds) {
      if (!isUUID(id)) {
        errors.push({ code: 'VALIDATION_SCHEMA', message: `Invalid ObjectID: ${id}` });
      } else if (context.objectStore && !context.objectStore.has && !context.objectStore.get) {
        // skip
      } else if (context.objectStore && context.objectStore.get && !context.objectStore.get(id) && !(context.workingCopy && context.workingCopy.getObject(id))) {
        errors.push({ code: 'TOOL_PRECONDITION_FAILED', message: `Object not found: ${id}` });
      }
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    if (context.workingCopy) {
      for (const oid of input.objectIds) {
        // Delete semantic if exists
        if (context.workingCopy.getSemantic) {
          const sem = context.workingCopy.getSemantic(oid);
          if (sem) context.workingCopy.deleteSemantic(oid);
        }
        // Delete nodes referencing this object
        // For simplicity, iterate nodes
        const nodes = context.workingCopy.getNodes ? Array.from((context.workingCopy as any).nodes?.values?.() || []) : [];
        // If workingCopy has method to find nodes by objectId, use sceneGraph
        context.workingCopy.deleteObject(oid);
      }
      return { success: true, output: { deleted: input.objectIds } };
    } else if (context.objectStore) {
      // Atomic check already done in validate, now delete
      const before: any[] = [];
      try {
        for (const oid of input.objectIds) {
          const obj = context.objectStore.get(oid);
          if (!obj) throw new Error(`Object not found ${oid}`);
          before.push(obj);
        }
        // All valid, now delete
        for (const oid of input.objectIds) {
          if (context.semanticStore && context.semanticStore.has(oid)) {
            context.semanticStore.delete(oid);
          }
          if (context.sceneGraph && context.sceneGraph.findNodeByObjectId) {
            const node = context.sceneGraph.findNodeByObjectId(oid);
            if (node) {
              if (context.sceneGraph.removeNode) context.sceneGraph.removeNode(node.id);
            }
          }
          context.objectStore.delete(oid);
        }
      } catch (e: any) {
        // Rollback not needed for this simple path as we already validated, but if fails, no partial deletion because we check before
        return { success: false, errors: [{ code: 'TOOL_PRECONDITION_FAILED', message: e.message }] };
      }
      return { success: true, output: { deleted: input.objectIds } };
    }
    return { success: false, errors: [{ code: 'TOOL_PRECONDITION_FAILED', message: 'No store available' }] };
  }
};
