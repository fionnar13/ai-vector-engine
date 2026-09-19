
import { VectorDSL, DSLProgram, DSLNode, DSLError } from './types.js';
import { validateSchema } from './schema.js';
import { DSLErrorCodes, createError } from './errors.js';
import { ParseResult } from './types.js';

export function parseDSL(input: unknown): ParseResult {
  const errors: DSLError[] = [];
  const warnings: DSLError[] = [];

  // JSON syntax validation - input may be string
  let obj: unknown = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input);
    } catch (e: any) {
      errors.push(createError(DSLErrorCodes.PARSE_ERROR, `Invalid JSON: ${e.message}`, { error: e.message }));
      return { success: false, errors, warnings };
    }
  }

  // Schema validation
  const schemaResult = validateSchema(obj);
  errors.push(...schemaResult.errors);
  warnings.push(...schemaResult.warnings);

  if (!schemaResult.valid) {
    return { success: false, errors, warnings };
  }

  const vectorDSL = schemaResult.program as VectorDSL;

  // AST construction
  const instructions: DSLNode[] = vectorDSL.program.map((instr: any, idx: number) => {
    return {
      op: instr.op,
      ref: instr.id,
      target: instr.target,
      targets: instr.targets,
      type: instr.type,
      operation: instr.operation,
      args: instr.args || {},
      sourceIndex: idx
    };
  });

  const program: DSLProgram = {
    version: vectorDSL.version,
    instructions
  };

  return { success: true, program, errors, warnings };
}
