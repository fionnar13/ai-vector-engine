
import { BBox } from '../geometry/types.js';
import { InteractionOverlay, Handle, Guide } from './types.js';
import { NodeID } from '../ids/index.js';

export class OverlayManager {
  private overlay: InteractionOverlay = {};

  getOverlay(): InteractionOverlay {
    return { ...this.overlay };
  }

  setSelectionBounds(bounds: BBox | undefined): void {
    this.overlay = { ...this.overlay, selectionBounds: bounds };
  }

  setHandles(handles: Handle[] | undefined): void {
    this.overlay = { ...this.overlay, handles };
  }

  setMarquee(marquee: BBox | undefined): void {
    this.overlay = { ...this.overlay, marquee };
  }

  setHoverOutline(nodeId: NodeID | undefined): void {
    this.overlay = { ...this.overlay, hoverOutline: nodeId };
  }

  setGuides(guides: Guide[] | undefined): void {
    this.overlay = { ...this.overlay, guides };
  }

  clear(): void {
    this.overlay = {};
  }

  clearSelection(): void {
    const { selectionBounds, handles, ...rest } = this.overlay;
    this.overlay = rest;
  }

  clearMarquee(): void {
    const { marquee, ...rest } = this.overlay;
    this.overlay = rest;
  }

  clearHover(): void {
    const { hoverOutline, ...rest } = this.overlay;
    this.overlay = rest;
  }
}
