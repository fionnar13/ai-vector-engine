
export type StoreType = 'object' | 'geometry' | 'appearance' | 'node' | 'constraint' | 'semantic';

export interface EntityRef {
  readonly store: StoreType;
  readonly id: string;
}

export class Journal {
  private added: EntityRef[] = [];
  private removed: EntityRef[] = [];
  private modified: EntityRef[] = [];

  add(store: StoreType, id: string): void {
    this.added.push({ store, id });
  }

  remove(store: StoreType, id: string): void {
    this.removed.push({ store, id });
  }

  modify(store: StoreType, id: string): void {
    this.modified.push({ store, id });
  }

  hasAdded(store: StoreType, id: string): boolean {
    return this.added.some(e => e.store === store && e.id === id);
  }

  hasModified(store: StoreType, id: string): boolean {
    return this.modified.some(e => e.store === store && e.id === id);
  }

  removeAdded(store: StoreType, id: string): void {
    this.added = this.added.filter(e => !(e.store === store && e.id === id));
  }

  getAdded(): EntityRef[] { return [...this.added]; }
  getRemoved(): EntityRef[] { return [...this.removed]; }
  getModified(): EntityRef[] { return [...this.modified]; }

  // Normalize: remove duplicates
  normalize(): void {
    const dedup = (refs: EntityRef[]): EntityRef[] => {
      const seen = new Set<string>();
      const result: EntityRef[] = [];
      for (const r of refs) {
        const key = `${r.store}:${r.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(r);
        }
      }
      return result;
    };
    this.added = dedup(this.added);
    this.removed = dedup(this.removed);
    this.modified = dedup(this.modified);

    // If an entity is both added and removed in same transaction, net zero -> remove from both
    const addedKeys = new Set(this.added.map(r => `${r.store}:${r.id}`));
    const removedKeys = new Set(this.removed.map(r => `${r.store}:${r.id}`));
    const both = new Set([...addedKeys].filter(k => removedKeys.has(k)));
    if (both.size > 0) {
      this.added = this.added.filter(r => !both.has(`${r.store}:${r.id}`));
      this.removed = this.removed.filter(r => !both.has(`${r.store}:${r.id}`));
      // Also remove from modified if present
      this.modified = this.modified.filter(r => !both.has(`${r.store}:${r.id}`));
    }
  }

  toDiff(): { added: EntityRef[], removed: EntityRef[], modified: EntityRef[] } {
    this.normalize();
    return {
      added: this.getAdded(),
      removed: this.getRemoved(),
      modified: this.getModified()
    };
  }

  clear(): void {
    this.added = [];
    this.removed = [];
    this.modified = [];
  }
}
