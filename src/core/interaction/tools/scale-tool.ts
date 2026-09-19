
import { InteractionTool, PointerInput, KeyboardInput, Handle } from '../types.js';
import { SelectionManager } from '../selection.js';
import { TransformInteractionManager } from '../transform-interaction.js';
import { ViewportTransform } from '../viewport.js';
import { Matrix3x3, Vec2 } from '../../math/types.js';
import { BBox } from '../../geometry/types.js';

export interface ScaleToolCallbacks {
  onTransformStart?: (mode: 'scale', pivot: Vec2, bounds: BBox, initialTransforms: Map<string, Matrix3x3>) => void;
  onTransformUpdate?: (previewTransforms: Map<string, Matrix3x3>, previewMatrix: Matrix3x3 | null) => void;
  onTransformEnd?: (matrix: Matrix3x3 | null, initialTransforms: Map<string, Matrix3x3>) => void;
  onTransformCancel?: () => void;
}

export class ScaleTool implements InteractionTool {
  readonly id = 'scale';

  private selection: SelectionManager;
  private transformManager: TransformInteractionManager;
  private viewport: ViewportTransform;
  private stores: any;
  private callbacks: ScaleToolCallbacks;
  private activeHandle: Handle | null = null;
  private startWorld: Vec2 | null = null;
  private initialBounds: BBox | null = null;

  constructor(
    selection: SelectionManager,
    transformManager: TransformInteractionManager,
    viewport: ViewportTransform,
    stores: any,
    callbacks: ScaleToolCallbacks = {}
  ) {
    this.selection = selection;
    this.transformManager = transformManager;
    this.viewport = viewport;
    this.stores = stores;
    this.callbacks = callbacks;
  }

  private getSelectionBounds(): BBox | null {
    // For MVP, calculate from selected nodes' world transforms + geometry bboxes
    // Simplified: use sceneGraph nodes
    const selected = this.selection.getState().selectedNodeIds;
    if (selected.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const nodeId of selected) {
      const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
      if (!sceneNode) continue;
      const world = this.stores.sceneGraph.getWorldTransform
        ? this.stores.sceneGraph.getWorldTransform(nodeId as string)
        : sceneNode.localTransform;

      // For MVP, use world tx/ty + assume 10x10 bbox if no geometry
      // In real impl, would use geometry BBox transformed by world
      const objId = sceneNode.objectRef;
      let bbox: BBox = { minX: world.tx, minY: world.ty, maxX: world.tx + 10, maxY: world.ty + 10 };

      if (objId) {
        const obj = this.stores.objectStore.get(objId);
        if (obj) {
          const geom = this.stores.geometryStore.get(obj.geometryRef);
          if (geom && geom.params) {
            if (geom.type === 'rect') {
              bbox = {
                minX: world.tx + geom.params.x,
                minY: world.ty + geom.params.y,
                maxX: world.tx + geom.params.x + geom.params.width,
                maxY: world.ty + geom.params.y + geom.params.height
              };
            }
          }
        }
      }

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
    const hitHandle = TransformInteractionManager.hitTestHandles(worldPos, handles, 10);

    if (hitHandle && hitHandle.kind !== 'rotation') {
      this.activeHandle = hitHandle;
      this.startWorld = { ...worldPos };
      this.initialBounds = { ...bounds };

      const pivot = TransformInteractionManager.calculateSelectionBoundsCenter([bounds]);
      // For scale, pivot is opposite corner
      let oppositePivot: Vec2 = { ...pivot };
      switch (hitHandle.kind) {
        case 'top-left': oppositePivot = { x: bounds.maxX, y: bounds.maxY }; break;
        case 'top-right': oppositePivot = { x: bounds.minX, y: bounds.maxY }; break;
        case 'bottom-left': oppositePivot = { x: bounds.maxX, y: bounds.minY }; break;
        case 'bottom-right': oppositePivot = { x: bounds.minX, y: bounds.minY }; break;
        case 'top-center': oppositePivot = { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY }; break;
        case 'bottom-center': oppositePivot = { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY }; break;
        case 'middle-left': oppositePivot = { x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2 }; break;
        case 'middle-right': oppositePivot = { x: bounds.minX, y: (bounds.minY + bounds.maxY) / 2 }; break;
      }

      const initialTransforms = new Map<string, Matrix3x3>();
      for (const nodeId of this.selection.getState().selectedNodeIds) {
        const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
        if (sceneNode) {
          initialTransforms.set(nodeId as string, { ...sceneNode.localTransform });
        }
      }

      this.transformManager.startTransform('scale', oppositePivot, bounds, initialTransforms);

      if (this.callbacks.onTransformStart) {
        this.callbacks.onTransformStart('scale', oppositePivot, bounds, initialTransforms);
      }
    }
  }

  pointerMove(input: PointerInput): void {
    if (!this.activeHandle || !this.startWorld || !this.initialBounds) return;

    const worldPos = this.viewport.screenToWorld(input.position);
    const bounds = this.initialBounds;

    const dx = worldPos.x - this.startWorld.x;
    const dy = worldPos.y - this.startWorld.y;

    let scaleX = 1, scaleY = 1;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    switch (this.activeHandle.kind) {
      case 'top-left':
        scaleX = (width - dx) / width;
        scaleY = (height - dy) / height;
        break;
      case 'top-right':
        scaleX = (width + dx) / width;
        scaleY = (height - dy) / height;
        break;
      case 'bottom-left':
        scaleX = (width - dx) / width;
        scaleY = (height + dy) / height;
        break;
      case 'bottom-right':
        scaleX = (width + dx) / width;
        scaleY = (height + dy) / height;
        break;
      case 'top-center':
        scaleY = (height - dy) / height;
        break;
      case 'bottom-center':
        scaleY = (height + dy) / height;
        break;
      case 'middle-left':
        scaleX = (width - dx) / width;
        break;
      case 'middle-right':
        scaleX = (width + dx) / width;
        break;
    }

    if (width < 1e-6) scaleX = 1;
    if (height < 1e-6) scaleY = 1;

    const uniform = input.modifiers.shift;

    this.transformManager.updateScale(scaleX, scaleY, undefined, uniform);

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
    this.activeHandle = null;
    this.startWorld = null;
    this.initialBounds = null;
  }

  keyDown(input: KeyboardInput): void {}
  keyUp(input: KeyboardInput): void {}

  cancel(): void {
    this.transformManager.cancel();
    if (this.callbacks.onTransformCancel) {
      this.callbacks.onTransformCancel();
    }
    this.activeHandle = null;
    this.startWorld = null;
    this.initialBounds = null;
  }
}
