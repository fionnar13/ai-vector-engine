
import { TransactionID } from '../ids/index.js';
import { Transaction } from './transaction.js';
import { createError } from '../errors/index.js';

export class HistoryManager {
  private transactions: Transaction[] = [];
  private currentIndex: number = -1;

  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.transactions.length - 1;
  }

  push(transaction: Transaction): void {
    if (transaction.status !== 'committed') throw createError({ code: 'VALIDATION_SCHEMA', message: 'Only committed transactions can be pushed to history', severity: 'error' });

    // Branch invalidation: if we are not at end, truncate future
    if (this.currentIndex < this.transactions.length - 1) {
      this.transactions = this.transactions.slice(0, this.currentIndex + 1);
    }

    this.transactions.push(transaction);
    this.currentIndex = this.transactions.length - 1;
  }

  current(): Transaction | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.transactions.length) return null;
    return this.transactions[this.currentIndex];
  }

  getAll(): Transaction[] {
    return [...this.transactions];
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  // For undo/redo, we return the transaction that should be inverted or replayed
  getTransactionToUndo(): Transaction | null {
    if (!this.canUndo()) return null;
    return this.transactions[this.currentIndex];
  }

  getTransactionToRedo(): Transaction | null {
    if (!this.canRedo()) return null;
    return this.transactions[this.currentIndex + 1];
  }

  moveBack(): void {
    if (!this.canUndo()) throw createError({ code: 'VALIDATION_SCHEMA', message: 'HISTORY_EMPTY: cannot undo', severity: 'error' });
    this.currentIndex--;
  }

  moveForward(): void {
    if (!this.canRedo()) throw createError({ code: 'VALIDATION_SCHEMA', message: 'HISTORY_NO_REDO: cannot redo', severity: 'error' });
    this.currentIndex++;
  }

  clear(): void {
    this.transactions = [];
    this.currentIndex = -1;
  }

  size(): number {
    return this.transactions.length;
  }
}
