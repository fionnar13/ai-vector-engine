
import { Appearance, AppearanceItemID } from './types.js';
import { createError } from '../errors/index.js';

export function validateAppearanceGraph(appearance: Appearance): void {
  if (!appearance || !Array.isArray(appearance.stack)) throw createError({ code: 'VALIDATION_SCHEMA', message: 'Appearance stack missing', severity: 'error' });

  const seen = new Set<string>();
  const idToIndex = new Map<string, number>();

  for (let i = 0; i < appearance.stack.length; i++) {
    const item = appearance.stack[i];
    if (!item.id) throw createError({ code: 'VALIDATION_SCHEMA', message: `Item id missing at index ${i}`, severity: 'error' });
    if (seen.has(item.id)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Duplicate AppearanceItem ID: ${item.id}`, severity: 'error' });
    seen.add(item.id);
    idToIndex.set(item.id, i);

    if (item.type === 'effect') {
      const inputs = (item as any).inputs as AppearanceItemID[] | undefined;
      if (!Array.isArray(inputs)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Effect inputs must be array for ${item.id}`, severity: 'error' });

      // Check duplicate inputs
      const inputSeen = new Set<string>();
      for (const inp of inputs) {
        if (inputSeen.has(inp)) throw createError({ code: 'VALIDATION_SCHEMA', message: `Duplicate input ${inp} in effect ${item.id}`, severity: 'error' });
        inputSeen.add(inp);

        // Self-reference
        if (inp === item.id) throw createError({ code: 'VALIDATION_SCHEMA', message: `Self-reference in effect ${item.id}`, severity: 'error' });

        // Missing input
        if (!idToIndex.has(inp)) {
          const existsLater = appearance.stack.slice(i+1).some(it => it.id === inp);
          if (existsLater) {
            throw createError({ code: 'VALIDATION_SCHEMA', message: `Forward reference: ${item.id} -> ${inp} (must reference BEFORE)`, severity: 'error' });
          } else {
            throw createError({ code: 'VALIDATION_SCHEMA', message: `Missing input: effect ${item.id} references non-existent ${inp}`, severity: 'error' });
          }
        }
      }
    }
  }

  // Explicit DFS cycle detection (even though forward ref prevention guarantees acyclic)
  const graph = new Map<string, string[]>();
  for (const item of appearance.stack) {
    if (item.type === 'effect') {
      graph.set(item.id, [...(item.inputs as any)]);
    } else {
      graph.set(item.id, []);
    }
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    if (!visited.has(nodeId)) {
      visited.add(nodeId);
      recStack.add(nodeId);
      const neighbors = graph.get(nodeId) || [];
      for (const nb of neighbors) {
        if (!visited.has(nb) && hasCycle(nb)) return true;
        if (recStack.has(nb)) return true;
      }
    }
    recStack.delete(nodeId);
    return false;
  }

  for (const id of seen) {
    visited.clear();
    recStack.clear();
    // Need fresh visited per component? Actually we need global visited but we also need to detect cycle per path
    // For simplicity, we do global visited with recStack
  }
  // Global DFS
  const globalVisited = new Set<string>();
  const globalRec = new Set<string>();
  function dfsCycle(nodeId: string): boolean {
    if (!globalVisited.has(nodeId)) {
      globalVisited.add(nodeId);
      globalRec.add(nodeId);
      for (const nb of (graph.get(nodeId) || [])) {
        if (!globalVisited.has(nb) && dfsCycle(nb)) return true;
        if (globalRec.has(nb)) return true;
      }
    }
    globalRec.delete(nodeId);
    return false;
  }
  for (const id of seen) {
    if (dfsCycle(id)) {
      throw createError({ code: 'VALIDATION_SCHEMA', message: `Cycle detected involving ${id}`, severity: 'error' });
    }
  }
}
