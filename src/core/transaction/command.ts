
import { CommandID, TransactionID } from '../ids/index.js';
import { CommandContext } from './command-context.js';

export type CommandResult = {
  readonly success: boolean;
  readonly error?: string;
};

export interface Command {
  readonly id: CommandID;
  readonly toolId: string;
  readonly input: unknown;
  readonly deterministic: boolean;
  execute(ctx: CommandContext): CommandResult;
  getAffectedIds?(): { objects?: string[], geometries?: string[], appearances?: string[], nodes?: string[] };
  getInverse?(): Command | null;
}

export type CommandFactory = (input: unknown) => Command;
