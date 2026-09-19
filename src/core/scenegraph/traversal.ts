
import { NodeID } from '../ids/index.js';
import { SceneNode, MutableSceneNode } from './types.js';

export function traverseDepthFirst(
  nodes: Map<string, MutableSceneNode>,
  rootId?: NodeID,
  visit: (node: MutableSceneNode) => void = () => {}
): void {
  const visited = new Set<string>();
  function dfs(nodeId: NodeID) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodes.get(nodeId);
    if (!node) return;
    visit(node);
    for (const childId of node.children) {
      dfs(childId as NodeID);
    }
  }

  if (rootId) {
    dfs(rootId);
  } else {
    // Traverse all roots
    for (const [id, node] of nodes) {
      if (node.parent === null) {
        dfs(id as NodeID);
      }
    }
  }
}

export function getDescendants(
  nodes: Map<string, MutableSceneNode>,
  nodeId: NodeID
): NodeID[] {
  const result: NodeID[] = [];
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
        result.push(childId as NodeID);
        stack.push(childId as NodeID);
      }
    }
  }
  return result;
}

export function isAncestor(
  nodes: Map<string, MutableSceneNode>,
  ancestorId: NodeID,
  descendantId: NodeID
): boolean {
  let current: NodeID | null = descendantId;
  while (current) {
    const node = nodes.get(current);
    if (!node) break;
    if (node.parent === ancestorId) return true;
    current = node.parent;
    if (current === ancestorId) return true;
  }
  // Alternative walk up
  let cur = nodes.get(descendantId)?.parent;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = nodes.get(cur)?.parent ?? null;
  }
  return false;
}
