
import { Command } from '../command.js';
import { createCommandID } from '../../ids/index.js';
import { CommandContext } from '../command-context.js';

export function createDeleteNodeCommand(input: { nodeId: string }): Command {
  return {
    id: createCommandID(),
    toolId: 'delete_node',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      ctx.workingCopy.deleteNode(input.nodeId as any);
      return { success: true };
    },
    getAffectedIds() {
      return { nodes: [input.nodeId] };
    }
  };
}
