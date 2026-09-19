
import { Command } from '../transaction/command.js';
import { createCommandID, ConstraintID } from '../ids/index.js';
import { CommandContext } from '../transaction/command-context.js';
import { Constraint } from './types.js';
import { validateConstraintSchema } from './validation.js';

export function createCreateConstraintCommand(input: { constraint: Constraint }): Command {
  return {
    id: createCommandID(),
    toolId: 'create_constraint',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const validation = validateConstraintSchema(input.constraint);
      if (!validation.valid) {
        return { success: false, error: `Constraint invalid: ${validation.errors.map(e=>e.message).join(', ')}` };
      }
      // Check object existence via working copy
      for (const oid of input.constraint.objectIds) {
        const obj = ctx.workingCopy.getObject(oid as any);
        if (!obj) {
          return { success: false, error: `Object not found ${oid}` };
        }
      }
      ctx.workingCopy.setConstraint(input.constraint);
      return { success: true };
    },
    getAffectedIds() {
      return { constraints: [input.constraint.id] as any };
    },
    getInverse(): Command | null {
      return {
        id: createCommandID(),
        toolId: 'delete_constraint',
        input: { constraintId: input.constraint.id },
        deterministic: true,
        execute(ctx: CommandContext) {
          ctx.workingCopy.deleteConstraint(input.constraint.id as any);
          return { success: true };
        },
        getAffectedIds() {
          return { constraints: [input.constraint.id] as any };
        }
      } as any;
    }
  };
}

export function createDeleteConstraintCommand(input: { constraintId: ConstraintID }): Command {
  let before: Constraint | null = null;
  return {
    id: createCommandID(),
    toolId: 'delete_constraint',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const existing = ctx.workingCopy.getConstraint(input.constraintId as any);
      if (!existing) return { success: false, error: `Constraint not found ${input.constraintId}` };
      before = JSON.parse(JSON.stringify(existing));
      ctx.workingCopy.deleteConstraint(input.constraintId as any);
      return { success: true };
    },
    getAffectedIds() {
      return { constraints: [input.constraintId] as any };
    },
    getInverse(): Command | null {
      if (!before) return null;
      return {
        id: createCommandID(),
        toolId: 'create_constraint',
        input: { constraint: before },
        deterministic: true,
        execute(ctx: CommandContext) {
          ctx.workingCopy.setConstraint(before!);
          return { success: true };
        },
        getAffectedIds() {
          return { constraints: [before!.id] as any };
        }
      } as any;
    }
  };
}

export function createUpdateConstraintCommand(input: { constraintId: ConstraintID, constraint: Constraint }): Command {
  let before: Constraint | null = null;
  return {
    id: createCommandID(),
    toolId: 'update_constraint',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const existing = ctx.workingCopy.getConstraint(input.constraintId as any);
      if (!existing) return { success: false, error: `Constraint not found ${input.constraintId}` };
      before = JSON.parse(JSON.stringify(existing));
      const validation = validateConstraintSchema(input.constraint);
      if (!validation.valid) {
        return { success: false, error: `Constraint invalid: ${validation.errors.map(e=>e.message).join(', ')}` };
      }
      ctx.workingCopy.setConstraint(input.constraint);
      return { success: true };
    },
    getAffectedIds() {
      return { constraints: [input.constraintId] as any };
    },
    getInverse(): Command | null {
      if (!before) return null;
      return {
        id: createCommandID(),
        toolId: 'update_constraint',
        input: { constraintId: input.constraintId, constraint: before },
        deterministic: true,
        execute(ctx: CommandContext) {
          ctx.workingCopy.setConstraint(before!);
          return { success: true };
        },
        getAffectedIds() {
          return { constraints: [input.constraintId] as any };
        }
      } as any;
    }
  };
}

export function createEnableConstraintCommand(input: { constraintId: ConstraintID }): Command {
  let beforeEnabled: boolean | null = null;
  return {
    id: createCommandID(),
    toolId: 'enable_constraint',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const existing = ctx.workingCopy.getConstraint(input.constraintId as any);
      if (!existing) return { success: false, error: `Constraint not found ${input.constraintId}` };
      beforeEnabled = existing.enabled;
      const updated = { ...existing, enabled: true };
      ctx.workingCopy.setConstraint(updated as any);
      return { success: true };
    },
    getAffectedIds() {
      return { constraints: [input.constraintId] as any };
    },
    getInverse(): Command | null {
      if (beforeEnabled === null) return null;
      return {
        id: createCommandID(),
        toolId: beforeEnabled ? 'enable_constraint' : 'disable_constraint',
        input: { constraintId: input.constraintId },
        deterministic: true,
        execute(ctx: CommandContext) {
          const existing = ctx.workingCopy.getConstraint(input.constraintId as any);
          if (!existing) return { success: false, error: `Constraint not found` };
          ctx.workingCopy.setConstraint({ ...existing, enabled: beforeEnabled! } as any);
          return { success: true };
        },
        getAffectedIds() {
          return { constraints: [input.constraintId] as any };
        }
      } as any;
    }
  };
}

export function createDisableConstraintCommand(input: { constraintId: ConstraintID }): Command {
  let beforeEnabled: boolean | null = null;
  return {
    id: createCommandID(),
    toolId: 'disable_constraint',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const existing = ctx.workingCopy.getConstraint(input.constraintId as any);
      if (!existing) return { success: false, error: `Constraint not found ${input.constraintId}` };
      beforeEnabled = existing.enabled;
      const updated = { ...existing, enabled: false };
      ctx.workingCopy.setConstraint(updated as any);
      return { success: true };
    },
    getAffectedIds() {
      return { constraints: [input.constraintId] as any };
    },
    getInverse(): Command | null {
      if (beforeEnabled === null) return null;
      return {
        id: createCommandID(),
        toolId: beforeEnabled ? 'enable_constraint' : 'disable_constraint',
        input: { constraintId: input.constraintId },
        deterministic: true,
        execute(ctx: CommandContext) {
          const existing = ctx.workingCopy.getConstraint(input.constraintId as any);
          if (!existing) return { success: false, error: `Constraint not found` };
          ctx.workingCopy.setConstraint({ ...existing, enabled: beforeEnabled! } as any);
          return { success: true };
        },
        getAffectedIds() {
          return { constraints: [input.constraintId] as any };
        }
      } as any;
    }
  };
}

export function createApplyConstraintCorrectionsCommand(input: { corrections: { objectId: string, translation: { x: number, y: number } }[] }): Command {
  const beforeTransforms = new Map<string, any>();

  return {
    id: createCommandID(),
    toolId: 'apply_constraint_corrections',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      for (const corr of input.corrections) {
        const node = ctx.workingCopy.getNodeByObjectId ? ctx.workingCopy.getNodeByObjectId(corr.objectId as any) : null;
        if (node) {
          const localTransform = ctx.workingCopy.getNodeLocalTransform ? ctx.workingCopy.getNodeLocalTransform(node.id as any) : (node as any).localTransform;
          if (localTransform) {
            beforeTransforms.set(corr.objectId, { ...localTransform });
            // Need to convert world translation to local if parent exists
            // For MVP, we assume parent world transform is identity or we use helper
            let localTranslation = corr.translation;
            if (ctx.workingCopy.getParentWorldTransform) {
              try {
                const parentWT = ctx.workingCopy.getParentWorldTransform(node.id as any);
                if (parentWT) {
                  const inv = ctx.workingCopy.invertMatrix ? ctx.workingCopy.invertMatrix(parentWT) : null;
                  if (inv) {
                    localTranslation = {
                      x: inv.a * corr.translation.x + inv.c * corr.translation.y,
                      y: inv.b * corr.translation.x + inv.d * corr.translation.y
                    };
                  }
                }
              } catch {}
            }
            const newTransform = {
              ...localTransform,
              tx: localTransform.tx + localTranslation.x,
              ty: localTransform.ty + localTranslation.y
            };
            ctx.workingCopy.setNodeTransform(node.id as any, newTransform);
          }
        } else {
          // Fallback: try to move geometry directly if rect
          const obj = ctx.workingCopy.getObject(corr.objectId as any);
          if (obj) {
            const geomId = (obj as any).geometryRef;
            const geom = ctx.workingCopy.getGeometry(geomId);
            if (geom && (geom as any).params && (geom as any).params.x !== undefined) {
              beforeTransforms.set(corr.objectId, { x: (geom as any).params.x, y: (geom as any).params.y, isGeometry: true, geomId });
              const newGeom = {
                ...geom,
                params: {
                  ...(geom as any).params,
                  x: (geom as any).params.x + corr.translation.x,
                  y: (geom as any).params.y + corr.translation.y
                }
              };
              ctx.workingCopy.setGeometry(geomId, newGeom);
            }
          }
        }
      }
      return { success: true };
    },
    getAffectedIds() {
      return { objects: input.corrections.map(c => c.objectId) as any };
    },
    getInverse(): Command | null {
      return {
        id: createCommandID(),
        toolId: 'apply_constraint_corrections_inverse',
        input: { before: Array.from(beforeTransforms.entries()) },
        deterministic: true,
        execute(ctx: CommandContext) {
          for (const [objectId, before] of beforeTransforms.entries()) {
            if (before.isGeometry) {
              const geom = ctx.workingCopy.getGeometry(before.geomId);
              if (geom) {
                const newGeom = {
                  ...geom,
                  params: {
                    ...(geom as any).params,
                    x: before.x,
                    y: before.y
                  }
                };
                ctx.workingCopy.setGeometry(before.geomId, newGeom);
              }
            } else {
              const node = ctx.workingCopy.getNodeByObjectId ? ctx.workingCopy.getNodeByObjectId(objectId as any) : null;
              if (node) {
                ctx.workingCopy.setNodeTransform(node.id as any, before);
              }
            }
          }
          return { success: true };
        },
        getAffectedIds() {
          return { objects: Array.from(beforeTransforms.keys()) as any };
        }
      } as any;
    }
  };
}
