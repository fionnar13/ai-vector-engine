
import { Command } from '../command.js';
import { createCommandID } from '../../ids/index.js';
import { CommandContext } from '../command-context.js';

export function createDeleteObjectCommand(input: { objectId: string }): Command {
  return {
    id: createCommandID(),
    toolId: 'delete_object',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      ctx.workingCopy.deleteObject(input.objectId as any);
      return { success: true };
    },
    getAffectedIds() {
      return { objects: [input.objectId] };
    }
  };
}
