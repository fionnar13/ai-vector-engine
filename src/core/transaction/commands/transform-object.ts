
import { Command } from '../command.js';
import { createCommandID } from '../../ids/index.js';
import { CommandContext } from '../command-context.js';
import { multiply, identity } from '../../math/matrix3x3.js';

export function createTransformObjectCommand(input: { objectId: string, matrix: any }): Command {
  return {
    id: createCommandID(),
    toolId: 'transform_object',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      // For MVP, store transform in object meta
      const obj = ctx.workingCopy.getObject(input.objectId as any);
      if (!obj) return { success: false, error: 'Object not found' };
      // In real implementation, this would transform SceneNode localTransform
      // For MVP, we just mark modified
      ctx.workingCopy.setObject({ ...obj } as any);
      return { success: true };
    },
    getAffectedIds() {
      return { objects: [input.objectId] };
    }
  };
}
