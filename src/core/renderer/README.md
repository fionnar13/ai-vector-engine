
# Renderer - Phase 3.07

## Architecture
Canonical State -> READONLY Renderer -> Derived RenderTree -> Canvas2D

Renderer is READONLY derived subsystem. It may READ SceneGraph, ObjectStore, GeometryStore, AppearanceStore, AssetStore, Transform, Artboard but may NOT WRITE ObjectStore, GeometryStore, AppearanceStore, SceneGraph, ConstraintStore, SemanticStore, History, Selection.

Renderer owns only derived/cache state: RenderTree, RenderNode cache, invalidation state, backend resources.

## Data Flow
Canonical Stores -> SceneGraph -> RenderTreeBuilder -> RenderTree -> Canvas2D Renderer -> Screen

Event-driven invalidation:
TransactionCommitted -> Renderer receives event -> Determine affected nodes -> Invalidate RenderTree entries -> Rebuild only affected RenderNodes -> Render

## RenderTree
RenderTree {version, artboardId, nodes, nodeMap}
RenderNode {nodeId, objectId, type group|object|artboard, worldTransform (DERIVED, not persisted), localTransform, geometry (RenderGeometry), appearance (RenderAppearance), visible, locked, opacity, effectiveOpacity = parentOpacity * localOpacity clamped 0..1, children, depth}

worldTransform is DERIVED: World = ParentWorld × Local, Root World = Local, Top-Left origin X→Right Y→Down, Matrix [a c tx; b d ty; 0 0 1] column vectors.

## SceneGraph Traversal
Parent -> Children in SceneGraph.children order deterministic, children[] authoritative for Z-order, no ObjectID sort, no timestamp sort.

## Geometry Resolution
MVP: Rect, Ellipse, Path, Polygon, Star, Line, PointText
Parametric Geometry -> Renderer-specific derived representation (temporary derived path, flattened path, tessellation, cache) - forbidden GeometryStore.write(convertedPath) unless via explicit Mutation Tool/Transaction outside Renderer. Canonical GeometryStore remains unchanged, isParametric remains true.

## Appearance Resolution
Fill solid color, Stroke solid color width, Opacity. Unsupported: Gradient, Pattern, Brush, Mesh, Effects, Symbol -> safe fallback + renderer warning, no crash, no mutation.

FillRule: nonZero, evenOdd - preserve distinction between Contour.orientation and PathGeometry.fillRule.

Stroke: color, width >0 render, =0 no visible stroke, must not alter canonical Geometry.

Opacity: effectiveOpacity = parentOpacity × localOpacity clamped 0..1, not written back to AppearanceStore.

Visibility: respect SceneNode/Object visibility, hidden group children not visible, preserve semantics.

Locked: locked ≠ invisible, locked objects remain renderable, interaction in Phase 3.08.

Selection: Renderer 3.07 must NOT own Selection state, no selected boolean in RenderNode, temporary overlay via renderer-local layer only.

Artboard: x,y,width,height,background MVP 1 Document 1 Artboard, bounds separate from geometry.

## Canvas2D Backend
Renderer Core -> RenderTree -> CanvasRenderer -> Canvas2DAdapter. Core testable without DOM, browser APIs only in backend.

RenderCommands: Save, Restore, SetTransform, SetOpacity, BeginPath, MoveTo, LineTo, CubicTo, ClosePath, Fill, Stroke, DrawText - deterministic Geometry → Render Commands → Backend.

Transform: canonical geometry + world transform → renderer, never permanently transformed geometry → GeometryStore.

BBox: GeometryBBox, WorldBBox, VisualBBox, StrokeBBox - culling uses VisualBBox, SpatialIndex uses WorldBBox, Renderer must NOT change SpatialIndex directly.

Viewport Culling: RenderTree node VisualBBox intersects viewport? YES→render NO→skip, never affect canonical, if disabled all visible render, if stale prefer correctness.

Invalidation: Subscribe TransactionCommitted, determine added/removed/modified nodes/appearance/geometry/transforms/sceneGraph, invalidate only affected when safe, Move Object A -> ObjectUpdated -> A RenderNode invalidated -> WorldBBox recalculated -> A rebuilt. Group transform invalidates descendants.

Full Rebuild Conditions: initial render, Import, Artboard replacement, SceneGraph structural replacement, cache corruption, explicit rebuild - not default for every transaction.

Event Ordering: Command Execute -> Validate -> Commit -> Diff -> Events -> Renderer Invalidation -> Render - never render before Commit, never subscribe pre-commit.

Determinism: Identical canonical state -> RenderTree(A) === RenderTree(A) - no Object iteration order, Map insertion accidents, random IDs, current time, browser timing.

Error Handling: RENDER_INVALID_GEOMETRY, RENDER_UNSUPPORTED_APPEARANCE, RENDER_MISSING_OBJECT, RENDER_MISSING_GEOMETRY, RENDER_MISSING_APPEARANCE, RENDER_INVALID_TRANSFORM, RENDER_CANVAS_FAILURE - fail safely, skip failed object with diagnostic, don't crash engine.

Missing References: ObjectStore has object but GeometryStore missing geometryRef -> diagnostic + skip, don't auto-create, Appearance missing -> safe default if permitted otherwise skip with warning, don't mutate canonical to repair.

Text MVP: PointText content, fontFamily, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing, textAlign, fill, position, transform - respect baseline, size, style, weight, alignment, transform, opacity, fallback system-ui + FONT_FALLBACK diagnostic, no Area Text/Text on Path/shaping.

Ownership: Renderer owns RenderTree, RenderNode cache, invalidation, backend resources, NOT Objects/Geometry/Appearance/Hierarchy/Constraints/Semantics/History/Selection.

API: initialize(config), buildRenderTree(), render(viewport?), invalidate(nodeIds), invalidateAll(), dispose() - no breaking previous contracts.

RenderResult: success, renderedNodeCount, skippedNodeCount, diagnostics, commands.

Browser Boundary: window, document, HTMLElement, HTMLCanvasElement, CanvasRenderingContext2D forbidden in RenderTreeBuilder, RenderTree, RenderGeometry, RenderAppearance, Renderer Core - only in Canvas2DAdapter.

Dependency: May depend on Math, Geometry, ObjectStore read, GeometryStore read, AppearanceStore read, SceneGraph read, AssetStore read, EventBus, Validation, Errors. Must NOT depend on Interaction, Planner, Critic, AI, DSL, Memory.
