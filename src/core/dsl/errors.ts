
export const DSLErrorCodes = {
  PARSE_ERROR: 'DSL_PARSE_ERROR',
  UNSUPPORTED_VERSION: 'DSL_UNSUPPORTED_VERSION',
  INVALID_OPERATION: 'DSL_INVALID_OPERATION',
  SCHEMA_INVALID: 'DSL_SCHEMA_INVALID',
  SEMANTIC_INVALID: 'DSL_SEMANTIC_INVALID',
  UNKNOWN_REFERENCE: 'DSL_UNKNOWN_REFERENCE',
  DUPLICATE_REFERENCE: 'DSL_DUPLICATE_REFERENCE',
  INVALID_ARGUMENT: 'DSL_INVALID_ARGUMENT',
  COMPILE_FAILED: 'DSL_COMPILE_FAILED',
  EXECUTION_FAILED: 'DSL_EXECUTION_FAILED',
} as const;

export type DSLErrorCode = typeof DSLErrorCodes[keyof typeof DSLErrorCodes];

export function createError(code: string, message: string, context?: any, instructionIndex?: number, ref?: string) {
  return { code, message, context, instructionIndex, ref };
}
