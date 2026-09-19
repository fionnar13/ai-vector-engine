
import { Contour } from './types.js';
import { signedAreaOfContour, computeOrientation } from './contour.js';

export function getOrientation(contour: Contour) {
  return computeOrientation(contour.anchors);
}

export function isClockwise(contour: Contour): boolean {
  return computeOrientation(contour.anchors) === 'cw';
}

export { signedAreaOfContour };
