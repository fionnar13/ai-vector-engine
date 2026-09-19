
export type DSLVersion = string; // e.g. "1.0"
export type DSLRef = string;

export type DSLOp =
  | 'create'
  | 'update'
  | 'delete'
  | 'transform'
  | 'appearance'
  | 'group'
  | 'ungroup'
  | 'reorder'
  | 'boolean'
  | 'align'
  | 'distribute'
  | 'text'
  | 'artboard'
  | 'propose_constraint'
  | 'propose_semantic';

export type DSLCreateType = 'rect' | 'ellipse' | 'path' | 'pointText' | 'line' | 'polygon' | 'star';

export type DSLBooleanOperation = 'union' | 'difference' | 'intersection';
export type DSLAlignAxis = 'horizontal' | 'vertical' | 'both';
export type DSLAlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type DSLDistributeAxis = 'horizontal' | 'vertical';
export type DSLDistributeMode = 'centers' | 'gaps';
export type DSLReorderOperation = 'front' | 'back' | 'forward' | 'backward';
export type DSLFillRule = 'nonZero' | 'evenOdd';

export interface DSLInstructionBase {
  op: DSLOp;
  id?: DSLRef; // DSL reference identifier for created object
  target?: DSLRef;
  targets?: DSLRef[];
  type?: DSLCreateType | string; // for create/text
  operation?: DSLBooleanOperation | DSLReorderOperation | string; // for boolean/reorder
  args?: Record<string, unknown>;
}

export interface DSLInstruction extends DSLInstructionBase {
  // Strict but allow args
}

export interface VectorDSL {
  version: DSLVersion;
  program: DSLInstruction[];
}

// AST normalized
export interface DSLNode {
  op: DSLOp;
  ref?: DSLRef; // id of created object
  target?: DSLRef;
  targets?: DSLRef[];
  type?: DSLCreateType | string;
  operation?: string;
  args: Record<string, unknown>;
  sourceIndex: number;
}

export interface DSLProgram {
  version: DSLVersion;
  instructions: DSLNode[];
}

// IR
export type ToolID = string;

export interface ToolIR {
  toolId: ToolID;
  input: unknown;
  sourceInstructionIndex: number;
  sourceRef?: DSLRef;
  targets?: DSLRef[]; // DSL refs for resolution at execution
  category: 'read' | 'proposal' | 'mutation';
}

export interface DSLError {
  code: string;
  message: string;
  context?: any;
  instructionIndex?: number;
  ref?: DSLRef;
}

export interface ValidationResult {
  valid: boolean;
  errors: DSLError[];
  warnings: DSLError[];
}

export interface ParseResult {
  success: boolean;
  program?: DSLProgram;
  errors: DSLError[];
  warnings: DSLError[];
}

export interface CompileResult {
  success: boolean;
  ir?: ToolIR[];
  program?: DSLProgram;
  errors: DSLError[];
  warnings: DSLError[];
}

export interface DSLExecutionContext {
  toolRegistry: any;
  documentContext: any; // ToolContext
  env: DSLReferenceEnvironment;
  transactionManager?: any;
}

export interface DSLReferenceEnvironment {
  defined: Map<DSLRef, string | null>; // DSLRef -> ObjectID or null pending
  resolve(ref: DSLRef): string | undefined;
  define(ref: DSLRef, objectId: string | null): void;
  has(ref: DSLRef): boolean;
}

export interface ExecutionResult {
  success: boolean;
  outputs: any[];
  errors: DSLError[];
  warnings: DSLError[];
  ir?: ToolIR[];
}
