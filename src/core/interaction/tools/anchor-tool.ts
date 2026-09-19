
import { InteractionTool, PointerInput, KeyboardInput } from '../types.js';
import { HitTester } from '../hit-test.js';
import { AnchorInteractionManager } from '../anchor-interaction.js';
import { SelectionManager } from '../selection.js';
import { ViewportTransform } from '../viewport.js';
import { Vec2 } from '../../math/types.js';

export interface AnchorToolCallbacks {
  onAnchorSelect?: (indices: number[]) => void;
  onAnchorDragStart?: (anchorIndex: number, handleKind: 'position' | 'in' | 'out', startWorld: Vec2) => void;
  onAnchorDragUpdate?: (previewGeometry: any) => void;
  onAnchorDragEnd?: (initialGeometry: any, previewGeometry: any) => void;
  onAnchorDragCancel?: () => void;
}

export class AnchorTool implements InteractionTool {
  readonly id = 'anchor';

  private hitTester: HitTester;
  private anchorManager: AnchorInteractionManager;
  private selection: SelectionManager;
  private viewport: ViewportTransform;
  private stores: any;
  private callbacks: AnchorToolCallbacks;
  private startWorld: Vec2 | null = null;
  private isDragging = false;

  constructor(
    hitTester: HitTester,
    anchorManager: AnchorInteractionManager,
    selection: SelectionManager,
    viewport: ViewportTransform,
    stores: any,
    callbacks: AnchorToolCallbacks = {}
  ) {
    this.hitTester = hitTester;
    this.anchorManager = anchorManager;
    this.selection = selection;
    this.viewport = viewport;
    this.stores = stores;
    this.callbacks = callbacks;
  }

  pointerDown(input: PointerInput): void {
    const worldPos = this.viewport.screenToWorld(input.position);

    // If already editing a path, test anchor hits
    if (this.anchorManager.isActive()) {
      const state = this.anchorManager.getState();
      const geometry = state.previewGeometry || state.initialGeometry;
      if (!geometry) return;

      // Hit test anchors in local space - need to transform world to local
      // For MVP, we assume identity transform for path node
      const hit = this.hitTester.hitTestTopmost(worldPos);

      if (hit && hit.kind === 'anchor') {
        this.anchorManager.selectAnchor(hit.anchorIndex!, input.modifiers.shift);
        this.anchorManager.startDrag(hit.anchorIndex!, 'position');
        this.startWorld = { ...worldPos };
        this.isDragging = true;

        if (this.callbacks.onAnchorDragStart) {
          this.callbacks.onAnchorDragStart(hit.anchorIndex!, 'position', worldPos);
        }
        if (this.callbacks.onAnchorSelect) {
          this.callbacks.onAnchorSelect(this.anchorManager.getState().selectedAnchorIndices);
        }
        return;
      }

      if (hit && hit.kind === 'handle') {
        const handleKind = hit.handleKind === 'in' ? 'in' : 'out';
        this.anchorManager.startDrag(hit.anchorIndex!, handleKind as any);
        this.startWorld = { ...worldPos };
        this.isDragging = true;

        if (this.callbacks.onAnchorDragStart) {
          this.callbacks.onAnchorDragStart(hit.anchorIndex!, handleKind as any, worldPos);
        }
        return;
      }

      // Click on empty in anchor mode - maybe clear?
      if (!hit) {
        this.anchorManager.clearSelection();
        if (this.callbacks.onAnchorSelect) {
          this.callbacks.onAnchorSelect([]);
        }
      }
    } else {
      // Not editing - check if we hit a path object to start editing
      const hit = this.hitTester.hitTestTopmost(worldPos);
      if (hit && hit.objectId) {
        const obj = this.stores.objectStore.get(hit.objectId);
        if (obj) {
          const geom = this.stores.geometryStore.get(obj.geometryRef);
          if (geom && geom.type === 'path') {
            this.anchorManager.startEditing(hit.nodeId, geom);
            // Now select the anchor if hit
            if (hit.kind === 'anchor' || hit.kind === 'handle') {
              if (hit.kind === 'anchor') {
                this.anchorManager.selectAnchor(hit.anchorIndex!);
              }
              if (this.callbacks.onAnchorSelect) {
                this.callbacks.onAnchorSelect(this.anchorManager.getState().selectedAnchorIndices);
              }
            }
          }
        }
      }
    }
  }

  pointerMove(input: PointerInput): void {
    if (!this.isDragging || !this.startWorld) return;

    const worldPos = this.viewport.screenToWorld(input.position);
    const delta = { x: worldPos.x - this.startWorld.x, y: worldPos.y - this.startWorld.y };

    this.anchorManager.updateDrag(delta);

    const preview = this.anchorManager.getPreviewGeometry();
    if (this.callbacks.onAnchorDragUpdate && preview) {
      this.callbacks.onAnchorDragUpdate(preview);
    }
  }

  pointerUp(input: PointerInput): void {
    if (this.isDragging) {
      const result = this.anchorManager.endDrag();
      this.isDragging = false;
      this.startWorld = null;

      if (this.callbacks.onAnchorDragEnd && result.previewGeometry) {
        this.callbacks.onAnchorDragEnd(result.initialGeometry, result.previewGeometry);
      }
    }
  }

  keyDown(input: KeyboardInput): void {}

  keyUp(input: KeyboardInput): void {}

  cancel(): void {
    this.anchorManager.cancel();
    this.isDragging = false;
    this.startWorld = null;
    if (this.callbacks.onAnchorDragCancel) {
      this.callbacks.onAnchorDragCancel();
    }
  }
}
