
import { InteractionTool, PointerInput, KeyboardInput } from '../types.js';
import { HitTester } from '../hit-test.js';
import { SelectionManager } from '../selection.js';
import { DragManager } from '../drag.js';
import { ViewportTransform } from '../viewport.js';
import { Matrix3x3, Vec2 } from '../../math/types.js';

export interface MoveToolCallbacks {
  onDragStart?: (nodeIds: string[], startWorld: Vec2) => void;
  onDragUpdate?: (delta: Vec2, previewTransforms: Map<string, Matrix3x3>) => void;
  onDragEnd?: (delta: Vec2, initialTransforms: Map<string, Matrix3x3>) => void;
  onDragCancel?: () => void;
}

export class MoveTool implements InteractionTool {
  readonly id = 'move';

  private hitTester: HitTester;
  private selection: SelectionManager;
  private dragManager: DragManager;
  private viewport: ViewportTransform;
  private stores: any;
  private callbacks: MoveToolCallbacks;

  constructor(
    hitTester: HitTester,
    selection: SelectionManager,
    dragManager: DragManager,
    viewport: ViewportTransform,
    stores: any,
    callbacks: MoveToolCallbacks = {}
  ) {
    this.hitTester = hitTester;
    this.selection = selection;
    this.dragManager = dragManager;
    this.viewport = viewport;
    this.stores = stores;
    this.callbacks = callbacks;
  }

  pointerDown(input: PointerInput): void {
    const worldPos = this.viewport.screenToWorld(input.position);
    const hit = this.hitTester.hitTestTopmost(worldPos);

    const selected = this.selection.getState().selectedNodeIds;

    if (hit && selected.includes(hit.nodeId as any)) {
      // Drag selected objects
      const initialTransforms = new Map<string, Matrix3x3>();
      for (const nodeId of selected) {
        const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
        if (sceneNode) {
          initialTransforms.set(nodeId as string, { ...sceneNode.localTransform });
        }
      }
      this.dragManager.startDrag(worldPos, initialTransforms);
      if (this.callbacks.onDragStart) {
        this.callbacks.onDragStart(selected as string[], worldPos);
      }
    } else if (hit) {
      // Hit unselected object - select it and start drag
      this.selection.replaceSelection([hit.nodeId]);
      const initialTransforms = new Map<string, Matrix3x3>();
      const sceneNode = this.stores.sceneGraph.findNode(hit.nodeId as string);
      if (sceneNode) {
        initialTransforms.set(hit.nodeId as string, { ...sceneNode.localTransform });
      }
      this.dragManager.startDrag(worldPos, initialTransforms);
      if (this.callbacks.onDragStart) {
        this.callbacks.onDragStart([hit.nodeId as string], worldPos);
      }
    }
  }

  pointerMove(input: PointerInput): void {
    const worldPos = this.viewport.screenToWorld(input.position);
    const started = this.dragManager.updateDrag(worldPos);

    if (this.dragManager.isDragging()) {
      const preview = this.dragManager.getPreviewTransforms();
      const delta = this.dragManager.getDelta();
      if (this.callbacks.onDragUpdate) {
        this.callbacks.onDragUpdate(delta, preview);
      }
    }
  }

  pointerUp(input: PointerInput): void {
    if (this.dragManager.isDragging()) {
      const result = this.dragManager.endDrag();
      if (this.callbacks.onDragEnd) {
        this.callbacks.onDragEnd(result.delta, result.initialTransforms);
      }
    } else {
      this.dragManager.reset();
    }
  }

  keyDown(input: KeyboardInput): void {}

  keyUp(input: KeyboardInput): void {}

  cancel(): void {
    this.dragManager.cancel();
    if (this.callbacks.onDragCancel) {
      this.callbacks.onDragCancel();
    }
  }
}
