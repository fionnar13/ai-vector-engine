
/**
 * Structured Error Model
 */
export type ErrorCode =
  | 'GEOMETRY_DEGENERATE'
  | 'TOPOLOGY_SELF_INTERSECT'
  | 'CONSTRAINT_UNSATISFIABLE'
  | 'VALIDATION_SCHEMA'
  | 'TRANSACTION_CONFLICT'
  | 'TRANSACTION_COMMAND_FAILED'
  | 'TRANSACTION_VALIDATION_FAILED'
  | 'TRANSACTION_ROLLBACK_FAILED'
  | 'HISTORY_EMPTY'
  | 'HISTORY_NO_REDO'
  | 'IMPORT_PARSE'
  | 'TOOL_PRECONDITION_FAILED'
  | 'AI_PLAN_FAILED'
  | 'TRANSFORM_SINGULAR'
  | 'GEOMETRY_OPEN_PATH'
  | 'FONT_FALLBACK'
  | 'BOOLEAN_FAILED'
  | 'SPATIAL_INDEX_STALE'
  | 'UNKNOWN';

export type Severity = 'warning' | 'error' | 'fatal';
export type Recovery = 'rollback' | 'skip' | 'retry' | 'userFix';

export type AppError = {
  readonly code: ErrorCode;
  readonly message: string;
  readonly severity: Severity;
  readonly recovery: Recovery;
  readonly retryable: boolean;
  readonly rollbackRequired: boolean;
  readonly context?: Record<string, unknown>;
  readonly timestamp: number;
};

export function createError(params: {
  code: ErrorCode;
  message: string;
  severity?: Severity;
  recovery?: Recovery;
  retryable?: boolean;
  rollbackRequired?: boolean;
  context?: Record<string, unknown>;
}): AppError {
  return {
    code: params.code,
    message: params.message,
    severity: params.severity ?? 'error',
    recovery: params.recovery ?? 'rollback',
    retryable: params.retryable ?? false,
    rollbackRequired: params.rollbackRequired ?? true,
    context: params.context,
    timestamp: Date.now()
  };
}

export function isAppError(e: unknown): e is AppError {
  return !!e && typeof e === 'object' && 'code' in e && 'message' in e;
}

export function serializeError(err: AppError): string {
  return JSON.stringify(err);
}
export function deserializeError(s: string): AppError {
  return JSON.parse(s) as AppError;
}
