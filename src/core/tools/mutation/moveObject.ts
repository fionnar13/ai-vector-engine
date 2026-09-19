
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';
import { isUUID } from '../../ids/index.js';

export const moveObjectTool: ToolDefinition = {
  id: 'T05',
  name: 'move_object',
  version: '1.0.0',
  category: 'mutation',
  description: 'Move objects by delta preserving geometry semantics updating SceneGraph transform',
  inputSchema: {
    type: 'object',
    required: ['objectIds', 'delta'],
    properties: {
      objectIds: { type: 'array' },
      delta: { type: 'object' }
    }
  },
  outputSchema: { type: 'object', properties: { moved: { type: 'array' } } },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any, context: ToolContext): ToolValidationResult {
    const errors: any[] = [];
    if (!Array.isArray(input.objectIds) || input.objectIds.length === 0) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectIds must be non-empty array' });
    } else {
      for (const id of input.objectIds) {
        if (!isUUID(id)) errors.push({ code: 'VALIDATION_SCHEMA', message: `Invalid ObjectID: ${id}` });
      }
    }
    if (!input.delta || typeof input.delta.x !== 'number' || typeof input.delta.y !== 'number' || !Number.isFinite(input.delta.x) || !Number.isFinite(input.delta.y)) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'delta must be finite Vec2' });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    if (context.workingCopy) {
      for (const oid of input.objectIds) {
        const node = context.workingCopy.getNode ? context.workingCopy.getNode(oid) : null;
        // Actually need to find node by objectId - for simplicity assume node id == object id mapping or find via sceneGraph
        // We will try to find node via workingCopy nodes map values
        let targetNode: any = null;
        if ((context.workingCopy as any).nodes) {
          for (const n of (context.workingCopy as any).nodes.values()) {
            if (n.objectId === oid || n.id === oid) {
              targetNode = n;
              break;
            }
          }
        }
        if (targetNode) {
          const newTransform = { ...targetNode.localTransform, tx: (targetNode.localTransform.tx || 0) + input.delta.x, ty: (targetNode.localTransform.ty || 0) + input.delta.y };
          context.workingCopy.setNode({ ...targetNode, localTransform: newTransform });
        }
      }
      return { success: true, output: { moved: input.objectIds } };
    } else if (context.sceneGraph) {
      for (const oid of input.objectIds) {
        const node = context.sceneGraph.findNodeByObjectId ? context.sceneGraph.findNodeByObjectId(oid) : context.sceneGraph.findNode(oid);
        if (node) {
          const newTransform = { ...node.localTransform, tx: (node.localTransform.tx || 0) + input.delta.x, ty: (node.localTransform.ty || 0) + input.delta.y };
          if (context.sceneGraph.setLocalTransform) {
            context.sceneGraph.setLocalTransform(node.id, newTransform);
          } else if (context.sceneGraph.updateNode) {
            context.sceneGraph.updateNode({ ...node, localTransform: newTransform });
          }
        }
      }
      return { success: true, output: { moved: input.objectIds } };
    }
    return { success: false, errors: [{ code: 'TOOL_PRECONDITION_FAILED', message: 'No sceneGraph' }] };
  }
};
