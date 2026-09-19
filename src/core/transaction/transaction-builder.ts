
import { TransactionID, createTransactionID } from '../ids/index.js';
import { Command } from './command.js';
import { Transaction, createTransaction, TransactionSource } from './transaction.js';
import { createError } from '../errors/index.js';

export class TransactionBuilder {
  private commands: Command[] = [];
  private source: TransactionSource = 'user';
  private toolId?: string;
  private description?: string;
  private parentId: TransactionID | null = null;
  private id: TransactionID | null = null;

  begin(params: { source: TransactionSource; toolId?: string; description?: string; parentId?: TransactionID | null; id?: TransactionID }): TransactionBuilder {
    this.source = params.source;
    this.toolId = params.toolId;
    this.description = params.description;
    this.parentId = params.parentId ?? null;
    this.id = params.id ?? null;
    this.commands = [];
    return this;
  }

  addCommand(command: Command): TransactionBuilder {
    if (!command) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Command missing', severity: 'error' });
    this.commands.push(command);
    return this;
  }

  build(): Transaction {
    if (this.commands.length === 0) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Transaction must have at least one command', severity: 'error' });
    const deterministic = this.commands.every(c => c.deterministic);
    const txId = this.id ?? createTransactionID();
    return createTransaction({
      id: txId,
      parentId: this.parentId,
      commands: this.commands,
      deterministic,
      source: this.source,
      toolId: this.toolId,
      description: this.description
    });
  }
}
