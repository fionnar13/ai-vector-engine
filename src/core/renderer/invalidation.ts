
import { NodeID } from '../ids/index.js';

export class InvalidationTracker {
  private invalidated = new Set<string>();
  private fullRebuildNeeded = false;

  invalidate(nodeIds: NodeID[]): void {
    for (const id of nodeIds) {
      this.invalidated.add(id as string);
    }
  }

  invalidateAll(): void {
    this.fullRebuildNeeded = true;
    this.invalidated.clear();
  }

  needsFullRebuild(): boolean {
    return this.fullRebuildNeeded;
  }

  getInvalidated(): Set<string> {
    return new Set(this.invalidated);
  }

  clear(): void {
    this.invalidated.clear();
    this.fullRebuildNeeded = false;
  }

  isInvalidated(nodeId: string): boolean {
    return this.fullRebuildNeeded || this.invalidated.has(nodeId);
  }
}
