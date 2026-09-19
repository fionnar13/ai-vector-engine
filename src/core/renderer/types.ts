
import { NodeID, ObjectID } from '../ids/index.js';
import { Matrix3x3 } from '../math/types.js';

export type RenderNodeType = 'group' | 'object' | 'artboard';

export interface RenderGeometry {
  readonly type: 'rect' | 'ellipse' | 'path' | 'polygon' | 'star' | 'line' | 'text' | 'unknown';
  readonly canonicalType: string;
  readonly params?: any;
  readonly pathData?: any;
}

export interface RenderAppearance {
  readonly fills: { color: { r: number; g: number; b: number; a: number }; opacity: number }[];
  readonly strokes: { color: { r: number; g: number; b: number; a: number }; width: number; opacity: number }[];
  readonly opacity: number;
}

export interface RenderNode {
  readonly nodeId: NodeID;
  readonly objectId: ObjectID | null;
  readonly type: RenderNodeType;
  readonly worldTransform: Matrix3x3;
  readonly localTransform: Matrix3x3;
  readonly geometry: RenderGeometry | null;
  readonly appearance: RenderAppearance | null;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly effectiveOpacity: number;
  readonly children: RenderNode[];
  readonly depth: number;
}

export interface RenderTree {
  readonly version: number;
  readonly artboardId: string | null;
  readonly nodes: RenderNode[];
  readonly nodeMap: Map<string, RenderNode>;
}

export type RenderCommandType =
  | 'Save'
  | 'Restore'
  | 'SetTransform'
  | 'SetOpacity'
  | 'BeginPath'
  | 'MoveTo'
  | 'LineTo'
  | 'CubicTo'
  | 'ClosePath'
  | 'Fill'
  | 'Stroke'
  | 'DrawText'
  | 'ClipArtboard';

export interface RenderCommand {
  readonly type: RenderCommandType;
  readonly payload?: any;
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RenderResult {
  readonly success: boolean;
  readonly renderedNodeCount: number;
  readonly skippedNodeCount: number;
  readonly diagnostics: RenderDiagnostic[];
  readonly commands?: RenderCommand[];
}

export interface RenderDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
  readonly severity: 'warning' | 'error';
}

export interface RendererConfig {
  readonly width?: number;
  readonly height?: number;
  readonly background?: string;
  readonly enableCulling?: boolean;
}

export interface Artboard {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly background?: string;
}
