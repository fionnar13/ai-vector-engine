
import { DSLProgram, DSLError } from './types.js';
import { analyzeReferences } from './references.js';
import { DSLErrorCodes, createError } from './errors.js';

export function validateSemantics(program: DSLProgram): { valid: boolean; errors: DSLError[]; warnings: DSLError[] } {
  const errors: DSLError[] = [];
  const warnings: DSLError[] = [];

  // Reference validation
  const refResult = analyzeReferences(program);
  errors.push(...refResult.errors);
  warnings.push(...refResult.warnings);

  // Operation specific semantic checks
  for (let i = 0; i < program.instructions.length; i++) {
    const instr = program.instructions[i];

    if (instr.op === 'group') {
      if (!instr.targets || instr.targets.length < 2) {
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `group requires at least 2 targets`, {}, i));
      }
    }

    if (instr.op === 'ungroup') {
      if (!instr.target) {
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `ungroup requires target`, {}, i));
      }
    }

    if (instr.op === 'boolean') {
      if (!instr.targets || instr.targets.length < 2) {
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `boolean requires at least 2 targets`, {}, i));
      }
      const args = instr.args as any;
      if (args && args.tolerance !== undefined && args.tolerance < 0) {
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `tolerance must be >=0`, {}, i));
      }
    }

    if (instr.op === 'align') {
      if (!instr.targets || instr.targets.length < 1) {
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `align requires at least 1 target`, {}, i));
      }
    }

    if (instr.op === 'distribute') {
      if (!instr.targets || instr.targets.length < 3) {
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `distribute requires at least 3 targets`, {}, i));
      }
    }

    if (instr.op === 'transform') {
      const args = instr.args as any;
      if (args && args.matrix) {
        const m = args.matrix;
        const det = m.a * m.d - m.b * m.c;
        if (Math.abs(det) < 1e-12) {
          errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `Transform matrix is singular`, { matrix: m }, i));
        }
      }
      if (args && args.scale) {
        const scale = typeof args.scale === 'number' ? { x: args.scale, y: args.scale } : args.scale;
        if (scale.x === 0 || scale.y === 0) {
          errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `Scale cannot be zero - would be singular`, {}, i));
        }
      }
    }

    if (instr.op === 'appearance') {
      const args = instr.args as any;
      if (args.opacity !== undefined) {
        if (typeof args.opacity !== 'number' || args.opacity < 0 || args.opacity > 1) {
          errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `opacity must be number 0..1`, {}, i));
        }
      }
      if (args.fillRule && !['nonZero', 'evenOdd'].includes(args.fillRule)) {
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `Invalid fillRule ${args.fillRule}`, {}, i));
      }
    }

    if (instr.op === 'artboard') {
      const args = instr.args as any;
      if (args.width <= 0 || args.height <= 0) {
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `artboard width/height must be positive`, {}, i));
      }
    }

    if (instr.op === 'update') {
      const args = instr.args as any;
      if (args.width !== undefined && (typeof args.width !== 'number' || args.width <= 0)) {
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `width must be positive number`, {}, i));
      }
      if (args.height !== undefined && (typeof args.height !== 'number' || args.height <= 0)) {
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `height must be positive number`, {}, i));
      }
    }
  }

  // Operation ordering checks
  // e.g. redundant transform warnings etc - simple heuristic
  const seenTransforms = new Map<string, number>();
  for (let i = 0; i < program.instructions.length; i++) {
    const instr = program.instructions[i];
    if (instr.op === 'transform' && instr.target) {
      const key = instr.target;
      if (seenTransforms.has(key)) {
        const prev = seenTransforms.get(key)!;
        if (i === prev + 1) {
          warnings.push(createError('DSL_REDUNDANT_TRANSFORM', `Consecutive transforms on ${key} may be redundant`, { target: key }, i));
        }
      }
      seenTransforms.set(key, i);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
