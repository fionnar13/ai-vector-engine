
import { NodeID, ObjectID, createNodeID } from '../ids/index.js';
import { Matrix3x3, identity, multiply, translation, scale, rotationDegrees } from '../math/matrix3x3.js';
import { SceneNode, MutableSceneNode } from './types.js';
import { assertNoDuplicateChildren, detectCycle, assertParentChildConsistency } from './invariants.js';
import { getDescendants, isAncestor, traverseDepthFirst } from './traversal.js';
import { getWorldTransform, invalidateCache } from './transform.js';
import { createError } from '../errors/index.js';
import { isUUID } from '../ids/index.js';

function cloneForPublic(node: MutableSceneNode): SceneNode {
  return {
    id: node.id,
    objectRef: node.objectRef,
    parent: node.parent,
    children: [...node.children],
    localTransform: { ...node.localTransform }
  };
}

export interface SceneGraphDependencies {
  hasObject: (id: ObjectID) => boolean;
}

export class SceneGraph {
  private nodes = new Map<string, MutableSceneNode>();
  private objectToNode = new Map<string, NodeID>();
  private worldTransformCache = new Map<string, Matrix3x3>();
  private deps?: SceneGraphDependencies;
  private allowInstancing: boolean;

  constructor(deps?: SceneGraphDependencies, allowInstancing: boolean = false) {
    this.deps = deps;
    this.allowInstancing = allowInstancing;
  }

  setDependencies(deps: SceneGraphDependencies): void {
    this.deps = deps;
  }

  createRoot(objectRef: ObjectID | null = null, localTransform: Matrix3x3 = identity()): SceneNode {
    const id = createNodeID();
    const node: MutableSceneNode = {
      id,
      objectRef,
      parent: null,
      children: [],
      localTransform: { ...localTransform }
    };
    this.validateNodeCreation(node);
    this.nodes.set(id, node);
    if (objectRef) this.trackObjectMapping(objectRef, id);
    return cloneForPublic(node);
  }

  createNode(objectRef: ObjectID | null, parentId: NodeID | null = null, localTransform: Matrix3x3 = identity()): SceneNode {
    const id = createNodeID();
    const node: MutableSceneNode = {
      id,
      objectRef,
      parent: parentId,
      children: [],
      localTransform: { ...localTransform }
    };
    this.validateNodeCreation(node);

    if (parentId) {
      const parent = this.nodes.get(parentId);
      if (!parent) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_PARENT_NOT_FOUND: ${parentId}`, severity: 'error' });
      if (detectCycle(this.nodes, id, parentId)) {
        throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_CYCLE: creating node ${id} with parent ${parentId} would create cycle`, severity: 'error' });
      }
      parent.children.push(id);
    }

    this.nodes.set(id, node);
    if (objectRef) this.trackObjectMapping(objectRef, id);
    this.worldTransformCache.delete(id);
    return cloneForPublic(node);
  }

  createGroup(parentId: NodeID | null = null, localTransform: Matrix3x3 = identity()): SceneNode {
    return this.createNode(null, parentId, localTransform);
  }

  private validateNodeCreation(node: MutableSceneNode): void {
    if (!isUUID(node.id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid NodeID ${node.id}`, severity: 'error' });
    if (node.objectRef && !isUUID(node.objectRef)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid ObjectID ${node.objectRef}`, severity: 'error' });
    if (node.parent && !isUUID(node.parent)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid Parent NodeID ${node.parent}`, severity: 'error' });
    if (!node.localTransform || ![node.localTransform.a, node.localTransform.b, node.localTransform.c, node.localTransform.d, node.localTransform.tx, node.localTransform.ty].every(Number.isFinite)) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `TRANSFORM_INVALID: matrix not finite`, severity: 'error' });
    }
    const det = node.localTransform.a * node.localTransform.d - node.localTransform.b * node.localTransform.c;
    if (Math.abs(det) < 1e-12) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `TRANSFORM_SINGULAR: determinant ${det}`, severity: 'error' });
    }
    if (this.deps && node.objectRef && !this.deps.hasObject(node.objectRef)) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_OBJECT_NOT_FOUND: ${node.objectRef}`, severity: 'error' });
    }
    if (!this.allowInstancing && node.objectRef && this.objectToNode.has(node.objectRef)) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_OBJECT_ALREADY_ATTACHED: object ${node.objectRef} already attached to node ${this.objectToNode.get(node.objectRef)}`, severity: 'error' });
    }
  }

  private trackObjectMapping(objectId: ObjectID, nodeId: NodeID): void {
    if (!this.allowInstancing) {
      if (this.objectToNode.has(objectId)) {
        throw createError({ code: 'VALIDATION_SCHEMA', message: `Object ${objectId} already attached`, severity: 'error' });
      }
      this.objectToNode.set(objectId, nodeId);
    }
  }

  private untrackObjectMapping(objectId: ObjectID | null): void {
    if (objectId && this.objectToNode.has(objectId)) {
      this.objectToNode.delete(objectId);
    }
  }

  findNode(nodeId: NodeID): SceneNode | undefined {
    const node = this.nodes.get(nodeId);
    return node ? cloneForPublic(node) : undefined;
  }

  findNodeByObjectId(objectId: ObjectID): SceneNode | undefined {
    const nodeId = this.objectToNode.get(objectId);
    if (!nodeId) {
      for (const node of this.nodes.values()) {
        if (node.objectRef === objectId) return cloneForPublic(node);
      }
      return undefined;
    }
    return this.findNode(nodeId);
  }

  getParent(nodeId: NodeID): SceneNode | undefined {
    const node = this.nodes.get(nodeId);
    if (!node || !node.parent) return undefined;
    return this.findNode(node.parent);
  }

  getChildren(nodeId: NodeID): SceneNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_NODE_NOT_FOUND: ${nodeId}`, severity: 'error' });
    return node.children.map(cid => this.findNode(cid as NodeID)!).filter(Boolean);
  }

  getRootNodes(): SceneNode[] {
    const roots: SceneNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.parent === null) roots.push(cloneForPublic(node));
    }
    return roots;
  }

  isAncestor(ancestorId: NodeID, nodeId: NodeID): boolean {
    return isAncestor(this.nodes, ancestorId, nodeId);
  }

  isDescendant(nodeId: NodeID, ancestorId: NodeID): boolean {
    return isAncestor(this.nodes, ancestorId, nodeId);
  }

  traverseDepthFirst(rootId?: NodeID, visit?: (node: SceneNode) => void): void {
    traverseDepthFirst(this.nodes, rootId, (internalNode) => {
      if (visit) visit(cloneForPublic(internalNode));
    });
  }

  removeNode(nodeId: NodeID): void {
    const node = this.nodes.get(nodeId);
    if (!node) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_NODE_NOT_FOUND: ${nodeId}`, severity: 'error' });

    if (node.parent) {
      const parent = this.nodes.get(node.parent);
      if (parent) parent.children = parent.children.filter(c => c !== nodeId);
    }

    const descendants = getDescendants(this.nodes, nodeId);
    for (const descId of descendants) {
      const descNode = this.nodes.get(descId);
      if (descNode) {
        this.untrackObjectMapping(descNode.objectRef);
        this.nodes.delete(descId);
        this.worldTransformCache.delete(descId);
      }
    }

    this.untrackObjectMapping(node.objectRef);
    this.nodes.delete(nodeId);
    this.worldTransformCache.delete(nodeId);
  }

  reparent(nodeId: NodeID, newParentId: NodeID | null): void {
    const node = this.nodes.get(nodeId);
    if (!node) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_NODE_NOT_FOUND: ${nodeId}`, severity: 'error' });
    if (newParentId === nodeId) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_SELF_PARENT`, severity: 'error' });

    if (newParentId) {
      const newParent = this.nodes.get(newParentId);
      if (!newParent) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_PARENT_NOT_FOUND: ${newParentId}`, severity: 'error' });
      if (detectCycle(this.nodes, nodeId, newParentId)) {
        throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_CYCLE: reparenting ${nodeId} to ${newParentId} would create cycle`, severity: 'error' });
      }
      if (newParent.children.includes(nodeId)) {
        throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_DUPLICATE_CHILD`, severity: 'error' });
      }
    }

    if (node.parent) {
      const oldParent = this.nodes.get(node.parent);
      if (oldParent) oldParent.children = oldParent.children.filter(c => c !== nodeId);
    }

    if (newParentId) {
      const newParent = this.nodes.get(newParentId)!;
      newParent.children.push(nodeId);
    }

    node.parent = newParentId;
    invalidateCache(this.worldTransformCache, this.nodes, nodeId);
  }

  appendChild(parentId: NodeID, childId: NodeID): void {
    const parent = this.nodes.get(parentId);
    const child = this.nodes.get(childId);
    if (!parent) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_PARENT_NOT_FOUND: ${parentId}`, severity: 'error' });
    if (!child) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_NODE_NOT_FOUND: ${childId}`, severity: 'error' });
    if (parent.children.includes(childId)) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_DUPLICATE_CHILD`, severity: 'error' });
    if (detectCycle(this.nodes, childId, parentId)) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_CYCLE`, severity: 'error' });

    if (child.parent) {
      const oldParent = this.nodes.get(child.parent);
      if (oldParent) oldParent.children = oldParent.children.filter(c => c !== childId);
    }

    parent.children.push(childId);
    child.parent = parentId;
    invalidateCache(this.worldTransformCache, this.nodes, childId);
  }

  insertChild(parentId: NodeID, childId: NodeID, index: number): void {
    const parent = this.nodes.get(parentId);
    const child = this.nodes.get(childId);
    if (!parent) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_PARENT_NOT_FOUND`, severity: 'error' });
    if (!child) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_NODE_NOT_FOUND`, severity: 'error' });
    if (index < 0 || index > parent.children.length) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid index ${index}`, severity: 'error' });
    if (parent.children.includes(childId)) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_DUPLICATE_CHILD`, severity: 'error' });
    if (detectCycle(this.nodes, childId, parentId)) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_CYCLE`, severity: 'error' });

    if (child.parent) {
      const oldParent = this.nodes.get(child.parent);
      if (oldParent) oldParent.children = oldParent.children.filter(c => c !== childId);
    }

    parent.children.splice(index, 0, childId);
    child.parent = parentId;
    invalidateCache(this.worldTransformCache, this.nodes, childId);
  }

  removeChild(parentId: NodeID, childId: NodeID): void {
    const parent = this.nodes.get(parentId);
    if (!parent) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_PARENT_NOT_FOUND`, severity: 'error' });
    if (!parent.children.includes(childId)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Child not found in parent`, severity: 'error' });

    parent.children = parent.children.filter(c => c !== childId);
    const child = this.nodes.get(childId);
    if (child) {
      child.parent = null;
      invalidateCache(this.worldTransformCache, this.nodes, childId);
    }
  }

  moveChild(parentId: NodeID, childId: NodeID, newIndex: number): void {
    const parent = this.nodes.get(parentId);
    if (!parent) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_PARENT_NOT_FOUND`, severity: 'error' });
    const oldIndex = parent.children.indexOf(childId);
    if (oldIndex === -1) throw createError({ code: 'VALIDATION_SCHEMA', message: `Child not found`, severity: 'error' });
    if (newIndex < 0 || newIndex >= parent.children.length) throw createError({ code: 'VALIDATION_SCHEMA', message: `Invalid newIndex`, severity: 'error' });

    parent.children.splice(oldIndex, 1);
    parent.children.splice(newIndex, 0, childId);
  }

  getWorldTransform(nodeId: NodeID): Matrix3x3 {
    return getWorldTransform(this.nodes, nodeId, this.worldTransformCache);
  }

  setLocalTransform(nodeId: NodeID, matrix: Matrix3x3): void {
    const node = this.nodes.get(nodeId);
    if (!node) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_NODE_NOT_FOUND`, severity: 'error' });
    if (![matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty].every(Number.isFinite)) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `TRANSFORM_INVALID`, severity: 'error' });
    }
    const det = matrix.a * matrix.d - matrix.b * matrix.c;
    if (Math.abs(det) < 1e-12) throw createError({ code: 'VALIDATION_SCHEMA', message: `TRANSFORM_SINGULAR`, severity: 'error' });
    node.localTransform = { ...matrix };
    invalidateCache(this.worldTransformCache, this.nodes, nodeId);
  }

  translateNode(nodeId: NodeID, dx: number, dy: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_NODE_NOT_FOUND`, severity: 'error' });
    const t = translation(dx, dy);
    const newLocal = multiply(node.localTransform, t);
    node.localTransform = newLocal;
    invalidateCache(this.worldTransformCache, this.nodes, nodeId);
  }

  scaleNode(nodeId: NodeID, sx: number, sy: number = sx, pivot?: { x: number, y: number }): void {
    const node = this.nodes.get(nodeId);
    if (!node) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_NODE_NOT_FOUND`, severity: 'error' });
    let m: Matrix3x3;
    if (pivot) {
      const t1 = translation(-pivot.x, -pivot.y);
      const s = scale(sx, sy);
      const t2 = translation(pivot.x, pivot.y);
      m = multiply(multiply(t2, s), t1);
    } else {
      m = scale(sx, sy);
    }
    const newLocal = multiply(node.localTransform, m);
    node.localTransform = newLocal;
    invalidateCache(this.worldTransformCache, this.nodes, nodeId);
  }

  rotateNode(nodeId: NodeID, degrees: number, pivot?: { x: number, y: number }): void {
    const node = this.nodes.get(nodeId);
    if (!node) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_NODE_NOT_FOUND`, severity: 'error' });
    let m: Matrix3x3;
    if (pivot) {
      const t1 = translation(-pivot.x, -pivot.y);
      const r = rotationDegrees(degrees);
      const t2 = translation(pivot.x, pivot.y);
      m = multiply(multiply(t2, r), t1);
    } else {
      m = rotationDegrees(degrees);
    }
    const newLocal = multiply(node.localTransform, m);
    node.localTransform = newLocal;
    invalidateCache(this.worldTransformCache, this.nodes, nodeId);
  }

  transformNode(nodeId: NodeID, transform: Matrix3x3): void {
    const node = this.nodes.get(nodeId);
    if (!node) throw createError({ code: 'VALIDATION_SCHEMA', message: `SCENE_NODE_NOT_FOUND`, severity: 'error' });
    const newLocal = multiply(node.localTransform, transform);
    node.localTransform = newLocal;
    invalidateCache(this.worldTransformCache, this.nodes, nodeId);
  }

  getWorldTransformCache(): Map<string, Matrix3x3> {
    return new Map(this.worldTransformCache);
  }

  clearWorldTransformCache(): void {
    this.worldTransformCache.clear();
  }

  size(): number {
    return this.nodes.size;
  }

  getAllNodes(): SceneNode[] {
    return Array.from(this.nodes.values()).map(n => ({
      id: n.id,
      objectRef: n.objectRef,
      parent: n.parent,
      children: [...n.children],
      localTransform: { ...n.localTransform }
    }));
  }

  validateInvariants(): void {
    assertParentChildConsistency(this.nodes);
    for (const node of this.nodes.values()) {
      assertNoDuplicateChildren(node.children as any);
    }
  }

  // For testing: get internal nodes map size
  getCacheSize(): number {
    return this.worldTransformCache.size;
  }
}
