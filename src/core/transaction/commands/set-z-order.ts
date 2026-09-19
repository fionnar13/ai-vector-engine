
import { Command } from '../command.js';
import { createCommandID } from '../../ids/index.js';
import { CommandContext } from '../command-context.js';

export function createSetZOrderCommand(input: { parentId: string, childId: string, newIndex: number }): Command {
  let oldIndex: number = -1;
  return {
    id: createCommandID(),
    toolId: 'set_z_order',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const parent = ctx.workingCopy.getNode(input.parentId as any);
      if (!parent) return { success: false, error: `Parent not found ${input.parentId}` };
      oldIndex = (parent as any).children.indexOf(input.childId);
      if (oldIndex === -1) return { success: false, error: `Child not found` };

      const children = [...(parent as any).children];
      children.splice(oldIndex, 1);
      children.splice(input.newIndex, 0, input.childId);

      ctx.workingCopy.setNode({ ...parent, children } as any);
      return { success: true };
    },
    getAffectedIds() {
      return { nodes: [input.parentId] };
    },
    getInverse(): Command | null {
      if (oldIndex === -1) return null;
      return {
        id: createCommandID(),
        toolId: 'set_z_order',
        input: { parentId: input.parentId, childId: input.childId, newIndex: oldIndex },
        deterministic: true,
        execute(ctx: CommandContext) {
          const parent = ctx.workingCopy.getNode(input.parentId as any);
          if (!parent) return { success: false, error: 'Parent not found' };
          const children = [...(parent as any).children];
          const currentIndex = children.indexOf(input.childId);
          if (currentIndex === -1) return { success: false, error: 'Child not found' };
          children.splice(currentIndex, 1);
          children.splice(oldIndex, 0, input.childId);
          ctx.workingCopy.setNode({ ...parent, children } as any);
          return { success: true };
        },
        getAffectedIds() {
          return { nodes: [input.parentId] };
        }
      } as any;
    }
  };
}
