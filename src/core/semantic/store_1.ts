
import { SemanticData, SemanticRole } from './types.js';
import { ObjectID } from '../ids/index.js';
import { isUUID } from '../ids/index.js';
import { validateSemanticData, normalizeTags } from './validation.js';

function deepClone<T>(obj: T): T {
  // @ts-ignore
  if (typeof structuredClone === 'function') {
    // @ts-ignore
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

export class SemanticStore {
  private store = new Map<string, SemanticData>();

  get(objectId: ObjectID): SemanticData | undefined {
    const data = this.store.get(objectId as string);
    return data ? deepClone(data) : undefined;
  }

  has(objectId: ObjectID): boolean {
    return this.store.has(objectId as string);
  }

  set(data: SemanticData): void {
    const validation = validateSemanticData(data);
    if (!validation.valid) {
      throw new Error(`Semantic validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }
    const normalizedTags = normalizeTags(data.tags);
    const normalizedData: SemanticData = {
      ...data,
      tags: normalizedTags,
      relationships: [...data.relationships].sort((a, b) => {
        const t = a.targetObjectId.localeCompare(b.targetObjectId);
        if (t !== 0) return t;
        return a.type.localeCompare(b.type);
      }),
      updatedAt: data.updatedAt ?? Date.now()
    };
    this.store.set(data.objectId as string, deepClone(normalizedData));
  }

  delete(objectId: ObjectID): void {
    this.store.delete(objectId as string);
  }

  clear(): void {
    this.store.clear();
  }

  getAll(): SemanticData[] {
    return Array.from(this.store.values()).map(d => deepClone(d)).sort((a, b) => a.objectId.localeCompare(b.objectId));
  }

  getByRole(role: SemanticRole): SemanticData[] {
    return this.getAll().filter(d => d.role === role);
  }

  getByTag(tag: string): SemanticData[] {
    const normalized = tag.trim().toLowerCase();
    return this.getAll().filter(d => d.tags.includes(normalized));
  }

  size(): number {
    return this.store.size;
  }

  clone(): SemanticStore {
    const cloned = new SemanticStore();
    for (const [id, data] of this.store.entries()) {
      cloned.store.set(id, deepClone(data));
    }
    return cloned;
  }

  toSnapshot(): Record<string, SemanticData> {
    const snap: Record<string, SemanticData> = {};
    for (const [id, data] of this.store.entries()) {
      snap[id] = deepClone(data);
    }
    return snap;
  }

  fromSnapshot(snap: Record<string, SemanticData>): void {
    this.store.clear();
    for (const [id, data] of Object.entries(snap)) {
      this.store.set(id, deepClone(data));
    }
  }
}
