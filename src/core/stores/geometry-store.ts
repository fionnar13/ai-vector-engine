
import { GeometryID } from '../ids/index.js';
import { Geometry } from '../geometry/types.js';
import { createError } from '../errors/index.js';
import { validateGeometryID, validateGeometry } from './validation.js';

function deepClone<T>(obj: T): T {
  // Use structuredClone if available, else JSON fallback (geometry is plain)
  // @ts-ignore
  if (typeof structuredClone === 'function') {
    // @ts-ignore
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

export class GeometryStore {
  private store = new Map<string, Geometry>();

  // Internal mutation API - future public path will be via Command/Transaction
  create(id: GeometryID, geometry: Geometry): void {
    validateGeometryID(id);
    validateGeometry(geometry);
    if (this.store.has(id)) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `Duplicate GeometryID: ${id}`, severity: 'error', context: { id } });
    }
    // Preserve parametric - do not auto-convert
    this.store.set(id, deepClone(geometry));
  }

  get(id: GeometryID): Geometry | undefined {
    const g = this.store.get(id);
    if (!g) return undefined;
    // Defensive clone to prevent external mutation bypass
    return deepClone(g);
  }

  has(id: GeometryID): boolean {
    return this.store.has(id);
  }

  update(id: GeometryID, geometry: Geometry): void {
    validateGeometryID(id);
    validateGeometry(geometry);
    if (!this.store.has(id)) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `Geometry not found: ${id}`, severity: 'error', context: { id } });
    }
    this.store.set(id, deepClone(geometry));
  }

  delete(id: GeometryID, isReferenced?: (id: GeometryID) => boolean): void {
    validateGeometryID(id);
    if (!this.store.has(id)) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `Geometry not found: ${id}`, severity: 'error' });
    }
    if (isReferenced && isReferenced(id)) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `Geometry in use, cannot delete: ${id}`, severity: 'error', context: { id } });
    }
    this.store.delete(id);
  }

  listIds(): GeometryID[] {
    return Array.from(this.store.keys()) as GeometryID[];
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
