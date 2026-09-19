
import { Command } from '../transaction/command.js';
import { createCommandID, ObjectID } from '../ids/index.js';
import { CommandContext } from '../transaction/command-context.js';
import { SemanticData } from './types.js';
import { validateSemanticData } from './validation.js';

export interface CreateSemanticInput {
  data: SemanticData;
}

export interface UpdateSemanticInput {
  objectId: ObjectID;
  data: Partial<SemanticData>;
  mode?: 'replace' | 'merge';
}

export interface DeleteSemanticInput {
  objectId: ObjectID;
}

export function createCreateSemanticCommand(input: CreateSemanticInput): Command {
  return {
    id: createCommandID(),
    toolId: 'create_semantic',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const validation = validateSemanticData(input.data);
      if (!validation.valid) {
        return { success: false, error: `Semantic invalid: ${validation.errors.map(e => e.message).join(', ')}` };
      }
      // Check object existence
      const obj = ctx.workingCopy.getObject(input.data.objectId as any);
      if (!obj) {
        return { success: false, error: `Object not found ${input.data.objectId}` };
      }
      ctx.workingCopy.setSemantic(input.data);
      return { success: true };
    },
    getAffectedIds() {
      return { semantic: [input.data.objectId] as any };
    },
    getInverse(): Command | null {
      return {
        id: createCommandID(),
        toolId: 'delete_semantic',
        input: { objectId: input.data.objectId },
        deterministic: true,
        execute(ctx: CommandContext) {
          ctx.workingCopy.deleteSemantic(input.data.objectId as any);
          return { success: true };
        },
        getAffectedIds() {
          return { semantic: [input.data.objectId] as any };
        }
      } as any;
    }
  };
}

export function createUpdateSemanticCommand(input: UpdateSemanticInput): Command {
  let before: SemanticData | null = null;
  return {
    id: createCommandID(),
    toolId: 'update_semantic',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const existing = ctx.workingCopy.getSemantic(input.objectId as any);
      if (!existing) {
        return { success: false, error: `Semantic not found ${input.objectId}` };
      }
      before = JSON.parse(JSON.stringify(existing));
      const mode = input.mode ?? 'replace';
      let updated: SemanticData;
      if (mode === 'replace') {
        updated = {
          objectId: existing.objectId,
          role: input.data.role ?? existing.role,
          tags: input.data.tags ?? existing.tags,
          confidence: input.data.confidence ?? existing.confidence,
          source: input.data.source ?? existing.source,
          relationships: input.data.relationships ?? existing.relationships,
          updatedAt: Date.now()
        } as SemanticData;
      } else {
        // merge
        const mergedTags = Array.from(new Set([...existing.tags, ...(input.data.tags ?? [])])).sort();
        const mergedRels = [...existing.relationships];
        if (input.data.relationships) {
          for (const rel of input.data.relationships) {
            if (!mergedRels.some(r => r.targetObjectId === rel.targetObjectId && r.type === rel.type)) {
              mergedRels.push(rel);
            }
          }
        }
        mergedRels.sort((a, b) => a.targetObjectId.localeCompare(b.targetObjectId));
        updated = {
          objectId: existing.objectId,
          role: input.data.role ?? existing.role,
          tags: mergedTags,
          confidence: input.data.confidence ?? existing.confidence,
          source: input.data.source ?? existing.source,
          relationships: mergedRels,
          updatedAt: Date.now()
        } as SemanticData;
      }
      const validation = validateSemanticData(updated);
      if (!validation.valid) {
        return { success: false, error: `Semantic invalid: ${validation.errors.map(e => e.message).join(', ')}` };
      }
      ctx.workingCopy.setSemantic(updated);
      return { success: true };
    },
    getAffectedIds() {
      return { semantic: [input.objectId] as any };
    },
    getInverse(): Command | null {
      if (!before) return null;
      return {
        id: createCommandID(),
        toolId: 'update_semantic',
        input: { objectId: input.objectId, data: before, mode: 'replace' },
        deterministic: true,
        execute(ctx: CommandContext) {
          ctx.workingCopy.setSemantic(before!);
          return { success: true };
        },
        getAffectedIds() {
          return { semantic: [input.objectId] as any };
        }
      } as any;
    }
  };
}

export function createDeleteSemanticCommand(input: DeleteSemanticInput): Command {
  let before: SemanticData | null = null;
  return {
    id: createCommandID(),
    toolId: 'delete_semantic',
    input,
    deterministic: true,
    execute(ctx: CommandContext) {
      const existing = ctx.workingCopy.getSemantic(input.objectId as any);
      if (!existing) {
        return { success: false, error: `Semantic not found ${input.objectId}` };
      }
      before = JSON.parse(JSON.stringify(existing));
      ctx.workingCopy.deleteSemantic(input.objectId as any);
      return { success: true };
    },
    getAffectedIds() {
      return { semantic: [input.objectId] as any };
    },
    getInverse(): Command | null {
      if (!before) return null;
      return {
        id: createCommandID(),
        toolId: 'create_semantic',
        input: { data: before },
        deterministic: true,
        execute(ctx: CommandContext) {
          ctx.workingCopy.setSemantic(before!);
          return { success: true };
        },
        getAffectedIds() {
          return { semantic: [before!.objectId] as any };
        }
      } as any;
    }
  };
}
