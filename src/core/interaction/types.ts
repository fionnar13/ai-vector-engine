
import { NodeID, ObjectID } from '../ids/index.js';
import { Vec2, Matrix3x3 } from '../math/types.js';
import { BBox } from '../geometry/types.js';
import { PointerInput, KeyboardInput, Modifiers } from './input.js';

export type InteractionState =
  | 'Idle'
  | 'Hover'
  | 'Pressed'
  | 'Dragging'
  | 'MarqueeSelecting'
  | 'Transforming'
  | 'AnchorEditing';

export interface HitTestResult {
  readonly nodeId: NodeID;
  readonly objectId: ObjectID | null;
  readonly kind: 'fill' | 'stroke' | 'anchor' | 'handle' | 'none';
  readonly distance: number;
  readonly worldPoint: Vec2;
  readonly localPoint?: Vec2;
  readonly anchorIndex?: number;
  readonly handleKind?: 'in' | 'out';
}

export interface HitTestResults {
  readonly hits: HitTestResult[];
}

export interface SelectionState {
  readonly selectedNodeIds: NodeID[];
  readonly activeNodeId: NodeID | null;
}

export interface HoverState {
  readonly nodeId: NodeID | null;
  readonly kind: HitTestResult['kind'] | null;
}

export interface PointerState {
  readonly pointerId: number | null;
  readonly downPosition: Vec2 | null;
  readonly downWorldPosition: Vec2 | null;
  readonly currentPosition: Vec2 | null;
  readonly currentWorldPosition: Vec2 | null;
  readonly isDown: boolean;
  readonly modifiers: Modifiers;
}

export interface DragState {
  readonly isDragging: boolean;
  readonly dragThreshold: number;
  readonly startWorld: Vec2 | null;
  readonly currentWorld: Vec2 | null;
  readonly delta: Vec2;
  readonly initialTransforms: Map<string, Matrix3x3>;
  readonly previewTransform: Matrix3x3 | null;
}

export interface MarqueeState {
  readonly isActive: boolean;
  readonly startWorld: Vec2 | null;
  readonly currentWorld: Vec2 | null;
  readonly bounds: BBox | null;
}

export interface TransformInteractionState {
  readonly isActive: boolean;
  readonly mode: 'move' | 'scale' | 'rotate' | null;
  readonly pivot: Vec2 | null;
  readonly initialBounds: BBox | null;
  readonly initialTransforms: Map<string, Matrix3x3>;
  readonly previewMatrix: Matrix3x3 | null;
}

export interface AnchorInteractionState {
  readonly isActive: boolean;
  readonly pathNodeId: NodeID | null;
  readonly selectedAnchorIndices: number[];
  readonly hoveredAnchorIndex: number | null;
  readonly dragAnchorIndex: number | null;
  readonly dragHandleKind: 'position' | 'in' | 'out' | null;
  readonly initialGeometry: any | null;
  readonly previewGeometry: any | null;
}

export interface InteractionMode {
  readonly tool: string;
  readonly state: InteractionState;
}

export interface InteractionOverlay {
  readonly selectionBounds?: BBox;
  readonly handles?: Handle[];
  readonly marquee?: BBox;
  readonly hoverOutline?: NodeID;
  readonly guides?: Guide[];
  readonly previewTransforms?: Map<string, Matrix3x3>;
  readonly previewGeometry?: Map<string, any>;
}

export interface Handle {
  readonly kind: 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'rotation';
  readonly position: Vec2;
  readonly worldPosition: Vec2;
}

export interface Guide {
  readonly orientation: 'horizontal' | 'vertical';
  readonly position: number;
}

export interface InteractionPreview {
  readonly transforms?: Map<string, Matrix3x3>;
  readonly geometries?: Map<string, any>;
  readonly overlay?: InteractionOverlay;
}

export interface InteractionTool {
  readonly id: string;
  pointerDown(input: PointerInput): void;
  pointerMove(input: PointerInput): void;
  pointerUp(input: PointerInput): void;
  keyDown(input: KeyboardInput): void;
  keyUp(input: KeyboardInput): void;
  cancel(): void;
}

export interface InteractionConfig {
  readonly hitTolerance: number;
  readonly dragThreshold: number;
  readonly anchorHitTolerance: number;
  readonly handleHitTolerance: number;
  readonly keyboardMoveStep: number;
  readonly keyboardMoveStepShift: number;
  readonly selectionMode: 'intersects' | 'contained';
  readonly allowLockedSelection: boolean;
  readonly allowHiddenSelection: boolean;
  readonly pivotMode: 'selectionCenter' | 'worldOrigin';
}

export interface InteractionCaptureRequest {
  readonly pointerId: number;
  readonly capture: boolean;
}

export type SelectionEventType = 'SelectionChanged' | 'HoverChanged';

export interface SelectionEvent {
  readonly type: SelectionEventType;
  readonly selection: SelectionState;
  readonly source: 'user' | 'system';
}

export interface HitTestOptions {
  readonly includeLocked?: boolean;
  readonly includeHidden?: boolean;
  readonly hitTolerance?: number;
  readonly onlySelectable?: boolean;
}
