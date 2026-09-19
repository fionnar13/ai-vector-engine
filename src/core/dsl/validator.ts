
import { DSLProgram, ValidationResult } from './types.js';
import { validateSemantics } from './semanticValidator.js';
import { analyzeReferences } from './references.js';

export function validateDSL(program: DSLProgram): ValidationResult {
  // Semantic validation includes reference validation
  const semantic = validateSemantics(program);
  return {
    valid: semantic.valid,
    errors: semantic.errors,
    warnings: semantic.warnings
  };
}

export function lintDSL(program: DSLProgram): ValidationResult {
  // Linter is same as semantic validator but also includes unused reference warnings
  const refAnalysis = analyzeReferences(program);
  const semantic = validateSemantics(program);

  const allErrors = [...semantic.errors];
  const allWarnings = [...semantic.warnings, ...refAnalysis.warnings];

  // Deduplicate warnings by message+index
  const seen = new Set<string>();
  const dedupedWarnings = allWarnings.filter(w => {
    const key = `${w.code}:${w.instructionIndex}:${w.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: dedupedWarnings
  };
}
