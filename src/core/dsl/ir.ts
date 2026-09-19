
import { DSLProgram, ToolIR, DSLError } from './types.js';
import { mapToToolIR } from './toolMapping.js';
import { CompileResult } from './types.js';

export function compileToIR(program: DSLProgram): CompileResult {
  const errors: DSLError[] = [];
  const warnings: DSLError[] = [];
  const ir: ToolIR[] = [];

  for (const node of program.instructions) {
    const result = mapToToolIR(node);
    if (result.error) {
      errors.push(result.error);
    } else if (result.ir) {
      ir.push(result.ir);
    }
  }

  const success = errors.length === 0;
  return { success, ir: success ? ir : undefined, program, errors, warnings };
}
