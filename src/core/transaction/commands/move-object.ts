
import { Command } from '../command.js';
import { createCommandID } from '../../ids/index.js';
import { CommandContext } from '../command-context.js';

export function createMoveObjectCommand(input: { objectId: string, dx: number, dy: number }): Command {
  let beforePos: any = null;

  return {
    id: createCommandID(),
    toolId: 'move_object',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      // For MVP, we store move as geometry translation
      // We assume object has geometryRef and we move geometry
      // Actually we move node's localTransform if SceneGraph has it, else we modify geometry's x/y for rect
      const obj = ctx.workingCopy.getObject(input.objectId as any);
      if (!obj) {
        // Try to load from canonical? For working copy we already loaded
        return { success: false, error: `Object not found ${input.objectId}` };
      }

      // For MVP, we store a meta position - we will move geometry if it's rect
      const geomId = (obj as any).geometryRef;
      const geom = ctx.workingCopy.getGeometry(geomId);
      if (geom && (geom as any).params && (geom as any).params.x !== undefined) {
        beforePos = { x: (geom as any).params.x, y: (geom as any).params.y };
        const newGeom = {
          ...geom,
          params: {
            ...(geom as any).params,
            x: (geom as any).params.x + input.dx,
            y: (geom as any).params.y + input.dy
          }
        };
        ctx.workingCopy.setGeometry(geomId, newGeom as any);
      } else {
        // For path, we would need to transform, but for MVP we just track object meta
        beforePos = { dx: 0, dy: 0 };
        // Store move in object meta for test purposes
        const newObj = {
          ...obj,
          meta: {
            ...obj.meta,
            _pos: { x: ((obj as any).meta?._pos?.x || 0) + input.dx, y: ((obj as any).meta?._pos?.y || 0) + input.dy }
          }
        };
        ctx.workingCopy.setObject(newObj as any);
      }

      return { success: true };
    },
    getAffectedIds() {
      return { objects: [input.objectId] };
    },
    getInverse(): Command | null {
      if (!beforePos) return null;
      // Inverse is move by -dx, -dy
      return {
        id: createCommandID(),
        toolId: 'move_object',
        input: { objectId: input.objectId, dx: -input.dx, dy: -input.dy },
        deterministic: true,
        execute(ctx: CommandContext) {
          const obj = ctx.workingCopy.getObject(input.objectId as any);
          if (!obj) return { success: false, error: 'Object not found' };
          const geomId = (obj as any).geometryRef;
          const geom = ctx.workingCopy.getGeometry(geomId);
          if (geom && (geom as any).params && (geom as any).params.x !== undefined) {
            const newGeom = {
              ...geom,
              params: {
                ...(geom as any).params,
                x: (geom as any).params.x - input.dx,
                y: (geom as any).params.y - input.dy
              }
            };
            ctx.workingCopy.setGeometry(geomId, newGeom as any);
          }
          return { success: true };
        },
        getAffectedIds() {
          return { objects: [input.objectId] };
        }
      } as any;
    }
  };
}
