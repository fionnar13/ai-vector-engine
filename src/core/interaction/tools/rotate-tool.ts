
import { InteractionTool, PointerInput, KeyboardInput } from '../types.js';
import { SelectionManager } from '../selection.js';
import { TransformInteractionManager } from '../transform-interaction.js';
import { ViewportTransform } from '../viewport.js';
import { Matrix3x3, Vec2 } from '../../math/types.js';
import { BBox } from '../../geometry/types.js';

export interface RotateToolCallbacks {
  onTransformStart?: (mode: 'rotate', pivot: Vec2, bounds: BBox, initialTransforms: Map<string, Matrix3x3>) => void;
  onTransformUpdate?: (previewTransforms: Map<string, Matrix3x3>, previewMatrix: Matrix3x3 | null) => void;
  onTransformEnd?: (matrix: Matrix3x3 | null, initialTransforms: Map<string, Matrix3x3>) => void;
  onTransformCancel?: () => void;
}

export class RotateTool implements InteractionTool {
  readonly id = 'rotate';

  private selection: SelectionManager;
  private transformManager: TransformInteractionManager;
  private viewport: ViewportTransform;
  private stores: any;
  private callbacks: RotateToolCallbacks;
  private startWorld: Vec2 | null = null;
  private pivot: Vec2 | null = null;
  private initialAngle: number = 0;

  constructor(
    selection: SelectionManager,
    transformManager: TransformInteractionManager,
    viewport: ViewportTransform,
    stores: any,
    callbacks: RotateToolCallbacks = {}
  ) {
    this.selection = selection;
    this.transformManager = transformManager;
    this.viewport = viewport;
    this.stores = stores;
    this.callbacks = callbacks;
  }

  private getSelectionBounds(): BBox | null {
    const selected = this.selection.getState().selectedNodeIds;
    if (selected.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const nodeId of selected) {
      const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
      if (!sceneNode) continue;
      const world = this.stores.sceneGraph.getWorldTransform
        ? this.stores.sceneGraph.getWorldTransform(nodeId as string)
        : sceneNode.localTransform;
      const bbox: BBox = { minX: world.tx, minY: world.ty, maxX: world.tx + 10, maxY: world.ty + 10 };
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    }
    if (!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  }

  pointerDown(input: PointerInput): void {
    const worldPos = this.viewport.screenToWorld(input.position);
    const bounds = this.getSelectionBounds();
    if (!bounds) return;

    const handles = TransformInteractionManager.calculateHandles(bounds);
    const hitHandle = TransformInteractionManager.hitTestHandles(worldPos, handles, 15);

    if (hitHandle && hitHandle.kind === 'rotation') {
      this.startWorld = { ...worldPos };
      this.pivot = TransformInteractionManager.calculateSelectionBoundsCenter([bounds]);
      this.initialAngle = Math.atan2(worldPos.y - this.pivot.y, worldPos.x - this.pivot.x) * 180 / Math.PI;

      const initialTransforms = new Map<string, Matrix3x3>();
      for (const nodeId of this.selection.getState().selectedNodeIds) {
        const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
        if (sceneNode) {
          initialTransforms.set(nodeId as string, { ...sceneNode.localTransform });
        }
      }

      this.transformManager.startTransform('rotate', this.pivot, bounds, initialTransforms);

      if (this.callbacks.onTransformStart) {
        this.callbacks.onTransformStart('rotate', this.pivot, bounds, initialTransforms);
      }
    }
  }

  pointerMove(input: PointerInput): void {
    if (!this.startWorld || !this.pivot) return;

    const worldPos = this.viewport.screenToWorld(input.position);
    const currentAngle = Math.atan2(worldPos.y - this.pivot.y, worldPos.x - this.pivot.x) * 180 / Math.PI;
    let deltaAngle = currentAngle - this.initialAngle;

    // Snap to 15 degrees with shift
    if (input.modifiers.shift) {
      deltaAngle = Math.round(deltaAngle / 15) * 15;
    }

    this.transformManager.updateRotate(deltaAngle, this.pivot);

    const preview = this.transformManager.getPreviewTransforms();
    const matrix = this.transformManager.getPreviewMatrix();

    if (this.callbacks.onTransformUpdate) {
      this.callbacks.onTransformUpdate(preview, matrix);
    }
  }

  pointerUp(input: PointerInput): void {
    if (this.transformManager.isActive()) {
      const result = this.transformManager.endTransform();
      if (this.callbacks.onTransformEnd) {
        this.callbacks.onTransformEnd(result.matrix, result.initialTransforms);
      }
    }
    this.startWorld = null;
    this.pivot = null;
  }

  keyDown(input: KeyboardInput): void {}
  keyUp(input: KeyboardInput): void {}

  cancel(): void {
    this.transformManager.cancel();
    if (this.callbacks.onTransformCancel) {
      this.callbacks.onTransformCancel();
    }
    this.startWorld = null;
    this.pivot = null;
  }
}
