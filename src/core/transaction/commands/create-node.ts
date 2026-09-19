
import { Command } from '../command.js';
import { createCommandID } from '../../ids/index.js';
import { CommandContext } from '../command-context.js';

export function createCreateNodeCommand(input: { node: any }): Command {
  return {
    id: createCommandID(),
    toolId: 'create_node',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      ctx.workingCopy.setNode(input.node);
      return { success: true };
    },
    getAffectedIds() {
      return { nodes: [input.node.id] };
    },
    getInverse() {
      return {
        id: createCommandID(),
        toolId: 'delete_node',
        input: { nodeId: input.node.id },
        deterministic: true,
        execute(ctx: CommandContext) {
          ctx.workingCopy.deleteNode(input.node.id);
          return { success: true };
        },
        getAffectedIds() {
          return { nodes: [input.node.id] };
        }
      } as any;
    }
  };
}
