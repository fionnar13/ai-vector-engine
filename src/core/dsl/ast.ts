
import { DSLProgram } from './types.js';

export function normalizeAST(program: DSLProgram): DSLProgram {
  // Already normalized in parser, but ensure deterministic ordering of args keys for serialization stability
  // For AST, we keep original but sort keys for deterministic comparison if needed
  return program;
}

export function cloneProgram(program: DSLProgram): DSLProgram {
  return {
    version: program.version,
    instructions: program.instructions.map(instr => ({
      ...instr,
      args: { ...instr.args },
      targets: instr.targets ? [...instr.targets] : undefined
    }))
  };
}
