
import { TransactionID, CommandID } from '../ids/index.js';
import { Command } from './command.js';
import { DocumentDiff } from './diff.js';
import { DocumentSnapshot } from './snapshot.js';

export type TransactionStatus = 'pending' | 'executing' | 'committed' | 'rolled_back' | 'failed';

export type TransactionSource = 'user' | 'ai' | 'system';

export type Inverse =
  | { type: 'commands'; commands: Command[] }
  | { type: 'snapshot'; before: DocumentSnapshot };

export interface Transaction {
  readonly id: TransactionID;
  readonly parentId: TransactionID | null;
  readonly commands: readonly Command[];
  status: TransactionStatus;
  diff: DocumentDiff | null;
  inverse: Inverse | null;
  readonly deterministic: boolean;
  readonly metadata: {
    readonly source: TransactionSource;
    readonly toolId?: string;
    readonly description?: string;
  };
  readonly createdAt: number;
}

export function createTransaction(params: {
  id: TransactionID;
  parentId: TransactionID | null;
  commands: Command[];
  deterministic: boolean;
  source: TransactionSource;
  toolId?: string;
  description?: string;
}): Transaction {
  return {
    id: params.id,
    parentId: params.parentId,
    commands: Object.freeze([...params.commands]),
    status: 'pending',
    diff: null,
    inverse: null,
    deterministic: params.deterministic,
    metadata: Object.freeze({
      source: params.source,
      toolId: params.toolId,
      description: params.description
    }),
    createdAt: Date.now()
  };
}
