
import { DSLProgram, CompileResult } from './types.js';
import { validateDSL } from './validator.js';
import { compileToIR } from './ir.js';

export function compileDSL(program: DSLProgram): CompileResult {
  // Validate entire DSL
  const validation = validateDSL(program);
  if (!validation.valid) {
    return { success: false, errors: validation.errors, warnings: validation.warnings };
  }

  // Compile to IR
  const irResult = compileToIR(program);
  if (!irResult.success) {
    return { success: false, errors: [...validation.errors, ...irResult.errors], warnings: [...validation.warnings, ...irResult.warnings] };
  }

  return {
    success: true,
    ir: irResult.ir,
    program,
    errors: validation.errors,
    warnings: [...validation.warnings, ...irResult.warnings]
  };
}
