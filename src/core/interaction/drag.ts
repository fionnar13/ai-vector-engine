
import { NodeID } from '../ids/index.js';
import { Vec2, Matrix3x3 } from '../math/types.js';
import { DragState, InteractionConfig } from './types.js';

function identityMatrix(): Matrix3x3 {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

function translationMatrix(tx: number, ty: number): Matrix3x3 {
  return { a: 1, b: 0, c: 0, d: 1, tx, ty };
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

export class DragManager {
  private state: DragState;
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
      isDragging: false,
      dragThreshold: this.config.dragThreshold,
      startWorld: null,
      currentWorld: null,
      delta: { x: 0, y: 0 },
      initialTransforms: new Map(),
      previewTransform: null
    };
  }

  getState(): DragState {
    return {
      ...this.state,
      delta: { ...this.state.delta },
      initialTransforms: new Map(this.state.initialTransforms)
    };
  }

  startDrag(startWorld: Vec2, initialTransforms: Map<string, Matrix3x3>): void {
    this.state = {
      isDragging: false,
      dragThreshold: this.config.dragThreshold,
      startWorld: { ...startWorld },
      currentWorld: { ...startWorld },
      delta: { x: 0, y: 0 },
      initialTransforms: new Map(initialTransforms),
      previewTransform: identityMatrix()
    };
  }

  updateDrag(currentWorld: Vec2): boolean {
    if (!this.state.startWorld) return false;

    const delta = {
      x: currentWorld.x - this.state.startWorld.x,
      y: currentWorld.y - this.state.startWorld.y
    };

    const distance = Math.hypot(delta.x, delta.y);

    if (!this.state.isDragging && distance >= this.state.dragThreshold) {
      this.state = {
        ...this.state,
        isDragging: true,
        currentWorld: { ...currentWorld },
        delta,
        previewTransform: translationMatrix(delta.x, delta.y)
      };
      return true; // Drag started
    }

    if (this.state.isDragging) {
      this.state = {
        ...this.state,
        currentWorld: { ...currentWorld },
        delta,
        previewTransform: translationMatrix(delta.x, delta.y)
      };
      return true;
    }

    // Not yet dragging, but update currentWorld for threshold check
    this.state = {
      ...this.state,
      currentWorld: { ...currentWorld },
      delta
    };

    return false;
  }

  getPreviewTransforms(): Map<string, Matrix3x3> {
    const result = new Map<string, Matrix3x3>();
    if (!this.state.isDragging || !this.state.previewTransform) return result;

    for (const [nodeId, initial] of this.state.initialTransforms) {
      // Preview = initial + delta applied as translation
      // For move, we apply translation to initial transform
      // World = ParentWorld × Local, so moving means adding delta to Local tx/ty if Parent is identity, otherwise more complex
      // For MVP, we assume Parent is identity or we apply delta in world space as additional translation
      // Correct: newLocal = initial × translation? Actually move in world: newWorld = translation(delta) × oldWorld
      // So newLocal = ParentInv × newWorld = ParentInv × T(delta) × Parent × oldLocal
      // For simplicity when Parent is identity: newLocal = T(delta) × oldLocal
      // We'll use: previewLocal = T(delta) * initial
      const preview = multiplyMatrix(translationMatrix(this.state.delta.x, this.state.delta.y), initial);
      result.set(nodeId, preview);
    }

    return result;
  }

  getDelta(): Vec2 {
    return { ...this.state.delta };
  }

  isDragging(): boolean {
    return this.state.isDragging;
  }

  endDrag(): { delta: Vec2; initialTransforms: Map<string, Matrix3x3> } {
    const result = {
      delta: { ...this.state.delta },
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
      isDragging: false,
      dragThreshold: this.config.dragThreshold,
      startWorld: null,
      currentWorld: null,
      delta: { x: 0, y: 0 },
      initialTransforms: new Map(),
      previewTransform: null
    };
  }
}
