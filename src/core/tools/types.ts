
import { DocumentID } from '../ids/index.js';

export type ToolID = string;
export type ToolCategory = 'read' | 'proposal' | 'mutation';

export interface ToolPermissions {
  readonly read: string[];
  readonly write: string[];
}

export interface ToolSchema {
  readonly type: string;
  readonly required?: string[];
  readonly properties?: Record<string, any>;
}

export interface ToolValidationResult {
  readonly valid: boolean;
  readonly errors: { code: string; message: string; context?: any }[];
}

export interface ToolContext {
  readonly documentId: DocumentID;
  readonly objectStore: any;
  readonly geometryStore: any;
  readonly appearanceStore: any;
  readonly sceneGraph: any;
  readonly constraintStore?: any;
  readonly semanticStore?: any;
  readonly spatialIndex?: any;
  readonly commandFactory?: any;
  readonly transactionManager?: any;
  readonly validator?: any;
  readonly workingCopy?: any; // for testing
}

export interface ToolResult<T = unknown> {
  readonly success: boolean;
  readonly output?: T;
  readonly errors?: { code: string; message: string; context?: any }[];
  readonly warnings?: { code: string; message: string }[];
  readonly commandId?: string;
  readonly transactionId?: string;
}

export interface ToolMetadata {
  readonly id: ToolID;
  readonly name: string;
  readonly version: string;
  readonly category: ToolCategory;
  readonly deterministic: boolean;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly id: ToolID;
  readonly name: string;
  readonly version: string;
  readonly category: ToolCategory;
  readonly description: string;
  readonly inputSchema: ToolSchema;
  readonly outputSchema: ToolSchema;
  readonly permissions: ToolPermissions;
  readonly deterministic: boolean;
  readonly metadata?: ToolMetadata;

  validate(input: TInput, context: ToolContext): ToolValidationResult;
  execute(input: TInput, context: ToolContext): ToolResult<TOutput>;
}
