
import { Vec2 } from '../math/vec2.js';
import { BBox } from '../math/bbox.js';

// Brand for geometry IDs
export type FillRule = 'nonZero' | 'evenOdd';
export type Orientation = 'cw' | 'ccw' | 'unknown';
export type AnchorType = 'corner' | 'smooth' | 'symmetric';

export interface RectParams {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  ry: number;
}

export interface EllipseParams {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface PolygonParams {
  points: Vec2[];
}

export interface StarParams {
  center: Vec2;
  outerRadius: number;
  innerRadius: number;
  points: number;
  rotationDegrees: number;
}

export interface LineParams {
  start: Vec2;
  end: Vec2;
}

export type ParametricType = 'rect' | 'ellipse' | 'polygon' | 'star' | 'line';

export interface RectGeometry {
  readonly isParametric: true;
  readonly type: 'rect';
  readonly params: RectParams;
}

export interface EllipseGeometry {
  readonly isParametric: true;
  readonly type: 'ellipse';
  readonly params: EllipseParams;
}

export interface PolygonGeometry {
  readonly isParametric: true;
  readonly type: 'polygon';
  readonly params: PolygonParams;
}

export interface StarGeometry {
  readonly isParametric: true;
  readonly type: 'star';
  readonly params: StarParams;
}

export interface LineGeometry {
  readonly isParametric: true;
  readonly type: 'line';
  readonly params: LineParams;
}

export type ParametricGeometry = RectGeometry | EllipseGeometry | PolygonGeometry | StarGeometry | LineGeometry;

export interface Anchor {
  readonly id: string;
  readonly position: Vec2;
  readonly handleIn: Vec2;  // relative vector
  readonly handleOut: Vec2; // relative vector
  readonly type: AnchorType;
}

export interface Contour {
  readonly id: string;
  readonly closed: boolean;
  readonly anchors: readonly Anchor[];
  readonly orientation: Orientation;
}

export interface PathGeometry {
  readonly isParametric: false;
  readonly type: 'path';
  readonly contours: readonly Contour[];
  readonly fillRule: FillRule;
}

export type Geometry = ParametricGeometry | PathGeometry;

export interface FlattenedPoint {
  readonly x: number;
  readonly y: number;
}

export interface FlattenedPath {
  readonly contours: readonly (readonly FlattenedPoint[])[];
  readonly closed: readonly boolean[];
}
