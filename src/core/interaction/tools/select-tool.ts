
import { InteractionTool, PointerInput, KeyboardInput } from '../types.js';
import { HitTester } from '../hit-test.js';
import { SelectionManager } from '../selection.js';
import { HoverManager } from '../hover.js';
import { ViewportTransform } from '../viewport.js';
import { NodeID } from '../../ids/index.js';

export class SelectTool implements InteractionTool {
  readonly id = 'select';

  private hitTester: HitTester;
  private selection: SelectionManager;
  private hover: HoverManager;
  private viewport: ViewportTransform;
  private onSelectionChanged?: (nodeIds: NodeID[]) => void;

  constructor(
    hitTester: HitTester,
    selection: SelectionManager,
    hover: HoverManager,
    viewport: ViewportTransform,
    onSelectionChanged?: (nodeIds: NodeID[]) => void
  ) {
    this.hitTester = hitTester;
    this.selection = selection;
    this.hover = hover;
    this.viewport = viewport;
    this.onSelectionChanged = onSelectionChanged;
  }

  pointerDown(input: PointerInput): void {
    const worldPos = this.viewport.screenToWorld(input.position);
    const hit = this.hitTester.hitTestTopmost(worldPos);

    if (hit) {
      if (input.modifiers.shift || input.modifiers.ctrl || input.modifiers.meta) {
        this.selection.toggle(hit.nodeId);
      } else {
        if (!this.selection.isSelected(hit.nodeId)) {
          this.selection.replaceSelection([hit.nodeId]);
        } else {
          this.selection.setActiveNode(hit.nodeId);
        }
      }
      if (this.onSelectionChanged) {
        this.onSelectionChanged(this.selection.getState().selectedNodeIds);
      }
    } else {
      // Click on empty - clear selection unless modifier
      if (!input.modifiers.shift && !input.modifiers.ctrl && !input.modifiers.meta) {
        this.selection.clearSelection();
        if (this.onSelectionChanged) {
          this.onSelectionChanged([]);
        }
      }
    }
  }

  pointerMove(input: PointerInput): void {
    const worldPos = this.viewport.screenToWorld(input.position);
    const hit = this.hitTester.hitTestTopmost(worldPos);
    if (hit) {
      this.hover.setHover(hit.nodeId, hit.kind);
    } else {
      this.hover.clear();
    }
  }

  pointerUp(input: PointerInput): void {
    // No-op for select tool
  }

  keyDown(input: KeyboardInput): void {
    // Delete handled by interaction engine
  }

  keyUp(input: KeyboardInput): void {}

  cancel(): void {
    this.hover.clear();
  }
}
