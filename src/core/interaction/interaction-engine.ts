
import { NodeID } from '../ids/index.js';
import { Vec2, Matrix3x3 } from '../math/types.js';
import { BBox } from '../geometry/types.js';
import { PointerInput, KeyboardInput, Modifiers, createModifiers } from './input.js';
import { ViewportTransform, createViewportTransform } from './viewport.js';
import { InteractionState, InteractionConfig, InteractionOverlay, InteractionPreview, Handle } from './types.js';
import { SelectionManager } from './selection.js';
import { HoverManager } from './hover.js';
import { HitTester, HitTestStores } from './hit-test.js';
import { DragManager } from './drag.js';
import { MarqueeManager } from './marquee.js';
import { TransformInteractionManager } from './transform-interaction.js';
import { AnchorInteractionManager } from './anchor-interaction.js';
import { OverlayManager } from './overlay.js';
import { InteractionStateMachine } from './state-machine.js';

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

export interface InteractionStores extends HitTestStores {
  // Extended stores for interaction
}

export interface TransactionExecutor {
  execute(transaction: any): { success: boolean; diff?: any };
}

export interface InteractionEngineCallbacks {
  onSelectionChanged?: (selectedNodeIds: NodeID[]) => void;
  onHoverChanged?: (nodeId: NodeID | null) => void;
  onPreviewChanged?: (preview: InteractionPreview) => void;
  onTransaction?: (transaction: any) => void;
  onOverlayChanged?: (overlay: InteractionOverlay) => void;
  onCaptureRequest?: (pointerId: number, capture: boolean) => void;
}

export class InteractionEngine {
  private stores: InteractionStores;
  private viewport: ViewportTransform;
  private config: InteractionConfig;
  private stateMachine: InteractionStateMachine;
  private selection: SelectionManager;
  private hover: HoverManager;
  private hitTester: HitTester;
  private dragManager: DragManager;
  private marqueeManager: MarqueeManager;
  private transformManager: TransformInteractionManager;
  private anchorManager: AnchorInteractionManager;
  private overlay: OverlayManager;
  private callbacks: InteractionEngineCallbacks;
  private activeTool: string = 'select';
  private pointerDownPosition: Vec2 | null = null;
  private pointerDownWorld: Vec2 | null = null;
  private transactionExecutor?: TransactionExecutor;
  private isDraggingForMove = false;
  private initialTransformsForDrag = new Map<string, Matrix3x3>();

  constructor(
    stores: InteractionStores,
    viewport?: ViewportTransform,
    config: Partial<InteractionConfig> = {},
    callbacks: InteractionEngineCallbacks = {},
    transactionExecutor?: TransactionExecutor
  ) {
    this.stores = stores;
    this.viewport = viewport || createViewportTransform();
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
    this.stateMachine = new InteractionStateMachine();
    this.selection = new SelectionManager();
    this.hover = new HoverManager();
    this.hitTester = new HitTester(stores, this.config);
    this.dragManager = new DragManager(this.config);
    this.marqueeManager = new MarqueeManager(this.config);
    this.transformManager = new TransformInteractionManager(this.config);
    this.anchorManager = new AnchorInteractionManager(this.config);
    this.overlay = new OverlayManager();
    this.callbacks = callbacks;
    this.transactionExecutor = transactionExecutor;

    this.selection.subscribe((state) => {
      if (this.callbacks.onSelectionChanged) {
        this.callbacks.onSelectionChanged(state.selectedNodeIds);
      }
      this.updateSelectionOverlay();
    });

    this.hover.subscribe((state) => {
      if (this.callbacks.onHoverChanged) {
        this.callbacks.onHoverChanged(state.nodeId);
      }
      if (state.nodeId) {
        this.overlay.setHoverOutline(state.nodeId as any);
      } else {
        this.overlay.clearHover();
      }
      this.emitOverlay();
    });
  }

  getSelection(): SelectionManager {
    return this.selection;
  }

  getHover(): HoverManager {
    return this.hover;
  }

  getStateMachine(): InteractionStateMachine {
    return this.stateMachine;
  }

  getViewport(): ViewportTransform {
    return this.viewport;
  }

  getOverlay(): InteractionOverlay {
    return this.overlay.getOverlay();
  }

  getPreview(): InteractionPreview {
    const preview: InteractionPreview = {};

    if (this.dragManager.isDragging()) {
      preview.transforms = this.dragManager.getPreviewTransforms();
    }

    if (this.transformManager.isActive()) {
      preview.transforms = this.transformManager.getPreviewTransforms();
    }

    if (this.anchorManager.isActive()) {
      const geom = this.anchorManager.getPreviewGeometry();
      if (geom) {
        preview.geometries = new Map();
        const nodeId = this.anchorManager.getState().pathNodeId;
        if (nodeId) {
          preview.geometries.set(nodeId as string, geom);
        }
      }
    }

    preview.overlay = this.overlay.getOverlay();

    return preview;
  }

  setActiveTool(tool: string): void {
    this.activeTool = tool;
  }

  setTransactionExecutor(executor: TransactionExecutor): void {
    this.transactionExecutor = executor;
  }

  setViewportMatrix(matrix: Matrix3x3): void {
    if ((this.viewport as any).setMatrix) {
      (this.viewport as any).setMatrix(matrix);
    }
  }

  pointerDown(input: PointerInput): void {
    const worldPos = this.viewport.screenToWorld(input.position);
    this.pointerDownPosition = { ...input.position };
    this.pointerDownWorld = { ...worldPos };

    // Check transform handles first if we have selection
    const hasSelection = this.selection.hasSelection();
    if (hasSelection && this.activeTool !== 'anchor') {
      const bounds = this.calculateSelectionBounds();
      if (bounds) {
        const handles = TransformInteractionManager.calculateHandles(bounds);
        const hitHandle = TransformInteractionManager.hitTestHandles(worldPos, handles, this.config.handleHitTolerance);

        if (hitHandle) {
          // Transform handle hit - start transform
          this.handleTransformHandleDown(hitHandle, worldPos, bounds);
          return;
        }
      }
    }

    // Anchor tool - check if active
    if (this.activeTool === 'anchor' || this.anchorManager.isActive()) {
      this.handleAnchorPointerDown(input, worldPos);
      return;
    }

    // Normal hit test
    const hit = this.hitTester.hitTestTopmost(worldPos);

    // State machine transition
    this.stateMachine.transition('pointerdown', input);

    if (hit) {
      // Check if hit is already selected and we might start drag
      if (this.selection.isSelected(hit.nodeId)) {
        // Prepare for drag
        const initialTransforms = new Map<string, Matrix3x3>();
        for (const nodeId of this.selection.getState().selectedNodeIds) {
          const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
          if (sceneNode) {
            initialTransforms.set(nodeId as string, { ...sceneNode.localTransform });
          }
        }
        this.initialTransformsForDrag = initialTransforms;
        this.dragManager.startDrag(worldPos, initialTransforms);
      } else {
        // New selection
        if (input.modifiers.shift || input.modifiers.ctrl || input.modifiers.meta) {
          this.selection.toggle(hit.nodeId);
        } else {
          this.selection.replaceSelection([hit.nodeId]);
        }

        const initialTransforms = new Map<string, Matrix3x3>();
        for (const nodeId of this.selection.getState().selectedNodeIds) {
          const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
          if (sceneNode) {
            initialTransforms.set(nodeId as string, { ...sceneNode.localTransform });
          }
        }
        this.initialTransformsForDrag = initialTransforms;
        this.dragManager.startDrag(worldPos, initialTransforms);
      }
    } else {
      // Empty hit - start marquee if no modifier
      if (!input.modifiers.shift && !input.modifiers.ctrl && !input.modifiers.meta) {
        this.selection.clearSelection();
      }
      this.marqueeManager.startMarquee(worldPos);
      this.overlay.setMarquee({ minX: worldPos.x, minY: worldPos.y, maxX: worldPos.x, maxY: worldPos.y });
      this.emitOverlay();
    }

    if (this.callbacks.onCaptureRequest) {
      this.callbacks.onCaptureRequest(input.pointerId, true);
    }
  }

  pointerMove(input: PointerInput): void {
    const worldPos = this.viewport.screenToWorld(input.position);

    // Transform active
    if (this.transformManager.isActive()) {
      this.handleTransformMove(input, worldPos);
      return;
    }

    // Anchor drag active
    if (this.anchorManager.isDragging()) {
      if (this.pointerDownWorld) {
        const delta = { x: worldPos.x - this.pointerDownWorld.x, y: worldPos.y - this.pointerDownWorld.y };
        this.anchorManager.updateDrag(delta);
        this.emitPreview();
      }
      return;
    }

    // Drag active
    if (this.dragManager.getState().startWorld) {
      const started = this.dragManager.updateDrag(worldPos);

      if (started && !this.isDraggingForMove) {
        this.isDraggingForMove = true;
        this.stateMachine.transition('dragstart', input);
      }

      if (this.dragManager.isDragging()) {
        this.emitPreview();
        return;
      }
    }

    // Marquee active
    if (this.marqueeManager.isActive()) {
      this.marqueeManager.updateMarquee(worldPos);
      const bounds = this.marqueeManager.getBounds();
      if (bounds) {
        this.overlay.setMarquee(bounds);
        this.emitOverlay();

        // Update selection preview based on marquee
        const candidates = this.getMarqueeCandidates(bounds);
        // For preview, we don't update selection yet, only on pointerUp
      }
      this.stateMachine.transition('marqueestart', input);
      return;
    }

    // Hover
    const hit = this.hitTester.hitTestTopmost(worldPos);
    if (hit) {
      this.hover.setHover(hit.nodeId, hit.kind);
    } else {
      this.hover.clear();
    }

    this.stateMachine.transition('pointermove', input);
  }

  pointerUp(input: PointerInput): void {
    const worldPos = this.viewport.screenToWorld(input.position);

    // Transform end
    if (this.transformManager.isActive()) {
      const result = this.transformManager.endTransform();
      this.handleTransformCommit(result);
      this.stateMachine.transition('pointerup', input);
      this.emitOverlay();
      if (this.callbacks.onCaptureRequest) {
        this.callbacks.onCaptureRequest(input.pointerId, false);
      }
      return;
    }

    // Anchor drag end
    if (this.anchorManager.isDragging()) {
      const result = this.anchorManager.endDrag();
      this.handleAnchorCommit(result);
      this.stateMachine.transition('pointerup', input);
      this.emitPreview();
      if (this.callbacks.onCaptureRequest) {
        this.callbacks.onCaptureRequest(input.pointerId, false);
      }
      return;
    }

    // Drag end - commit transaction
    if (this.dragManager.isDragging()) {
      const result = this.dragManager.endDrag();
      this.handleDragCommit(result);
      this.isDraggingForMove = false;
      this.stateMachine.transition('pointerup', input);
      if (this.callbacks.onCaptureRequest) {
        this.callbacks.onCaptureRequest(input.pointerId, false);
      }
      return;
    }

    // Marquee end
    if (this.marqueeManager.isActive()) {
      const bounds = this.marqueeManager.endMarquee();
      this.overlay.clearMarquee();
      this.emitOverlay();

      if (bounds) {
        const candidates = this.getMarqueeCandidates(bounds);
        // Filter eligible: visible, not locked
        const eligible: NodeID[] = [];
        for (const nodeId of candidates) {
          const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
          if (!sceneNode) continue;
          const objectId = sceneNode.objectRef;
          if (!objectId) continue;
          const obj = this.stores.objectStore.get(objectId);
          if (!obj) continue;
          if (obj.meta?.visible === false) continue;
          if (obj.meta?.locked === true) continue;
          eligible.push(nodeId);
        }

        if (input.modifiers.shift || input.modifiers.ctrl || input.modifiers.meta) {
          this.selection.addToSelection(eligible);
        } else {
          this.selection.replaceSelection(eligible);
        }
      }

      this.stateMachine.transition('pointerup', input);
      if (this.callbacks.onCaptureRequest) {
        this.callbacks.onCaptureRequest(input.pointerId, false);
      }
      return;
    }

    // Click without drag - selection already handled in pointerDown
    this.dragManager.reset();
    this.stateMachine.transition('pointerup', input);

    if (this.callbacks.onCaptureRequest) {
      this.callbacks.onCaptureRequest(input.pointerId, false);
    }
  }

  pointerCancel(input: PointerInput): void {
    this.cancel();
    this.stateMachine.transition('cancel', input);
  }

  keyDown(input: KeyboardInput): void {
    if (input.key === 'Escape') {
      this.cancel();
      return;
    }

    if (input.key === 'Delete' || input.key === 'Backspace') {
      this.handleDelete();
      return;
    }

    // Arrow keys for moving selected objects
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(input.key)) {
      this.handleArrowKey(input);
      return;
    }
  }

  keyUp(input: KeyboardInput): void {}

  cancel(): void {
    this.dragManager.cancel();
    this.marqueeManager.cancel();
    this.transformManager.cancel();
    this.anchorManager.cancel();
    this.overlay.clear();
    this.isDraggingForMove = false;
    this.initialTransformsForDrag.clear();
    this.emitPreview();
    this.emitOverlay();
  }

  private handleTransformHandleDown(handle: Handle, worldPos: Vec2, bounds: BBox): void {
    const pivot = TransformInteractionManager.calculateSelectionBoundsCenter([bounds]);

    const initialTransforms = new Map<string, Matrix3x3>();
    for (const nodeId of this.selection.getState().selectedNodeIds) {
      const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
      if (sceneNode) {
        initialTransforms.set(nodeId as string, { ...sceneNode.localTransform });
      }
    }

    let mode: 'move' | 'scale' | 'rotate' = 'move';
    let actualPivot = pivot;

    if (handle.kind === 'rotation') {
      mode = 'rotate';
      actualPivot = pivot;
    } else {
      mode = 'scale';
      // Opposite corner as pivot
      switch (handle.kind) {
        case 'top-left': actualPivot = { x: bounds.maxX, y: bounds.maxY }; break;
        case 'top-right': actualPivot = { x: bounds.minX, y: bounds.maxY }; break;
        case 'bottom-left': actualPivot = { x: bounds.maxX, y: bounds.minY }; break;
        case 'bottom-right': actualPivot = { x: bounds.minX, y: bounds.minY }; break;
        case 'top-center': actualPivot = { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY }; break;
        case 'bottom-center': actualPivot = { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY }; break;
        case 'middle-left': actualPivot = { x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2 }; break;
        case 'middle-right': actualPivot = { x: bounds.minX, y: (bounds.minY + bounds.maxY) / 2 }; break;
      }
    }

    this.transformManager.startTransform(mode, actualPivot, bounds, initialTransforms);
    this.pointerDownWorld = { ...worldPos };
    this.stateMachine.transition('transformstart', { handle, mode });
  }

  private handleTransformMove(input: PointerInput, worldPos: Vec2): void {
    if (!this.pointerDownWorld) return;

    const state = this.transformManager.getState();
    if (!state.pivot || !state.initialBounds) return;

    if (state.mode === 'scale') {
      const bounds = state.initialBounds;
      const dx = worldPos.x - this.pointerDownWorld.x;
      const dy = worldPos.y - this.pointerDownWorld.y;

      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;

      // Determine which handle is active by checking pivot position
      // For MVP, we approximate scale based on drag delta
      // We need to know active handle - we can infer from pivot
      let scaleX = 1, scaleY = 1;

      // Simplified: if pivot is at minX, we drag maxX
      // This is approximate - real impl would track active handle
      if (Math.abs(state.pivot.x - bounds.minX) < 1e-6) {
        scaleX = (width + dx) / width;
      } else if (Math.abs(state.pivot.x - bounds.maxX) < 1e-6) {
        scaleX = (width - dx) / width;
      } else {
        scaleX = 1;
      }

      if (Math.abs(state.pivot.y - bounds.minY) < 1e-6) {
        scaleY = (height + dy) / height;
      } else if (Math.abs(state.pivot.y - bounds.maxY) < 1e-6) {
        scaleY = (height - dy) / height;
      } else {
        scaleY = 1;
      }

      if (!isFinite(scaleX) || width < 1e-6) scaleX = 1;
      if (!isFinite(scaleY) || height < 1e-6) scaleY = 1;

      this.transformManager.updateScale(scaleX, scaleY, state.pivot, input.modifiers.shift);
    } else if (state.mode === 'rotate') {
      const currentAngle = Math.atan2(worldPos.y - state.pivot.y, worldPos.x - state.pivot.x) * 180 / Math.PI;
      const startAngle = Math.atan2(this.pointerDownWorld.y - state.pivot.y, this.pointerDownWorld.x - state.pivot.x) * 180 / Math.PI;
      let deltaAngle = currentAngle - startAngle;

      if (input.modifiers.shift) {
        deltaAngle = Math.round(deltaAngle / 15) * 15;
      }

      this.transformManager.updateRotate(deltaAngle, state.pivot);
    }

    this.emitPreview();
  }

  private handleTransformCommit(result: { mode: 'move' | 'scale' | 'rotate' | null; matrix: Matrix3x3 | null; initialTransforms: Map<string, Matrix3x3> }): void {
    if (!result.matrix) return;

    // Create transaction for transform
    // For MVP, we create MoveObjectCommands with new transforms
    const previewTransforms = this.transformManager.getPreviewTransforms();
    // Actually we need to use result.matrix applied to initialTransforms
    // The transformManager already calculates preview transforms

    // Build commands - we need to use the transaction system
    // For JS runtime, we will emit via callback
    if (this.callbacks.onTransaction) {
      // Create a mock transaction for testing
      const commands: any[] = [];
      for (const [nodeId, initial] of result.initialTransforms) {
        const preview = previewTransforms.get(nodeId) || initial;
        // For MVP, we assume command is SetLocalTransform
        commands.push({
          type: 'SetLocalTransform',
          payload: { nodeId, transform: preview, initialTransform: initial }
        });
      }

      const transaction = {
        id: 'tx-' + Math.random().toString(36).slice(2),
        commands,
        source: 'user',
        timestamp: Date.now()
      };

      this.callbacks.onTransaction(transaction);

      // If we have executor, execute it
      if (this.transactionExecutor) {
        // Real executor would be TransactionExecutor from Phase 3.06
        // For now, we call it with a proper transaction builder
        try {
          this.transactionExecutor.execute(transaction);
        } catch (e) {
          console.error('Transaction failed', e);
        }
      }
    }

    this.pointerDownWorld = null;
  }

  private handleAnchorPointerDown(input: PointerInput, worldPos: Vec2): void {
    // Delegate to anchor tool logic
    if (this.anchorManager.isActive()) {
      const hit = this.hitTester.hitTestTopmost(worldPos);
      if (hit && (hit.kind === 'anchor' || hit.kind === 'handle')) {
        const handleKind = hit.kind === 'anchor' ? 'position' : (hit.handleKind === 'in' ? 'in' : 'out');
        this.anchorManager.selectAnchor(hit.anchorIndex!);
        this.anchorManager.startDrag(hit.anchorIndex!, handleKind as any);
        this.pointerDownWorld = { ...worldPos };
        this.stateMachine.transition('anchoreditstart', input);
      }
    } else {
      const hit = this.hitTester.hitTestTopmost(worldPos);
      if (hit && hit.objectId) {
        const obj = this.stores.objectStore.get(hit.objectId);
        if (obj) {
          const geom = this.stores.geometryStore.get(obj.geometryRef);
          if (geom && geom.type === 'path') {
            this.anchorManager.startEditing(hit.nodeId, geom);
            this.stateMachine.transition('anchoreditstart', input);
          }
        }
      }
    }
  }

  private handleAnchorCommit(result: { initialGeometry: any; previewGeometry: any; anchorIndex: number | null; handleKind: 'position' | 'in' | 'out' | null }): void {
    if (!result.previewGeometry || !result.initialGeometry) return;

    const state = this.anchorManager.getState();
    const nodeId = state.pathNodeId;
    if (!nodeId) return;

    const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
    if (!sceneNode) return;

    const objectId = sceneNode.objectRef;
    if (!objectId) return;

    if (this.callbacks.onTransaction) {
      const transaction = {
        id: 'tx-' + Math.random().toString(36).slice(2),
        commands: [
          {
            type: 'UpdateGeometry',
            payload: {
              objectId,
              geometry: result.previewGeometry,
              initialGeometry: result.initialGeometry
            }
          }
        ],
        source: 'user',
        timestamp: Date.now()
      };

      this.callbacks.onTransaction(transaction);

      if (this.transactionExecutor) {
        try {
          this.transactionExecutor.execute(transaction);
        } catch (e) {
          console.error('Transaction failed', e);
        }
      }
    }
  }

  private handleDragCommit(result: { delta: Vec2; initialTransforms: Map<string, Matrix3x3> }): void {
    if (Math.hypot(result.delta.x, result.delta.y) < 1e-6) return;

    const previewTransforms = this.dragManager.getPreviewTransforms();

    if (this.callbacks.onTransaction) {
      const commands: any[] = [];
      for (const [nodeId, initial] of result.initialTransforms) {
        const preview = previewTransforms.get(nodeId) || initial;
        commands.push({
          type: 'SetLocalTransform',
          payload: { nodeId, transform: preview, initialTransform: initial, delta: result.delta }
        });
      }

      const transaction = {
        id: 'tx-' + Math.random().toString(36).slice(2),
        commands,
        source: 'user',
        timestamp: Date.now()
      };

      this.callbacks.onTransaction(transaction);

      if (this.transactionExecutor) {
        try {
          this.transactionExecutor.execute(transaction);
        } catch (e) {
          console.error('Transaction failed', e);
        }
      }
    }
  }

  private handleDelete(): void {
    const selected = this.selection.getState().selectedNodeIds;
    if (selected.length === 0) return;

    if (this.callbacks.onTransaction) {
      const commands: any[] = [];
      for (const nodeId of selected) {
        const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
        if (!sceneNode) continue;
        const objectId = sceneNode.objectRef;
        commands.push({
          type: 'DeleteNode',
          payload: { nodeId, objectId }
        });
      }

      const transaction = {
        id: 'tx-' + Math.random().toString(36).slice(2),
        commands,
        source: 'user',
        timestamp: Date.now()
      };

      this.callbacks.onTransaction(transaction);

      if (this.transactionExecutor) {
        try {
          this.transactionExecutor.execute(transaction);
          this.selection.clearSelection();
        } catch (e) {
          console.error('Transaction failed', e);
        }
      }
    }
  }

  private handleArrowKey(input: KeyboardInput): void {
    const selected = this.selection.getState().selectedNodeIds;
    if (selected.length === 0) return;

    let dx = 0, dy = 0;
    const step = input.modifiers.shift ? this.config.keyboardMoveStepShift : this.config.keyboardMoveStep;

    switch (input.key) {
      case 'ArrowUp': dy = -step; break;
      case 'ArrowDown': dy = step; break;
      case 'ArrowLeft': dx = -step; break;
      case 'ArrowRight': dx = step; break;
    }

    if (dx === 0 && dy === 0) return;

    const initialTransforms = new Map<string, Matrix3x3>();
    for (const nodeId of selected) {
      const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
      if (sceneNode) {
        initialTransforms.set(nodeId as string, { ...sceneNode.localTransform });
      }
    }

    // Create transaction for arrow key move - ONE transaction per key press
    if (this.callbacks.onTransaction) {
      const commands: any[] = [];
      for (const [nodeId, initial] of initialTransforms) {
        const preview = {
          ...initial,
          tx: initial.tx + dx,
          ty: initial.ty + dy
        };
        commands.push({
          type: 'SetLocalTransform',
          payload: { nodeId, transform: preview, initialTransform: initial, delta: { x: dx, y: dy } }
        });
      }

      const transaction = {
        id: 'tx-' + Math.random().toString(36).slice(2),
        commands,
        source: 'user',
        timestamp: Date.now()
      };

      this.callbacks.onTransaction(transaction);

      if (this.transactionExecutor) {
        try {
          this.transactionExecutor.execute(transaction);
        } catch (e) {
          console.error('Transaction failed', e);
        }
      }
    }
  }

  private getMarqueeCandidates(marquee: BBox): NodeID[] {
    // Use SpatialIndex to query candidates
    if (this.stores.spatialIndex) {
      try {
        return this.stores.spatialIndex.query(marquee) as NodeID[];
      } catch {
        // Fallback
      }
    }

    // Fallback: check all nodes
    const allNodes = this.stores.sceneGraph.getAllNodes ? this.stores.sceneGraph.getAllNodes() : [];
    const result: NodeID[] = [];

    for (const node of allNodes) {
      const world = this.stores.sceneGraph.getWorldTransform
        ? this.stores.sceneGraph.getWorldTransform(node.id)
        : node.localTransform;

      // Simple BBox check - for MVP assume 10x10
      const bbox: BBox = { minX: world.tx, minY: world.ty, maxX: world.tx + 10, maxY: world.ty + 10 };

      const intersects = !(
        bbox.maxX < marquee.minX ||
        bbox.minX > marquee.maxX ||
        bbox.maxY < marquee.minY ||
        bbox.minY > marquee.maxY
      );

      if (intersects) {
        result.push(node.id as NodeID);
      }
    }

    return result;
  }

  private calculateSelectionBounds(): BBox | null {
    const selected = this.selection.getState().selectedNodeIds;
    if (selected.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const nodeId of selected) {
      const sceneNode = this.stores.sceneGraph.findNode(nodeId as string);
      if (!sceneNode) continue;
      const world = this.stores.sceneGraph.getWorldTransform
        ? this.stores.sceneGraph.getWorldTransform(nodeId as string)
        : sceneNode.localTransform;

      const bbox: BBox = { minX: world.tx, minY: world.ty, maxX: world.tx + 100, maxY: world.ty + 100 };

      const objId = sceneNode.objectRef;
      if (objId) {
        const obj = this.stores.objectStore.get(objId);
        if (obj) {
          const geom = this.stores.geometryStore.get(obj.geometryRef);
          if (geom && geom.type === 'rect') {
            const g = geom.params;
            const b: BBox = {
              minX: world.tx + g.x,
              minY: world.ty + g.y,
              maxX: world.tx + g.x + g.width,
              maxY: world.ty + g.y + g.height
            };
            minX = Math.min(minX, b.minX);
            minY = Math.min(minY, b.minY);
            maxX = Math.max(maxX, b.maxX);
            maxY = Math.max(maxY, b.maxY);
            continue;
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

  private updateSelectionOverlay(): void {
    const bounds = this.calculateSelectionBounds();
    if (bounds) {
      this.overlay.setSelectionBounds(bounds);
      const handles = TransformInteractionManager.calculateHandles(bounds);
      this.overlay.setHandles(handles);
    } else {
      this.overlay.clearSelection();
    }
    this.emitOverlay();
  }

  private emitPreview(): void {
    if (this.callbacks.onPreviewChanged) {
      this.callbacks.onPreviewChanged(this.getPreview());
    }
  }

  private emitOverlay(): void {
    if (this.callbacks.onOverlayChanged) {
      this.callbacks.onOverlayChanged(this.overlay.getOverlay());
    }
  }
}
