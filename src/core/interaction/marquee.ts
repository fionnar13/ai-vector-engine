
import { Vec2 } from '../math/types.js';
import { BBox } from '../geometry/types.js';
import { MarqueeState, InteractionConfig } from './types.js';
import { NodeID } from '../ids/index.js';

export class MarqueeManager {
  private state: MarqueeState;
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
      startWorld: null,
      currentWorld: null,
      bounds: null
    };
  }

  getState(): MarqueeState {
    return {
      ...this.state,
      startWorld: this.state.startWorld ? { ...this.state.startWorld } : null,
      currentWorld: this.state.currentWorld ? { ...this.state.currentWorld } : null,
      bounds: this.state.bounds ? { ...this.state.bounds } : null
    };
  }

  startMarquee(startWorld: Vec2): void {
    this.state = {
      isActive: true,
      startWorld: { ...startWorld },
      currentWorld: { ...startWorld },
      bounds: {
        minX: startWorld.x,
        minY: startWorld.y,
        maxX: startWorld.x,
        maxY: startWorld.y
      }
    };
  }

  updateMarquee(currentWorld: Vec2): void {
    if (!this.state.isActive || !this.state.startWorld) return;

    const minX = Math.min(this.state.startWorld.x, currentWorld.x);
    const minY = Math.min(this.state.startWorld.y, currentWorld.y);
    const maxX = Math.max(this.state.startWorld.x, currentWorld.x);
    const maxY = Math.max(this.state.startWorld.y, currentWorld.y);

    this.state = {
      isActive: true,
      startWorld: this.state.startWorld,
      currentWorld: { ...currentWorld },
      bounds: { minX, minY, maxX, maxY }
    };
  }

  getBounds(): BBox | null {
    return this.state.bounds ? { ...this.state.bounds } : null;
  }

  isActive(): boolean {
    return this.state.isActive;
  }

  endMarquee(): BBox | null {
    const bounds = this.state.bounds ? { ...this.state.bounds } : null;
    this.reset();
    return bounds;
  }

  cancel(): void {
    this.reset();
  }

  reset(): void {
    this.state = {
      isActive: false,
      startWorld: null,
      currentWorld: null,
      bounds: null
    };
  }

  // Test if a node BBox intersects marquee
  testIntersection(bbox: BBox): boolean {
    if (!this.state.bounds) return false;

    if (this.config.selectionMode === 'contained') {
      return (
        bbox.minX >= this.state.bounds.minX &&
        bbox.maxX <= this.state.bounds.maxX &&
        bbox.minY >= this.state.bounds.minY &&
        bbox.maxY <= this.state.bounds.maxY
      );
    } else {
      // intersects
      return !(
        bbox.maxX < this.state.bounds.minX ||
        bbox.minX > this.state.bounds.maxX ||
        bbox.maxY < this.state.bounds.minY ||
        bbox.minY > this.state.bounds.maxY
      );
    }
  }
}
