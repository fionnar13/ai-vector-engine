
import { WorkingCopy } from './working-copy.js';
import { IDFactory } from './id-factory.js';

export interface CommandContext {
  readonly workingCopy: WorkingCopy;
  readonly ids: IDFactory;
}
