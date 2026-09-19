
import { Command } from '../command.js';
import { createCommandID } from '../../ids/index.js';
import { CommandContext } from '../command-context.js';

export function createUpdateGeometryCommand(input: { geometryId: string, geometry: any }): Command {
  let before: any = null;
  return {
    id: createCommandID(),
    toolId: 'update_geometry',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const existing = ctx.workingCopy.getGeometry(input.geometryId as any);
      before = existing ? JSON.parse(JSON.stringify(existing)) : null;
      ctx.workingCopy.setGeometry(input.geometryId as any, input.geometry);
      return { success: true };
    },
    getAffectedIds() {
      return { geometries: [input.geometryId] };
    },
    getInverse(): Command | null {
      if (!before) return null;
      return {
        id: createCommandID(),
        toolId: 'update_geometry',
        input: { geometryId: input.geometryId, geometry: before },
        deterministic: true,
        execute(ctx: CommandContext) {
          ctx.workingCopy.setGeometry(input.geometryId as any, before);
          return { success: true };
        },
        getAffectedIds() {
          return { geometries: [input.geometryId] };
        }
      } as any;
    }
  };
}
