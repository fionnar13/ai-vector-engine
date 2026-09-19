
# Interaction Engine — Phase 3.08

Implements transient interaction state, never owning canonical document state.

Pipeline:
Pointer/Keyboard Input → State Machine → HitTest → Selection → Intent → Command → Transaction → Canonical Stores → EventBus → Renderer Invalidation → Render

Ownership:
- Owns: Selection, Hover, ActiveTool, PointerState, DragState, MarqueeState, InteractionMode, Temporary Guides, Temporary Preview
- Does NOT own: ObjectStore, GeometryStore, AppearanceStore, SceneGraph, ConstraintStore, SemanticStore, History, RenderTree

All persistent mutations via Command → Transaction → Commit.

Core:
- Abstract input: PointerInput, KeyboardInput, Modifiers — browser adapter translates PointerEvent→PointerInput
- ViewportTransform: screenToWorld, worldToScreen — never mutate canonical geometry for coordinate conversion
- HitTest READONLY: SpatialIndex.queryPoint() → candidates → SceneGraph ordering → precise geometry + appearance stroke test → HitTestResult — Z-order authoritative via SceneGraph children order, not ObjectID/timestamp
- Fill: pointInPolygon respecting nonZero/evenOdd
- Stroke: distance <= strokeWidth/2 + hitTolerance
- Curves: distancePointToBezier reuse Phase 3.02
- SpatialIndex candidate accelerator, fallback to SceneGraph traversal

Selection transient, not persisted into ObjectStore, deterministic order.

Pointer State Machine: Idle, Hover, Pressed, Dragging, MarqueeSelecting, Transforming, AnchorEditing — explicit transitions.

Drag: PointerMove ≠ Document Mutation — capture initial state → preview transient → PointerUp → Command → Transaction → Commit — canonical unchanged during preview.

Transform: Move/Scale/Rotate using Matrix3x3 Phase 3.01, pivot selection WorldBBox center, T(pivot)×Scale×T(-pivot), Y-down Clockwise positive Degrees public API.

Anchor Editing: PathGeometry only, anchor/handleIn/handleOut, corner independent, smooth collinear, symmetric collinear+equal magnitude — preview transient → update_geometry Command → Transaction.

Marquee: PointerDown start → PointerMove rectangle → PointerUp query SpatialIndex → BBox intersection/containment → selection update — No Transaction during marquee, only transient Selection.

Keyboard: Arrow 1 unit, Shift multiplies — Delete → delete_object Command → Transaction → snapshot undo.

Transaction Boundary: One gesture = ONE Transaction — mouseDown/move/move/up → 1 Transaction preserves Undo/Redo.

Cancel: Escape/pointercancel/tool switch → discard preview, no mutation, no history entry, rollback if transaction begun internally.

SelectionChanged not document mutation, no History.

Tool Registry: select, move, scale, rotate, anchor — each receives abstract input.

Command Integration: Interaction determines intent, Command mutation semantics, Transaction atomicity.

Overlay: InteractionOverlay selectionBounds/handles/marquee/hoverOutline/guides transient, not canonical — Interaction → Overlay → Renderer, not Renderer → read Selection → mutate.

Event ordering: Gesture → Command → Transaction → Validate → Commit → Diff → Events → SpatialIndex invalidation → RenderTree invalidation → Render — never ObjectUpdated before Commit.

Determinism: identical Initial State + Input Sequence + Tool Config → deterministic result — no random/timing/DOM assumptions.

Performance: PointerMove no Transaction, transient preview, Commit only on completion, no rebuild all canonical on every pointer event.

Multi-object transform: selection WorldBBox defines frame, same group transform mathematically, no actual SceneGraph group.

Repeated transforms: preview derives from initial canonical + current delta, not previous preview — mandatory for determinism.

Pointer capture: Core only normalized input, browser adapter setPointerCapture.

Multi-touch: ignore unsupported combinations safely.
