
import { EntityRef } from './journal.js';

export interface DocumentDiff {
  readonly added: readonly EntityRef[];
  readonly removed: readonly EntityRef[];
  readonly modified: readonly EntityRef[];
}

export function createDiff(added: EntityRef[], removed: EntityRef[], modified: EntityRef[]): DocumentDiff {
  return {
    added: Object.freeze([...added]),
    removed: Object.freeze([...removed]),
    modified: Object.freeze([...modified])
  };
}
