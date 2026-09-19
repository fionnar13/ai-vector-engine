
import { Vec2 } from '../math/types.js';
import { AnchorInteractionState, InteractionConfig } from './types.js';
import { NodeID } from '../ids/index.js';

export class AnchorInteractionManager {
  private state: AnchorInteractionState;
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
      pathNodeId: null,
      selectedAnchorIndices: [],
      hoveredAnchorIndex: null,
      dragAnchorIndex: null,
      dragHandleKind: null,
      initialGeometry: null,
      previewGeometry: null
    };
  }

  getState(): AnchorInteractionState {
    return {
      ...this.state,
      selectedAnchorIndices: [...this.state.selectedAnchorIndices],
      initialGeometry: this.state.initialGeometry ? JSON.parse(JSON.stringify(this.state.initialGeometry)) : null,
      previewGeometry: this.state.previewGeometry ? JSON.parse(JSON.stringify(this.state.previewGeometry)) : null
    };
  }

  startEditing(pathNodeId: NodeID, geometry: any): void {
    this.state = {
      isActive: true,
      pathNodeId,
      selectedAnchorIndices: [],
      hoveredAnchorIndex: null,
      dragAnchorIndex: null,
      dragHandleKind: null,
      initialGeometry: JSON.parse(JSON.stringify(geometry)),
      previewGeometry: JSON.parse(JSON.stringify(geometry))
    };
  }

  selectAnchor(index: number, additive = false): void {
    if (additive) {
      if (this.state.selectedAnchorIndices.includes(index)) {
        this.state = {
          ...this.state,
          selectedAnchorIndices: this.state.selectedAnchorIndices.filter(i => i !== index)
        };
      } else {
        this.state = {
          ...this.state,
          selectedAnchorIndices: [...this.state.selectedAnchorIndices, index]
        };
      }
    } else {
      this.state = {
        ...this.state,
        selectedAnchorIndices: [index]
      };
    }
  }

  clearSelection(): void {
    this.state = {
      ...this.state,
      selectedAnchorIndices: []
    };
  }

  startDrag(anchorIndex: number, handleKind: 'position' | 'in' | 'out'): void {
    this.state = {
      ...this.state,
      dragAnchorIndex: anchorIndex,
      dragHandleKind: handleKind
    };
  }

  updateDrag(delta: Vec2): void {
    if (this.state.dragAnchorIndex === null || !this.state.previewGeometry) return;

    const preview = JSON.parse(JSON.stringify(this.state.previewGeometry));
    const initial = this.state.initialGeometry;

    if (!preview.contours || preview.contours.length === 0) return;

    // For MVP, assume first contour
    const contour = preview.contours[0];
    const initialContour = initial.contours[0];

    if (this.state.dragAnchorIndex >= contour.anchors.length) return;

    const anchor = contour.anchors[this.state.dragAnchorIndex];
    const initialAnchor = initialContour.anchors[this.state.dragAnchorIndex];

    if (this.state.dragHandleKind === 'position') {
      // Move anchor position
      anchor.position = {
        x: initialAnchor.position.x + delta.x,
        y: initialAnchor.position.y + delta.y
      };

      // For smooth/symmetric anchors, move handles accordingly
      if (anchor.type === 'smooth' || anchor.type === 'symmetric') {
        // Handles maintain relative offset, so they move with anchor
        // Already handled by relative coordinates, but if handles are absolute, they need adjustment
        // In our model, handleIn/handleOut are relative, so moving position automatically moves handles in world space
      }
    } else if (this.state.dragHandleKind === 'in') {
      // Move handleIn - relative coordinates
      const newHandleIn = {
        x: initialAnchor.handleIn.x + delta.x,
        y: initialAnchor.handleIn.y + delta.y
      };
      anchor.handleIn = newHandleIn;

      // Handle symmetric/smooth constraints
      if (anchor.type === 'symmetric') {
        anchor.handleOut = { x: -newHandleIn.x, y: -newHandleIn.y };
      } else if (anchor.type === 'smooth') {
        // Keep collinear but allow different magnitude - preserve direction opposite
        const lenIn = Math.hypot(newHandleIn.x, newHandleIn.y);
        if (lenIn > 1e-10) {
          const lenOut = Math.hypot(anchor.handleOut.x, anchor.handleOut.y);
          const dirIn = { x: newHandleIn.x / lenIn, y: newHandleIn.y / lenIn };
          // Opposite direction
          const opposite = { x: -dirIn.x, y: -dirIn.y };
          anchor.handleOut = { x: opposite.x * lenOut, y: opposite.y * lenOut };
        }
      }
    } else if (this.state.dragHandleKind === 'out') {
      const newHandleOut = {
        x: initialAnchor.handleOut.x + delta.x,
        y: initialAnchor.handleOut.y + delta.y
      };
      anchor.handleOut = newHandleOut;

      if (anchor.type === 'symmetric') {
        anchor.handleIn = { x: -newHandleOut.x, y: -newHandleOut.y };
      } else if (anchor.type === 'smooth') {
        const lenOut = Math.hypot(newHandleOut.x, newHandleOut.y);
        if (lenOut > 1e-10) {
          const lenIn = Math.hypot(anchor.handleIn.x, anchor.handleIn.y);
          const dirOut = { x: newHandleOut.x / lenOut, y: newHandleOut.y / lenOut };
          const opposite = { x: -dirOut.x, y: -dirOut.y };
          anchor.handleIn = { x: opposite.x * lenIn, y: opposite.y * lenIn };
        }
      }
    }

    this.state = {
      ...this.state,
      previewGeometry: preview
    };
  }

  getPreviewGeometry(): any | null {
    return this.state.previewGeometry ? JSON.parse(JSON.stringify(this.state.previewGeometry)) : null;
  }

  getInitialGeometry(): any | null {
    return this.state.initialGeometry ? JSON.parse(JSON.stringify(this.state.initialGeometry)) : null;
  }

  isActive(): boolean {
    return this.state.isActive;
  }

  isDragging(): boolean {
    return this.state.dragAnchorIndex !== null;
  }

  endDrag(): { initialGeometry: any; previewGeometry: any; anchorIndex: number | null; handleKind: 'position' | 'in' | 'out' | null } {
    const result = {
      initialGeometry: this.state.initialGeometry ? JSON.parse(JSON.stringify(this.state.initialGeometry)) : null,
      previewGeometry: this.state.previewGeometry ? JSON.parse(JSON.stringify(this.state.previewGeometry)) : null,
      anchorIndex: this.state.dragAnchorIndex,
      handleKind: this.state.dragHandleKind
    };

    this.state = {
      ...this.state,
      dragAnchorIndex: null,
      dragHandleKind: null,
      initialGeometry: this.state.previewGeometry ? JSON.parse(JSON.stringify(this.state.previewGeometry)) : this.state.initialGeometry,
      previewGeometry: this.state.previewGeometry ? JSON.parse(JSON.stringify(this.state.previewGeometry)) : null
    };

    return result;
  }

  endEditing(): { initialGeometry: any; previewGeometry: any } {
    const result = {
      initialGeometry: this.state.initialGeometry ? JSON.parse(JSON.stringify(this.state.initialGeometry)) : null,
      previewGeometry: this.state.previewGeometry ? JSON.parse(JSON.stringify(this.state.previewGeometry)) : null
    };
    this.reset();
    return result;
  }

  cancel(): void {
    // Restore initial geometry as preview
    if (this.state.initialGeometry) {
      this.state = {
        ...this.state,
        previewGeometry: JSON.parse(JSON.stringify(this.state.initialGeometry)),
        dragAnchorIndex: null,
        dragHandleKind: null
      };
    }
    this.reset();
  }

  reset(): void {
    this.state = {
      isActive: false,
      pathNodeId: null,
      selectedAnchorIndices: [],
      hoveredAnchorIndex: null,
      dragAnchorIndex: null,
      dragHandleKind: null,
      initialGeometry: null,
      previewGeometry: null
    };
  }
}
