
import { DSLProgram, DSLRef, DSLError } from './types.js';
import { DSLErrorCodes, createError } from './errors.js';

export interface ReferenceAnalysis {
  defined: Set<DSLRef>;
  used: Set<DSLRef>;
  duplicateDefinitions: DSLRef[];
  unknownReferences: { ref: DSLRef; instructionIndex: number }[];
  forwardReferences: { ref: DSLRef; usedAt: number; definedAt: number }[];
  unusedReferences: DSLRef[];
}

export function analyzeReferences(program: DSLProgram): { analysis: ReferenceAnalysis; errors: DSLError[]; warnings: DSLError[] } {
  const errors: DSLError[] = [];
  const warnings: DSLError[] = [];

  const defined = new Map<DSLRef, number>(); // ref -> first defined index
  const duplicateDefinitions: DSLRef[] = [];
  const used: { ref: DSLRef; index: number }[] = [];

  for (let i = 0; i < program.instructions.length; i++) {
    const instr = program.instructions[i];
    if (instr.ref) {
      if (defined.has(instr.ref)) {
        duplicateDefinitions.push(instr.ref);
        errors.push(createError(DSLErrorCodes.DUPLICATE_REFERENCE, `Duplicate reference ${instr.ref}`, { ref: instr.ref }, i, instr.ref));
      } else {
        defined.set(instr.ref, i);
      }
    }
    if (instr.target) {
      used.push({ ref: instr.target, index: i });
    }
    if (instr.targets) {
      for (const t of instr.targets) {
        used.push({ ref: t, index: i });
      }
    }
  }

  const unknownReferences: { ref: DSLRef; instructionIndex: number }[] = [];
  const forwardReferences: { ref: DSLRef; usedAt: number; definedAt: number }[] = [];

  for (const u of used) {
    if (!defined.has(u.ref)) {
      unknownReferences.push({ ref: u.ref, instructionIndex: u.index });
      errors.push(createError(DSLErrorCodes.UNKNOWN_REFERENCE, `Unknown reference ${u.ref}`, { ref: u.ref }, u.index, u.ref));
    } else {
      const definedAt = defined.get(u.ref)!;
      if (definedAt > u.index) {
        // Forward reference: used before defined
        forwardReferences.push({ ref: u.ref, usedAt: u.index, definedAt });
        errors.push(createError(DSLErrorCodes.SEMANTIC_INVALID, `Forward reference ${u.ref} used at ${u.usedAt} but defined at ${definedAt}`, { ref: u.ref, usedAt: u.index, definedAt }, u.index, u.ref));
      }
    }
  }

  const definedSet = new Set(defined.keys());
  const usedSet = new Set(used.map(u => u.ref));
  const unusedReferences: DSLRef[] = [];
  for (const d of definedSet) {
    if (!usedSet.has(d)) {
      unusedReferences.push(d);
      warnings.push(createError('DSL_UNUSED_REFERENCE', `Unused reference ${d}`, { ref: d }));
    }
  }

  const analysis: ReferenceAnalysis = {
    defined: definedSet,
    used: usedSet,
    duplicateDefinitions,
    unknownReferences,
    forwardReferences,
    unusedReferences
  };

  return { analysis, errors, warnings };
}

export class DSLReferenceEnvironment {
  private map = new Map<DSLRef, string | null>();
  private definedSet = new Set<DSLRef>();

  define(ref: DSLRef, objectId: string | null): void {
    this.map.set(ref, objectId);
    this.definedSet.add(ref);
  }

  resolve(ref: DSLRef): string | undefined {
    const v = this.map.get(ref);
    return v === null ? undefined : v as string | undefined;
  }

  has(ref: DSLRef): boolean {
    return this.map.has(ref) && this.map.get(ref) !== null;
  }

  hasDefined(ref: DSLRef): boolean {
    return this.definedSet.has(ref);
  }

  getDefined(): Map<DSLRef, string | null> {
    return this.map;
  }
}
