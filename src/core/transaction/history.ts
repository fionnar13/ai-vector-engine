
import { TransactionID } from '../ids/index.js';
import { Transaction } from './transaction.js';

export interface History {
  readonly transactions: readonly Transaction[];
  currentIndex: number;
}

export function createHistory(): History {
  return {
    transactions: [],
    currentIndex: -1
  };
}
