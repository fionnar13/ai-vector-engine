
import { Viewport } from './types.js';

export function createViewport(x: number, y: number, width: number, height: number): Viewport {
  return { x, y, width, height };
}

export function viewportIntersects(a: Viewport, b: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  return !(b.maxX < a.x || b.minX > a.x + a.width || b.maxY < a.y || b.minY > a.y + a.height);
}
