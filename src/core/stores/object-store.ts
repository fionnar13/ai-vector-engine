
import { ObjectID, GeometryID, AppearanceID } from '../ids/index.js';
import { GraphicObject } from './types.js';
import { createError } from '../errors/index.js';
import { validateGraphicObject } from './validation.js';
import { isUUID } from '../ids/index.js';

function deepClone<T>(obj: T): T {
  // @ts-ignore
  if (typeof structuredClone === 'function') {
    // @ts-ignore
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

export interface ObjectStoreDependencies {
  hasGeometry: (id: GeometryID) => boolean;
  hasAppearance: (id: AppearanceID) => boolean;
}

export class ObjectStore {
  private store = new Map<string, GraphicObject>();
  private deps?: ObjectStoreDependencies;

  constructor(deps?: ObjectStoreDependencies) {
    this.deps = deps;
  }

  setDependencies(deps: ObjectStoreDependencies): void {
    this.deps = deps;
  }

  create(obj: GraphicObject): void {
    validateGraphicObject(obj);
    if (this.store.has(obj.id)) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `Duplicate ObjectID: ${obj.id}`, severity: 'error', context: { id: obj.id } });
    }
    // Referential integrity
    if (this.deps) {
      if (!this.deps.hasGeometry(obj.geometryRef)) {
        throw createError({ code: 'VALIDATION_SCHEMA', message: `Geometry not found for object: ${obj.geometryRef}`, severity: 'error', context: { geometryRef: obj.geometryRef } });
      }
      if (!this.deps.hasAppearance(obj.appearanceRef)) {
        throw createError({ code: 'VALIDATION_SCHEMA', message: `Appearance not found for object: ${obj.appearanceRef}`, severity: 'error', context: { appearanceRef: obj.appearanceRef } });
      }
    }
    this.store.set(obj.id, deepClone(obj));
  }

  get(id: ObjectID): GraphicObject | undefined {
    if (!isUUID(id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid ObjectID ${id}`, severity: 'error' });
    const obj = this.store.get(id);
    if (!obj) return undefined;
    return deepClone(obj);
  }

  has(id: ObjectID): boolean {
    return this.store.has(id);
  }

  update(id: ObjectID, patch: Partial<Omit<GraphicObject, 'id'>>): void {
    if (!isUUID(id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid ObjectID ${id}`, severity: 'error' });
    const existing = this.store.get(id);
    if (!existing) throw createError({ code: 'VALIDATION_SCHEMA', message: `Object not found: ${id}`, severity: 'error' });

    const updated: GraphicObject = {
      ...existing,
      ...patch,
      id: existing.id, // id immutable
      meta: { ...existing.meta, ...(patch.meta || {}) }
    } as GraphicObject;

    validateGraphicObject(updated);

    if (this.deps) {
      if (patch.geometryRef && !this.deps.hasGeometry(patch.geometryRef)) {
        throw createError({ code: 'VALIDATION_SCHEMA', message: `Geometry not found: ${patch.geometryRef}`, severity: 'error' });
      }
      if (patch.appearanceRef && !this.deps.hasAppearance(patch.appearanceRef)) {
        throw createError({ code: 'VALIDATION_SCHEMA', message: `Appearance not found: ${patch.appearanceRef}`, severity: 'error' });
      }
    }

    this.store.set(id, deepClone(updated));
  }

  delete(id: ObjectID): void {
    if (!isUUID(id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid ObjectID ${id}`, severity: 'error' });
    if (!this.store.has(id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Object not found: ${id}`, severity: 'error' });
    this.store.delete(id);
  }

  listIds(): ObjectID[] {
    return Array.from(this.store.keys()) as ObjectID[];
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  // Helpers for referential integrity checks from DocumentStore
  isGeometryReferenced(geometryId: GeometryID): boolean {
    for (const obj of this.store.values()) {
      if (obj.geometryRef === geometryId) return true;
    }
    return false;
  }

  isAppearanceReferenced(appearanceId: AppearanceID): boolean {
    for (const obj of this.store.values()) {
      if (obj.appearanceRef === appearanceId) return true;
    }
    return false;
  }

  listObjects(): GraphicObject[] {
    return Array.from(this.store.values()).map(o=>deepClone(o));
  }
}
