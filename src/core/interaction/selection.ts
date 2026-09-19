
import { NodeID } from '../ids/index.js';
import { SelectionState } from './types.js';

export class SelectionManager {
  private state: SelectionState = {
    selectedNodeIds: [] as NodeID[],
    activeNodeId: null
  };
  private listeners: ((state: SelectionState) => void)[] = [];

  getState(): SelectionState {
    return {
      selectedNodeIds: [...this.state.selectedNodeIds],
      activeNodeId: this.state.activeNodeId
    };
  }

  select(nodeId: NodeID): void {
    if (!this.state.selectedNodeIds.includes(nodeId)) {
      this.state = {
        selectedNodeIds: [...this.state.selectedNodeIds, nodeId],
        activeNodeId: nodeId
      };
      this.emit();
    } else {
      this.setActive(nodeId);
    }
  }

  deselect(nodeId: NodeID): void {
    const filtered = this.state.selectedNodeIds.filter(id => id !== nodeId);
    if (filtered.length !== this.state.selectedNodeIds.length) {
      this.state = {
        selectedNodeIds: filtered,
        activeNodeId: filtered.length > 0 ? filtered[filtered.length - 1] : null
      };
      this.emit();
    }
  }

  toggle(nodeId: NodeID): void {
    if (this.state.selectedNodeIds.includes(nodeId)) {
      this.deselect(nodeId);
    } else {
      this.select(nodeId);
    }
  }

  replaceSelection(nodeIds: NodeID[]): void {
    // Deterministic ordering - sort by string value for consistency, but preserve SceneGraph order where possible
    // For MVP, we keep the order provided (which should be SceneGraph order) and deduplicate
    const unique = Array.from(new Set(nodeIds));
    this.state = {
      selectedNodeIds: unique,
      activeNodeId: unique.length > 0 ? unique[unique.length - 1] : null
    };
    this.emit();
  }

  addToSelection(nodeIds: NodeID[]): void {
    const current = new Set(this.state.selectedNodeIds);
    const added: NodeID[] = [...this.state.selectedNodeIds];
    for (const id of nodeIds) {
      if (!current.has(id)) {
        added.push(id);
        current.add(id);
      }
    }
    this.state = {
      selectedNodeIds: added,
      activeNodeId: added.length > 0 ? added[added.length - 1] : this.state.activeNodeId
    };
    this.emit();
  }

  removeFromSelection(nodeIds: NodeID[]): void {
    const toRemove = new Set(nodeIds);
    const filtered = this.state.selectedNodeIds.filter(id => !toRemove.has(id));
    this.state = {
      selectedNodeIds: filtered,
      activeNodeId: filtered.includes(this.state.activeNodeId as NodeID) ? this.state.activeNodeId : (filtered.length > 0 ? filtered[filtered.length - 1] : null)
    };
    this.emit();
  }

  clearSelection(): void {
    if (this.state.selectedNodeIds.length > 0) {
      this.state = {
        selectedNodeIds: [],
        activeNodeId: null
      };
      this.emit();
    }
  }

  setActiveNode(nodeId: NodeID | null): void {
    if (nodeId !== this.state.activeNodeId) {
      this.state = {
        selectedNodeIds: this.state.selectedNodeIds,
        activeNodeId: nodeId
      };
      this.emit();
    }
  }

  setActive(nodeId: NodeID): void {
    this.setActiveNode(nodeId);
  }

  isSelected(nodeId: NodeID): boolean {
    return this.state.selectedNodeIds.includes(nodeId);
  }

  hasSelection(): boolean {
    return this.state.selectedNodeIds.length > 0;
  }

  subscribe(listener: (state: SelectionState) => void): () => void {
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

  // For testing: directly set state without emitting? But we want deterministic
  setState(state: SelectionState): void {
    this.state = {
      selectedNodeIds: [...state.selectedNodeIds],
      activeNodeId: state.activeNodeId
    };
    this.emit();
  }
}
