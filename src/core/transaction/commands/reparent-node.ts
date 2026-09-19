
import { Command } from '../command.js';
import { createCommandID } from '../../ids/index.js';
import { CommandContext } from '../command-context.js';

export function createReparentNodeCommand(input: { nodeId: string, newParentId: string | null }): Command {
  let oldParentId: string | null = null;
  return {
    id: createCommandID(),
    toolId: 'reparent_node',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const node = ctx.workingCopy.getNode(input.nodeId as any);
      if (!node) return { success: false, error: `Node not found ${input.nodeId}` };
      oldParentId = (node as any).parent;

      const newNode = { ...node, parent: input.newParentId };
      ctx.workingCopy.setNode(newNode as any);

      // Also need to update old parent's children and new parent's children
      if (oldParentId) {
        const oldParent = ctx.workingCopy.getNode(oldParentId as any);
        if (oldParent) {
          const newChildren = (oldParent as any).children.filter((c: string) => c !== input.nodeId);
          ctx.workingCopy.setNode({ ...oldParent, children: newChildren } as any);
        }
      }

      if (input.newParentId) {
        const newParent = ctx.workingCopy.getNode(input.newParentId as any);
        if (newParent) {
          const newChildren = [...(newParent as any).children, input.nodeId];
          ctx.workingCopy.setNode({ ...newParent, children: newChildren } as any);
        }
      }

      return { success: true };
    },
    getAffectedIds() {
      const ids = [input.nodeId];
      if (oldParentId) ids.push(oldParentId);
      if (input.newParentId) ids.push(input.newParentId);
      return { nodes: ids };
    },
    getInverse(): Command | null {
      if (oldParentId === undefined) return null;
      return {
        id: createCommandID(),
        toolId: 'reparent_node',
        input: { nodeId: input.nodeId, newParentId: oldParentId },
        deterministic: true,
        execute(ctx: CommandContext) {
          const node = ctx.workingCopy.getNode(input.nodeId as any);
          if (!node) return { success: false, error: 'Node not found' };
          const newNode = { ...node, parent: oldParentId };
          ctx.workingCopy.setNode(newNode as any);
          return { success: true };
        },
        getAffectedIds() {
          return { nodes: [input.nodeId] };
        }
      } as any;
    }
  };
}
