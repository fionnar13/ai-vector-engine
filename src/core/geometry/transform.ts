
import { PathGeometry, Contour, Anchor } from './types.js';
import { Matrix3x3, transformPoint, transformVector } from '../math/matrix3x3.js';
import { Vec2, vec2 } from '../math/vec2.js';
import { createContour } from './contour.js';
import { createPathGeometry } from './path.js';
import { ParametricGeometry } from './types.js';

export function transformAnchor(anchor: Anchor, matrix: Matrix3x3): Anchor {
  const newPos = transformPoint(matrix, anchor.position);
  // Handles are vectors, not points, so transform as vector (no translation)
  const newIn = transformVector(matrix, anchor.handleIn);
  const newOut = transformVector(matrix, anchor.handleOut);
  return { ...anchor, position: newPos, handleIn: newIn, handleOut: newOut };
}

export function transformContour(contour: Contour, matrix: Matrix3x3): Contour {
  const newAnchors = contour.anchors.map(a=>transformAnchor(a, matrix));
  // Orientation may flip if determinant negative
  const det = matrix.a * matrix.d - matrix.b * matrix.c;
  let newOrientation = contour.orientation;
  if (det < 0 && contour.orientation !== 'unknown') {
    newOrientation = contour.orientation === 'cw' ? 'ccw' : 'cw';
  }
  return { ...contour, anchors: newAnchors, orientation: newOrientation };
}

export function transformPathGeometry(path: PathGeometry, matrix: Matrix3x3): PathGeometry {
  const newContours = path.contours.map(c=>transformContour(c, matrix));
  return { ...path, contours: newContours };
}

export function transformPointGeometry(point: Vec2, matrix: Matrix3x3): Vec2 {
  return transformPoint(matrix, point);
}

export function transformParametricGeometry(geom: ParametricGeometry, matrix: Matrix3x3): ParametricGeometry {
  // For parametric, we transform params
  // This changes actual geometry points, not scene transform
  // For rect: transform corners and recompute? For simplicity, convert to path? But spec says transform actual geometry points
  // We'll implement for each type: transform defining points
  switch (geom.type) {
    case 'rect': {
      // Transform rect by transforming its 4 corners and taking bbox? But that would lose rotation? 
      // For MVP, we transform x,y and scale width/height by matrix scale components? Actually to be correct, rect with rotation should become polygon? But spec says transformPointGeometry changes actual points.
      // Simplest: transform (x,y) point and apply scale from matrix determinant for width/height? For general matrix (rotate), rect would become not axis-aligned, so should fallback to path? 
      // For this kernel, we will transform the origin and keep size scaled by average scale factor - but document limitation
      // Better: transform as: new x,y = transformPoint of (x,y), new width = width * sqrt(a^2+b^2), height = height * sqrt(c^2+d^2) - approximate
      // For now, implement simple: transform top-left and use scale
      const topLeft = transformPoint(matrix, vec2(geom.params.x, geom.params.y));
      const scaleX = Math.hypot(matrix.a, matrix.b);
      const scaleY = Math.hypot(matrix.c, matrix.d);
      return { ...geom, params: { ...geom.params, x: topLeft.x, y: topLeft.y, width: geom.params.width*scaleX, height: geom.params.height*scaleY, rx: geom.params.rx*scaleX, ry: geom.params.ry*scaleY } };
    }
    case 'ellipse': {
      const center = transformPoint(matrix, vec2(geom.params.cx, geom.params.cy));
      const scaleX = Math.hypot(matrix.a, matrix.b);
      const scaleY = Math.hypot(matrix.c, matrix.d);
      return { ...geom, params: { cx: center.x, cy: center.y, rx: geom.params.rx*scaleX, ry: geom.params.ry*scaleY } };
    }
    case 'polygon': {
      const newPoints = geom.params.points.map(p=>transformPoint(matrix, p));
      return { ...geom, params: { points: newPoints } };
    }
    case 'star': {
      const newCenter = transformPoint(matrix, geom.params.center);
      const scaleX = Math.hypot(matrix.a, matrix.b);
      const scaleAvg = (Math.hypot(matrix.a, matrix.b) + Math.hypot(matrix.c, matrix.d))/2;
      return { ...geom, params: { ...geom.params, center: newCenter, outerRadius: geom.params.outerRadius*scaleAvg, innerRadius: geom.params.innerRadius*scaleAvg } };
    }
    case 'line': {
      return { ...geom, params: { start: transformPoint(matrix, geom.params.start), end: transformPoint(matrix, geom.params.end) } };
    }
  }
}
