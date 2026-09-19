
import { Command, CommandFactory } from './command.js';

export class CommandRegistry {
  private factories = new Map<string, CommandFactory>();

  register(type: string, factory: CommandFactory): void {
    if (this.factories.has(type)) throw new Error(`Command type already registered: ${type}`);
    this.factories.set(type, factory);
  }

  create(type: string, input: unknown): Command {
    const factory = this.factories.get(type);
    if (!factory) throw new Error(`Command type not found: ${type}`);
    return factory(input);
  }

  has(type: string): boolean {
    return this.factories.has(type);
  }

  list(): string[] {
    return Array.from(this.factories.keys());
  }
}
