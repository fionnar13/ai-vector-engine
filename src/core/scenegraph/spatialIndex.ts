
import { NodeID } from '../ids/index.js';

export type BBox = { minX: number, minY: number, maxX: number, maxY: number };

export interface SpatialIndex {
  insert(nodeId: NodeID, bbox: BBox): void;
  update(nodeId: NodeID, newBBox: BBox): void;
  delete(nodeId: NodeID): void;
  query(bbox: BBox): NodeID[];
  queryPoint(point: { x: number, y: number }, tolerance: number): NodeID[];
  clear(): void;
  rebuild(): void;
  size(): number;
}

// Simple deterministic R-tree-like implementation for MVP
// For production, this could be replaced with RBush, but for MVP we use linear scan with deterministic ordering
// Correctness > performance, with rebuild capability and stale fallback support

export class SimpleSpatialIndex implements SpatialIndex {
  private entries = new Map<string, BBox>();
  private rebuildCallback?: () => void;

  constructor(rebuildCallback?: () => void) {
    this.rebuildCallback = rebuildCallback;
  }

  insert(nodeId: NodeID, bbox: BBox): void {
    if (!bbox || ![bbox.minX, bbox.minY, bbox.maxX, bbox.maxY].every(Number.isFinite)) {
      throw new Error(`BBOX_INVALID: ${JSON.stringify(bbox)}`);
    }
    this.entries.set(nodeId, { ...bbox });
  }

  update(nodeId: NodeID, newBBox: BBox): void {
    if (!this.entries.has(nodeId)) {
      // If not exists, insert
      this.insert(nodeId, newBBox);
      return;
    }
    this.entries.set(nodeId, { ...newBBox });
  }

  delete(nodeId: NodeID): void {
    this.entries.delete(nodeId);
  }

  query(bbox: BBox): NodeID[] {
    const result: NodeID[] = [];
    for (const [id, entryBBox] of this.entries) {
      if (intersects(entryBBox, bbox)) {
        result.push(id as NodeID);
      }
    }
    // Deterministic ordering: sort by NodeID string for determinism
    // But per spec, prefer SceneGraph traversal order - for MVP we sort for determinism
    // In production with SceneGraph integration, we could order by traversal
    return result.sort();
  }

  queryPoint(point: { x: number, y: number }, tolerance: number): NodeID[] {
    const queryBBox: BBox = {
      minX: point.x - tolerance,
      minY: point.y - tolerance,
      maxX: point.x + tolerance,
      maxY: point.y + tolerance
    };
    return this.query(queryBBox);
  }

  clear(): void {
    this.entries.clear();
  }

  rebuild(): void {
    if (this.rebuildCallback) {
      this.clear();
      this.rebuildCallback();
    }
  }

  size(): number {
    return this.entries.size;
  }

  // For stale fallback testing
  getAllEntries(): Map<string, BBox> {
    return new Map(this.entries);
  }
}

function intersects(a: BBox, b: BBox): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export function createSpatialIndex(rebuildCallback?: () => void): SpatialIndex {
  return new SimpleSpatialIndex(rebuildCallback);
}
