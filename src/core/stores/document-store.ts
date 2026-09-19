
import { DocumentID, createDocumentID } from '../ids/index.js';
import { ObjectStore } from './object-store.js';
import { GeometryStore } from './geometry-store.js';
import { AppearanceStore } from './appearance-store.js';
import { GraphicObject } from './types.js';
import { Geometry } from '../geometry/types.js';
import { Appearance } from './types.js';
import { ObjectID, GeometryID, AppearanceID } from '../ids/index.js';

export class DocumentStore {
  readonly id: DocumentID;
  readonly objectStore: ObjectStore;
  readonly geometryStore: GeometryStore;
  readonly appearanceStore: AppearanceStore;

  constructor(id?: DocumentID) {
    this.id = id ?? createDocumentID();
    this.geometryStore = new GeometryStore();
    this.appearanceStore = new AppearanceStore();
    this.objectStore = new ObjectStore({
      hasGeometry: (gid: GeometryID) => this.geometryStore.has(gid),
      hasAppearance: (aid: AppearanceID) => this.appearanceStore.has(aid)
    });
  }

  // High-level creation with integrity enforced
  createGeometry(id: GeometryID, geom: Geometry): void {
    this.geometryStore.create(id, geom);
  }

  createAppearance(id: AppearanceID, app: Appearance): void {
    this.appearanceStore.create(id, app);
  }

  createObject(obj: GraphicObject): void {
    this.objectStore.create(obj);
  }

  deleteGeometry(id: GeometryID): void {
    this.geometryStore.delete(id, (gid) => this.objectStore.isGeometryReferenced(gid));
  }

  deleteAppearance(id: AppearanceID): void {
    this.appearanceStore.delete(id, (aid) => this.objectStore.isAppearanceReferenced(aid));
  }

  deleteObject(id: ObjectID): void {
    this.objectStore.delete(id);
  }

  // Safe reads
  getObject(id: ObjectID) { return this.objectStore.get(id); }
  getGeometry(id: GeometryID) { return this.geometryStore.get(id); }
  getAppearance(id: AppearanceID) { return this.appearanceStore.get(id); }

  size(): { objects: number, geometries: number, appearances: number } {
    return {
      objects: this.objectStore.size(),
      geometries: this.geometryStore.size(),
      appearances: this.appearanceStore.size()
    };
  }

  clear(): void {
    this.objectStore.clear();
    this.geometryStore.clear();
    this.appearanceStore.clear();
  }
}
