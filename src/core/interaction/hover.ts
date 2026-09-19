
import { HoverState } from './types.js';
import { NodeID } from '../ids/index.js';

export class HoverManager {
  private state: HoverState = {
    nodeId: null,
    kind: null
  };
  private listeners: ((state: HoverState) => void)[] = [];

  getState(): HoverState {
    return { ...this.state };
  }

  setHover(nodeId: NodeID | null, kind: HoverState['kind'] = null): void {
    if (this.state.nodeId !== nodeId || this.state.kind !== kind) {
      this.state = { nodeId, kind };
      this.emit();
    }
  }

  clear(): void {
    if (this.state.nodeId !== null) {
      this.state = { nodeId: null, kind: null };
      this.emit();
    }
  }

  subscribe(listener: (state: HoverState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
