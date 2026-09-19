
import { Command } from '../command.js';
import { createCommandID } from '../../ids/index.js';
import { CommandContext } from '../command-context.js';

export function createUpdateAppearanceCommand(input: { appearanceId: string, appearance: any }): Command {
  let before: any = null;
  return {
    id: createCommandID(),
    toolId: 'update_appearance',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const existing = ctx.workingCopy.getAppearance(input.appearanceId as any);
      before = existing ? JSON.parse(JSON.stringify(existing)) : null;
      ctx.workingCopy.setAppearance(input.appearance);
      return { success: true };
    },
    getAffectedIds() {
      return { appearances: [input.appearanceId] };
    },
    getInverse(): Command | null {
      if (!before) return null;
      return {
        id: createCommandID(),
        toolId: 'update_appearance',
        input: { appearanceId: input.appearanceId, appearance: before },
        deterministic: true,
        execute(ctx: CommandContext) {
          ctx.workingCopy.setAppearance(before);
          return { success: true };
        },
        getAffectedIds() {
          return { appearances: [input.appearanceId] };
        }
      } as any;
    }
  };
}
