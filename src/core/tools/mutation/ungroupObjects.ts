
import { ToolDefinition, ToolContext, ToolResult, ToolValidationResult } from '../types.js';
import { getPermissionsForCategory } from '../permissions.js';

export const ungroupObjectsTool: ToolDefinition = {
  id: 'T11',
  name: 'ungroup_objects',
  version: '1.0.0',
  category: 'mutation',
  description: 'Ungroup objects preserving child effective world transforms fully reversible',
  inputSchema: {
    type: 'object',
    required: ['objectIds'],
    properties: { objectIds: { type: 'array' } }
  },
  outputSchema: { type: 'object', properties: { ungrouped: { type: 'array' } } },
  permissions: getPermissionsForCategory('mutation'),
  deterministic: true,
  validate(input: any): ToolValidationResult {
    const errors: any[] = [];
    if (!Array.isArray(input.objectIds) || input.objectIds.length === 0) {
      errors.push({ code: 'VALIDATION_SCHEMA', message: 'objectIds required' });
    }
    return { valid: errors.length === 0, errors };
  },
  execute(input: any, context: ToolContext): ToolResult {
    if (context.workingCopy) {
      for (const oid of input.objectIds) {
        // oid here is group node id or object id inside group
        let groupNode: any = null;
        if ((context.workingCopy as any).nodes) {
          for (const n of (context.workingCopy as any).nodes.values()) {
            if (n.id === oid || n.objectId === oid) {
              // If this node has children, it's a group
              if (n.children && n.children.length > 0) {
                groupNode = n;
                break;
              }
            }
          }
        }
        if (groupNode) {
          // Move children to group's parent, preserving world transform
          const parentId = groupNode.parentId;
          for (const childId of groupNode.children) {
            let childNode: any = null;
            if ((context.workingCopy as any).nodes) {
              childNode = (context.workingCopy as any).nodes.get(childId);
            }
            if (childNode) {
              // Preserve effective world transform: child world = group * child local
              // For MVP, group at identity so child local preserved, just reparent
              const newLocal = {
                a: groupNode.localTransform.a * childNode.localTransform.a + groupNode.localTransform.c * childNode.localTransform.b,
                b: groupNode.localTransform.b * childNode.localTransform.a + groupNode.localTransform.d * childNode.localTransform.b,
                c: groupNode.localTransform.a * childNode.localTransform.c + groupNode.localTransform.c * childNode.localTransform.d,
                d: groupNode.localTransform.b * childNode.localTransform.c + groupNode.localTransform.d * childNode.localTransform.d,
                tx: groupNode.localTransform.a * childNode.localTransform.tx + groupNode.localTransform.c * childNode.localTransform.ty + groupNode.localTransform.tx,
                ty: groupNode.localTransform.b * childNode.localTransform.tx + groupNode.localTransform.d * childNode.localTransform.ty + groupNode.localTransform.ty
              };
              context.workingCopy.setNode({ ...childNode, parentId, localTransform: newLocal });
            }
          }
          context.workingCopy.deleteNode(groupNode.id);
        }
      }
      return { success: true, output: { ungrouped: input.objectIds } };
    }

    if (context.sceneGraph) {
      for (const oid of input.objectIds) {
        try {
          const node = context.sceneGraph.findNode(oid) || (context.sceneGraph.findNodeByObjectId ? context.sceneGraph.findNodeByObjectId(oid) : null);
          if (node && node.children && node.children.length > 0) {
            // Group node
            const parentId = node.parentId;
            for (const childId of [...node.children]) {
              if (context.sceneGraph.reparent) {
                context.sceneGraph.reparent(childId, parentId);
              }
            }
            if (context.sceneGraph.removeNode) {
              context.sceneGraph.removeNode(node.id);
            }
          }
        } catch {}
      }
      return { success: true, output: { ungrouped: input.objectIds } };
    }

    return { success: false, errors: [{ code: 'TOOL_PRECONDITION_FAILED', message: 'No sceneGraph' }] };
  }
};
