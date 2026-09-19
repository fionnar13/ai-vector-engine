
import { Vec2, Matrix3x3 } from '../math/types.js';
import { BBox } from '../geometry/types.js';
import { TransformInteractionState, InteractionConfig, Handle } from './types.js';
import { NodeID } from '../ids/index.js';

function identityMatrix(): Matrix3x3 {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

function translationMatrix(tx: number, ty: number): Matrix3x3 {
  return { a: 1, b: 0, c: 0, d: 1, tx, ty };
}

function scaleMatrix(sx: number, sy: number): Matrix3x3 {
  return { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
}

function rotationMatrix(degrees: number): Matrix3x3 {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, tx: 0, ty: 0 };
}

function multiplyMatrix(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    tx: a.a * b.tx + a.c * b.ty + a.tx,
    ty: a.b * b.tx + a.d * b.ty + a.ty
  };
}

function invertMatrix(m: Matrix3x3): Matrix3x3 {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return identityMatrix();
  const invDet = 1 / det;
  return {
    a: m.d * invDet,
    b: -m.b * invDet,
    c: -m.c * invDet,
    d: m.a * invDet,
    tx: (m.c * m.ty - m.d * m.tx) * invDet,
    ty: (m.b * m.tx - m.a * m.ty) * invDet
  };
}

function applyMatrix(m: Matrix3x3, v: Vec2): Vec2 {
  return { x: m.a * v.x + m.c * v.y + m.tx, y: m.b * v.x + m.d * v.y + m.ty };
}

function calculateBBoxCenter(bbox: BBox): Vec2 {
  return { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
}

export class TransformInteractionManager {
  private state: TransformInteractionState;
  private config: InteractionConfig;

  constructor(config: Partial<InteractionConfig> = {}) {
    this.config = {
      hitTolerance: config.hitTolerance ?? 5,
      dragThreshold: config.dragThreshold ?? 3,
      anchorHitTolerance: config.anchorHitTolerance ?? 8,
      handleHitTolerance: config.handleHitTolerance ?? 8,
      keyboardMoveStep: config.keyboardMoveStep ?? 1,
      keyboardMoveStepShift: config.keyboardMoveStepShift ?? 10,
      selectionMode: config.selectionMode ?? 'intersects',
      allowLockedSelection: config.allowLockedSelection ?? false,
      allowHiddenSelection: config.allowHiddenSelection ?? false,
      pivotMode: config.pivotMode ?? 'selectionCenter'
    };
    this.state = {
      isActive: false,
      mode: null,
      pivot: null,
      initialBounds: null,
      initialTransforms: new Map(),
      previewMatrix: null
    };
  }

  getState(): TransformInteractionState {
    return {
      ...this.state,
      pivot: this.state.pivot ? { ...this.state.pivot } : null,
      initialBounds: this.state.initialBounds ? { ...this.state.initialBounds } : null,
      initialTransforms: new Map(this.state.initialTransforms),
      previewMatrix: this.state.previewMatrix ? { ...this.state.previewMatrix } : null
    };
  }

  startTransform(
    mode: 'move' | 'scale' | 'rotate',
    pivot: Vec2,
    initialBounds: BBox,
    initialTransforms: Map<string, Matrix3x3>
  ): void {
    this.state = {
      isActive: true,
      mode,
      pivot: { ...pivot },
      initialBounds: { ...initialBounds },
      initialTransforms: new Map(initialTransforms),
      previewMatrix: identityMatrix()
    };
  }

  updateMove(delta: Vec2): void {
    if (!this.state.isActive || this.state.mode !== 'move') return;
    this.state = {
      ...this.state,
      previewMatrix: translationMatrix(delta.x, delta.y)
    };
  }

  updateScale(scaleX: number, scaleY: number, pivot?: Vec2, uniform = false): void {
    if (!this.state.isActive || this.state.mode !== 'scale') return;

    const p = pivot || this.state.pivot || { x: 0, y: 0 };

    if (uniform) {
      const avg = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
      scaleX = Math.sign(scaleX) * avg;
      scaleY = Math.sign(scaleY) * avg;
    }

    // T(pivot) * Scale * T(-pivot)
    const toOrigin = translationMatrix(-p.x, -p.y);
    const scale = scaleMatrix(scaleX, scaleY);
    const back = translationMatrix(p.x, p.y);

    const matrix = multiplyMatrix(multiplyMatrix(back, scale), toOrigin);

    this.state = {
      ...this.state,
      previewMatrix: matrix
    };
  }

  updateRotate(degrees: number, pivot?: Vec2): void {
    if (!this.state.isActive || this.state.mode !== 'rotate') return;

    const p = pivot || this.state.pivot || { x: 0, y: 0 };

    // T(pivot) * Rotate * T(-pivot)
    const toOrigin = translationMatrix(-p.x, -p.y);
    const rot = rotationMatrix(degrees);
    const back = translationMatrix(p.x, p.y);

    const matrix = multiplyMatrix(multiplyMatrix(back, rot), toOrigin);

    this.state = {
      ...this.state,
      previewMatrix: matrix
    };
  }

  getPreviewTransforms(): Map<string, Matrix3x3> {
    const result = new Map<string, Matrix3x3>();
    if (!this.state.isActive || !this.state.previewMatrix) return result;

    for (const [nodeId, initial] of this.state.initialTransforms) {
      // Preview = previewMatrix * initial
      const preview = multiplyMatrix(this.state.previewMatrix, initial);
      result.set(nodeId, preview);
    }

    return result;
  }

  getPreviewMatrix(): Matrix3x3 | null {
    return this.state.previewMatrix ? { ...this.state.previewMatrix } : null;
  }

  isActive(): boolean {
    return this.state.isActive;
  }

  endTransform(): { mode: 'move' | 'scale' | 'rotate' | null; matrix: Matrix3x3 | null; initialTransforms: Map<string, Matrix3x3> } {
    const result = {
      mode: this.state.mode,
      matrix: this.state.previewMatrix ? { ...this.state.previewMatrix } : null,
      initialTransforms: new Map(this.state.initialTransforms)
    };
    this.reset();
    return result;
  }

  cancel(): void {
    this.reset();
  }

  reset(): void {
    this.state = {
      isActive: false,
      mode: null,
      pivot: null,
      initialBounds: null,
      initialTransforms: new Map(),
      previewMatrix: null
    };
  }

  // Calculate selection bounds center
  static calculateSelectionBoundsCenter(bboxes: BBox[]): Vec2 {
    if (bboxes.length === 0) return { x: 0, y: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const bbox of bboxes) {
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }

  static calculateSelectionBounds(bboxes: BBox[]): BBox {
    if (bboxes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const bbox of bboxes) {
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    }
    return { minX, minY, maxX, maxY };
  }

  // Transform handles for selection visualization
  static calculateHandles(bounds: BBox): Handle[] {
    const { minX, minY, maxX, maxY } = bounds;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    return [
      { kind: 'top-left', position: { x: minX, y: minY }, worldPosition: { x: minX, y: minY } },
      { kind: 'top-center', position: { x: midX, y: minY }, worldPosition: { x: midX, y: minY } },
      { kind: 'top-right', position: { x: maxX, y: minY }, worldPosition: { x: maxX, y: minY } },
      { kind: 'middle-left', position: { x: minX, y: midY }, worldPosition: { x: minX, y: midY } },
      { kind: 'middle-right', position: { x: maxX, y: midY }, worldPosition: { x: maxX, y: midY } },
      { kind: 'bottom-left', position: { x: minX, y: maxY }, worldPosition: { x: minX, y: maxY } },
      { kind: 'bottom-center', position: { x: midX, y: maxY }, worldPosition: { x: midX, y: maxY } },
      { kind: 'bottom-right', position: { x: maxX, y: maxY }, worldPosition: { x: maxX, y: maxY } },
      { kind: 'rotation', position: { x: midX, y: minY - 30 }, worldPosition: { x: midX, y: minY - 30 } }
    ];
  }

  static hitTestHandles(point: Vec2, handles: Handle[], tolerance: number): Handle | null {
    let closest: Handle | null = null;
    let minDist = Infinity;
    for (const handle of handles) {
      const dist = Math.hypot(point.x - handle.worldPosition.x, point.y - handle.worldPosition.y);
      if (dist <= tolerance && dist < minDist) {
        minDist = dist;
        closest = handle;
      }
    }
    return closest;
  }
}
