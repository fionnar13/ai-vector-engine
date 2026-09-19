
import { DSLProgram, ToolIR, ExecutionResult, DSLError, DSLReferenceEnvironment } from './types.js';
import { DSLErrorCodes, createError } from './errors.js';
import { compileDSL } from './compiler.js';
import { DSLReferenceEnvironment as RefEnv } from './references.js';

export interface DSLExecutorContext {
  toolRegistry: any;
  documentContext: any;
}

export class DSLExecutor {
  validate(program: DSLProgram) {
    // Import dynamically to avoid circular
    const { validateDSL } = require('./validator.js');
    return validateDSL(program);
  }

  compile(program: DSLProgram) {
    return compileDSL(program);
  }

  async execute(ir: ToolIR[], context: DSLExecutorContext): Promise<ExecutionResult> {
    const errors: DSLError[] = [];
    const warnings: DSLError[] = [];
    const outputs: any[] = [];

    const env = new (RefEnv as any)() as DSLReferenceEnvironment;
    // Track defined refs -> objectIds

    // For atomicity, we will collect all tool executions and if any fails, rollback
    // For MVP, we use a working copy approach: we execute sequentially but track created objectIds for rollback

    const createdObjectIds: string[] = [];
    const createdGroupIds: string[] = [];

    for (let i = 0; i < ir.length; i++) {
      const toolIR = ir[i];

      // Resolve DSL refs to ObjectIDs
      let resolvedInput: any = { ...toolIR.input };

      if (toolIR.targets && toolIR.targets.length > 0) {
        const resolvedObjectIds: string[] = [];
        for (const ref of toolIR.targets) {
          const objectId = (env as any).map ? (env as any).map.get(ref) : (env as any).getDefined?.().get(ref);
          // env is ReferenceEnvironment with internal map
          const resolved = (env as any).resolve ? (env as any).resolve(ref) : undefined;
          // Try to get from env's internal map directly
          let actualObjectId: string | undefined;
          if ((env as any).getDefined) {
            const def = (env as any).getDefined().get(ref);
            actualObjectId = def || undefined;
            if (actualObjectId === null) actualObjectId = undefined;
          }
          if (!actualObjectId && (env as any).resolve) {
            actualObjectId = (env as any).resolve(ref);
          }
          // Also check if env has map property
          if (!actualObjectId && (env as any).map) {
            actualObjectId = (env as any).map.get(ref) || undefined;
          }

          if (!actualObjectId) {
            errors.push(createError(DSLErrorCodes.UNKNOWN_REFERENCE, `Unknown reference ${ref} at IR ${i}`, { ref, irIndex: i }, toolIR.sourceInstructionIndex, ref));
            // For atomicity, rollback
            return { success: false, outputs, errors, warnings, ir };
          }
          resolvedObjectIds.push(actualObjectId);
        }
        resolvedInput.objectIds = resolvedObjectIds;
        resolvedInput.objectId = resolvedObjectIds[0];
      }

      if (toolIR.toolId === 'ARTBOARD') {
        // Handle artboard - for MVP, just store as document property via context if available
        // No tool, just record
        outputs.push({ toolId: 'ARTBOARD', input: resolvedInput, success: true });
        continue;
      }

      // Special handling for update that contains updateArgs (width/height etc)
      if (toolIR.input && (toolIR.input as any).updateArgs) {
        const updateArgs = (toolIR.input as any).updateArgs;
        // For width/height, we need to handle via geometry update - for MVP, we will delete and recreate or use appearance
        // Simplified: if width/height, we will try to update via objectStore directly through a custom command
        // For now, we map to a new rect creation? Better to handle as transform or recreate
        // We'll attempt to handle via toolRegistry if it has update capability, otherwise fail
        // For MVP, if updateArgs contains width/height, we treat as error unless we have a way
        // We'll implement simple width/height update via recreating geometry if possible

        // For this implementation, we will try to use T01 with new dimensions if target is rect
        // This requires documentContext to have objectStore etc - we will handle in JS runtime version
        // In TS version, we keep generic

        // For now, pass through as is and let toolRegistry handle if it has custom logic
        resolvedInput = { ...resolvedInput, updateArgs };
      }

      try {
        const result = context.toolRegistry.execute(toolIR.toolId, resolvedInput, context.documentContext);
        if (!result.success) {
          errors.push(createError(DSLErrorCodes.EXECUTION_FAILED, `Tool ${toolIR.toolId} failed: ${result.errors?.[0]?.message || 'unknown'}`, { toolId: toolIR.toolId, errors: result.errors, irIndex: i }, toolIR.sourceInstructionIndex));
          // Atomicity: rollback created objects
          // For MVP, attempt to delete created objects
          for (const oid of createdObjectIds) {
            try {
              context.toolRegistry.execute('T04', { objectIds: [oid] }, context.documentContext);
            } catch {}
          }
          return { success: false, outputs, errors, warnings, ir };
        }

        outputs.push(result);

        // If this IR created an object, store mapping
        if (result.output && result.output.objectId && toolIR.sourceRef) {
          (env as any).define(toolIR.sourceRef, result.output.objectId);
          createdObjectIds.push(result.output.objectId);
        }
        // Group creation
        if (result.output && result.output.groupNodeId && toolIR.sourceRef) {
          (env as any).define(toolIR.sourceRef, result.output.groupNodeId);
          createdGroupIds.push(result.output.groupNodeId);
        }
        // Boolean operation result
        if (result.output && result.output.resultObjectId) {
          const newId = result.output.resultObjectId;
          // If sourceRef exists, map it, otherwise map first target?
          if (toolIR.sourceRef) {
            (env as any).define(toolIR.sourceRef, newId);
          }
          createdObjectIds.push(newId);
        }

      } catch (e: any) {
        errors.push(createError(DSLErrorCodes.EXECUTION_FAILED, `Exception executing tool ${toolIR.toolId}: ${e.message}`, { toolId: toolIR.toolId, error: e.message, irIndex: i }, toolIR.sourceInstructionIndex));
        // Rollback
        for (const oid of createdObjectIds) {
          try {
            context.toolRegistry.execute('T04', { objectIds: [oid] }, context.documentContext);
          } catch {}
        }
        return { success: false, outputs, errors, warnings, ir };
      }
    }

    return { success: true, outputs, errors, warnings, ir };
  }

  async executeProgram(program: DSLProgram, context: DSLExecutorContext): Promise<ExecutionResult> {
    const compileResult = compileDSL(program);
    if (!compileResult.success) {
      return { success: false, outputs: [], errors: compileResult.errors, warnings: compileResult.warnings };
    }
    return this.execute(compileResult.ir!, context);
  }
}
