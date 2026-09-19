
import { DSLProgram, ValidationResult } from './types.js';
import { lintDSL } from './validator.js';

export function lint(program: DSLProgram): ValidationResult {
  return lintDSL(program);
}
