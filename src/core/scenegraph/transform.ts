
import { NodeID } from '../ids/index.js';
import { Matrix3x3, identity, multiply, inverse, isInvertible, transformPoint } from '../math/matrix3x3.js';
import { MutableSceneNode } from './types.js';
import { createError } from '../errors/index.js';
import { Vec2 } from '../math/vec2.js';
import { BBox } from '../math/bbox.js';
import { Geometry } from '../geometry/types.js';

export function getWorldTransform(
  nodes: Map<string, MutableSceneNode>,
  nodeId: NodeID,
  cache?: Map<string, Matrix3x3>
): Matrix3x3 {
  if (cache && cache.has(nodeId)) {
    return cache.get(nodeId)!;
  }

  const node = nodes.get(nodeId);
  if (!node) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_NODE_NOT_FOUND: ${nodeId}`, severity: 'error' });

  let world: Matrix3x3;
  if (node.parent === null) {
    world = node.localTransform;
  } else {
    const parentWorld = getWorldTransform(nodes, node.parent, cache);
    world = multiply(parentWorld, node.localTransform);
  }

  if (cache) cache.set(nodeId, world);
  return world;
}

export function invalidateCache(
  cache: Map<string, Matrix3x3>,
  nodes: Map<string, MutableSceneNode>,
  nodeId: NodeID
): void {
  // Invalidate node + descendants
  cache.delete(nodeId);
  const stack: NodeID[] = [nodeId];
  const visited = new Set<string>();
  visited.add(nodeId);
  while (stack.length > 0) {
    const current = stack.pop()!;
    const node = nodes.get(current);
    if (!node) continue;
    for (const childId of node.children) {
      if (!visited.has(childId)) {
        visited.add(childId);
        cache.delete(childId);
        stack.push(childId as NodeID);
      }
    }
  }
}

export function computeWorldBBox(
  worldTransform: Matrix3x3,
  geometry: Geometry | null,
  getGeometryBBox: (geom: Geometry) => { minX: number, minY: number, maxX: number, maxY: number } | null
): { minX: number, minY: number, maxX: number, maxY: number } | null {
  if (!geometry) return null;
  const localBBox = getGeometryBBox(geometry);
  if (!localBBox) return null;

  // Transform BBox using existing BBox.transform logic
  // For MVP, transform 4 corners
  const corners = [
    { x: localBBox.minX, y: localBBox.minY },
    { x: localBBox.maxX, y: localBBox.minY },
    { x: localBBox.minX, y: localBBox.maxY },
    { x: localBBox.maxX, y: localBBox.maxY }
  ] as Vec2[];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    const wp = transformPoint(worldTransform, c);
    minX = Math.min(minX, wp.x);
    minY = Math.min(minY, wp.y);
    maxX = Math.max(maxX, wp.x);
    maxY = Math.max(maxY, wp.y);
  }
  return { minX, minY, maxX, maxY };
}

export function transformPointWithWorld(
  nodes: Map<string, MutableSceneNode>,
  nodeId: NodeID,
  point: Vec2,
  cache?: Map<string, Matrix3x3>
): Vec2 {
  const world = getWorldTransform(nodes, nodeId, cache);
  return transformPoint(world, point);
}
