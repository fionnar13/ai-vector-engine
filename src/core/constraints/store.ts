
import { Constraint } from './types.js';
import { ConstraintID, ObjectID } from '../ids/index.js';
import { isUUID } from '../ids/index.js';

export class ConstraintStore {
  private store: Map<string, Constraint> = new Map();

  create(constraint: Constraint): void {
    if (!isUUID(constraint.id as string)) throw new Error(`Invalid ConstraintID ${constraint.id}`);
    if (this.store.has(constraint.id as string)) throw new Error(`Duplicate ConstraintID ${constraint.id}`);
    this.store.set(constraint.id as string, deepClone(constraint));
  }

  get(id: ConstraintID): Constraint | undefined {
    const c = this.store.get(id as string);
    return c ? deepClone(c) : undefined;
  }

  has(id: ConstraintID): boolean {
    return this.store.has(id as string);
  }

  update(id: ConstraintID, constraint: Constraint): void {
    if (!this.store.has(id as string)) throw new Error(`Constraint not found ${id}`);
    if ((id as string) !== (constraint.id as string)) throw new Error('ID mismatch in update');
    this.store.set(id as string, deepClone(constraint));
  }

  delete(id: ConstraintID): void {
    if (!this.store.has(id as string)) throw new Error(`Constraint not found ${id}`);
    this.store.delete(id as string);
  }

  list(): Constraint[] {
    return Array.from(this.store.values()).map(c => deepClone(c));
  }

  listIds(): ConstraintID[] {
    return Array.from(this.store.keys()) as ConstraintID[];
  }

  listByObjectId(objectId: ObjectID): Constraint[] {
    return this.list().filter(c => c.objectIds.includes(objectId));
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  // For transaction working copy
  clone(): ConstraintStore {
    const cloned = new ConstraintStore();
    for (const [id, c] of this.store.entries()) {
      cloned.store.set(id, deepClone(c));
    }
    return cloned;
  }

  toSnapshot(): Record<string, Constraint> {
    const snap: Record<string, Constraint> = {};
    for (const [id, c] of this.store.entries()) {
      snap[id] = deepClone(c);
    }
    return snap;
  }

  fromSnapshot(snap: Record<string, Constraint>): void {
    this.store.clear();
    for (const [id, c] of Object.entries(snap)) {
      this.store.set(id, deepClone(c));
    }
  }
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
