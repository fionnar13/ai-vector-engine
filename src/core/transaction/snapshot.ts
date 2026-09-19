
import { ObjectID, GeometryID, AppearanceID, NodeID } from '../ids/index.js';
import { GraphicObject } from '../stores/types.js';
import { Geometry } from '../geometry/types.js';
import { Appearance } from '../appearance/types.js';
import { SceneNode } from '../scenegraph/types.js';

function deepClone<T>(obj: T): T {
  // @ts-ignore
  if (typeof structuredClone === 'function') {
    // @ts-ignore
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

export interface DocumentSnapshot {
  readonly objects: ReadonlyMap<string, GraphicObject>;
  readonly geometries: ReadonlyMap<string, Geometry>;
  readonly appearances: ReadonlyMap<string, Appearance>;
  readonly nodes: ReadonlyMap<string, SceneNode>;
}

export function createSnapshot(
  objects: Map<string, GraphicObject>,
  geometries: Map<string, Geometry>,
  appearances: Map<string, Appearance>,
  nodes: Map<string, SceneNode>
): DocumentSnapshot {
  return {
    objects: new Map(Array.from(objects.entries()).map(([k,v]) => [k, deepClone(v)])),
    geometries: new Map(Array.from(geometries.entries()).map(([k,v]) => [k, deepClone(v)])),
    appearances: new Map(Array.from(appearances.entries()).map(([k,v]) => [k, deepClone(v)])),
    nodes: new Map(Array.from(nodes.entries()).map(([k,v]) => [k, deepClone(v)]))
  };
}

export function createEmptySnapshot(): DocumentSnapshot {
  return {
    objects: new Map(),
    geometries: new Map(),
    appearances: new Map(),
    nodes: new Map()
  };
}
