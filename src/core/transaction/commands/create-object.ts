
import { Command } from '../command.js';
import { createCommandID } from '../../ids/index.js';
import { CommandContext } from '../command-context.js';

export function createCreateObjectCommand(input: { object: any }): Command {
  return {
    id: createCommandID(),
    toolId: 'create_object',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const obj = input.object;
      if (!obj || !obj.id) return { success: false, error: 'Object missing id' };
      ctx.workingCopy.setObject(obj);
      return { success: true };
    },
    getAffectedIds() {
      return { objects: [input.object.id] };
    },
    getInverse() {
      return {
        id: createCommandID(),
        toolId: 'delete_object',
        input: { objectId: input.object.id },
        deterministic: true,
        execute(ctx: CommandContext) {
          ctx.workingCopy.deleteObject(input.object.id);
          return { success: true };
        },
        getAffectedIds() {
          return { objects: [input.object.id] };
        }
      } as any;
    }
  };
}
