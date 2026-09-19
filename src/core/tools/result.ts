
export interface ToolError {
  readonly code: string;
  readonly message: string;
  readonly context?: any;
  readonly severity?: string;
  readonly recovery?: string;
  readonly retryable?: boolean;
  readonly rollbackRequired?: boolean;
}

export interface ToolWarning {
  readonly code: string;
  readonly message: string;
}
