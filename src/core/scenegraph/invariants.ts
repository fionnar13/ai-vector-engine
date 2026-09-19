
import { NodeID, ObjectID } from '../ids/index.js';
import { SceneNode, MutableSceneNode } from './types.js';
import { createError } from '../errors/index.js';

export function assertNoSelfParent(nodeId: NodeID, parentId: NodeID | null): void {
  if (parentId && nodeId === parentId) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_SELF_PARENT: node cannot be its own parent: ${nodeId}`, severity: 'error' });
  }
}

export function assertNoDuplicateChildren(children: NodeID[]): void {
  const seen = new Set<string>();
  for (const c of children) {
    if (seen.has(c)) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_DUPLICATE_CHILD: duplicate child ${c}`, severity: 'error' });
    }
    seen.add(c);
  }
}

export function assertValidReferences(
  node: MutableSceneNode,
  hasNode: (id: NodeID) => boolean,
  hasObject?: (id: ObjectID) => boolean
): void {
  if (node.parent && !hasNode(node.parent)) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_PARENT_NOT_FOUND: parent ${node.parent} not found for node ${node.id}`, severity: 'error' });
  }
  for (const childId of node.children) {
    if (!hasNode(childId)) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_CHILD_NOT_FOUND: child ${childId} not found`, severity: 'error' });
    }
  }
  if (node.objectRef && hasObject && !hasObject(node.objectRef)) {
    throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_OBJECT_NOT_FOUND: object ${node.objectRef} not found`, severity: 'error' });
  }
}

export function assertParentChildConsistency(
  nodes: Map<string, MutableSceneNode>
): void {
  for (const [id, node] of nodes) {
    // Check parent's children contains this node
    if (node.parent) {
      const parent = nodes.get(node.parent);
      if (!parent) throw createError({ code: 'VALIDATION_SCHEMA', message: `Parent not found ${node.parent}`, severity: 'error' });
      if (!parent.children.includes(node.id as any)) {
        throw createError({ code: 'VALIDATION_SCHEMA', message: `Parent/child inconsistency: parent ${parent.id} does not contain child ${node.id}`, severity: 'error' });
      }
    }
    // Check children point back to this node
    for (const childId of node.children) {
      const child = nodes.get(childId);
      if (!child) continue;
      if (child.parent !== node.id) {
        throw createError({ code: 'VALIDATION_SCHEMA', message: `Child/parent inconsistency: child ${childId} parent ${child.parent} != ${node.id}`, severity: 'error' });
      }
    }
  }
}

export function detectCycle(
  nodes: Map<string, MutableSceneNode>,
  startId: NodeID,
  newParentId: NodeID | null
): boolean {
  if (!newParentId) return false;
  if (startId === newParentId) return true;
  // Walk up from newParent to root, if we encounter startId, cycle
  let current: NodeID | null = newParentId;
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current)) break; // prevent infinite if existing cycle (should not happen)
    visited.add(current);
    if (current === startId) return true;
    const node = nodes.get(current);
    if (!node) break;
    current = node.parent;
  }
  return false;
}
