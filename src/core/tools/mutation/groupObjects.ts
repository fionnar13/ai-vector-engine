
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const groupObjectsTool: ToolDefinition = {
  id: 'T10',
  name: 'group_objects',
  version: '1.0.0',
  category: 'mutation',
  description: 'Group objects creating SceneGraph group node hierarchy owned only by SceneGraph',
  inputSchema: {
    type: 'object',
    required: ['objectIds'],
    properties: { objectIds: { type: 'array' } }
  },
  outputSchema: { type: 'object', properties: { groupNodeId: { type: 'string' } } },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    const errors: any[] = [];
    if (!Array.isArray(input.objectIds) || input.objectIds.length < 2) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectIds must be >=2' });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    const groupNodeId = (context as any).ids?.createNodeID?.() || `group-${Date.now()}`;

    if (context.workingCopy) {
      // Create group node
      const groupNode = {
        id: groupNodeId,
        objectId: null,
        parentId: null,
        children: [],
        localTransform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
        isGroup: true
      };
      context.workingCopy.setNode(groupNode);

      // Reparent child nodes to group
      for (const oid of input.objectIds) {
        let childNode: any = null;
        if ((context.workingCopy as any).nodes) {
          for (const n of (context.workingCopy as any).nodes.values()) {
            if (n.objectId === oid) { childNode = n; break; }
          }
        }
        if (childNode) {
          // Preserve world transform: group at 0,0 so local = world
          context.workingCopy.setNode({ ...childNode, parentId: groupNodeId });
        }
      }
    } else if (context.sceneGraph) {
      try {
        if (context.sceneGraph.createGroup) {
          const group = context.sceneGraph.createGroup(input.objectIds);
          return { success: true, output: { groupNodeId: group.id } };
        } else if (context.sceneGraph.createNode) {
          const root = context.sceneGraph.getRoots ? context.sceneGraph.getRoots()[0] : null;
          const parentId = root ? root.id : null;
          const groupNode = context.sceneGraph.createNode(null, parentId, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
          // Reparent
          for (const oid of input.objectIds) {
            const node = context.sceneGraph.findNodeByObjectId ? context.sceneGraph.findNodeByObjectId(oid) : null;
            if (node && context.sceneGraph.reparent) {
              context.sceneGraph.reparent(node.id, groupNode.id);
            }
          }
          return { success: true, output: { groupNodeId: groupNode.id } };
        }
      } catch (e: any) {
        return { success: false, errors: [{ code: 'TOOL_PRECONDITION_FAILED', message: e.message }] };
      }
    }

    return { success: true, output: { groupNodeId } };
  }
};
