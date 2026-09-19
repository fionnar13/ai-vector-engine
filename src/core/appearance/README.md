
# Appearance Engine - Phase 3.05

## Ownership
AppearanceStore owns Appearance {id, stack: AppearanceItem[]}
- Geometry owned by GeometryStore
- Hierarchy owned by SceneGraph
- Appearance does NOT own hierarchy (no parent/children)
- Appearance does NOT mutate GeometryStore

## Model
Appearance {
  id: AppearanceID (UUIDv4)
  stack: AppearanceItem[] ordered, semantic order preserved
}

AppearanceItem {
  id: AppearanceItemID (UUID or string)
  type: fill | stroke | effect
  enabled: boolean
  inputs?: AppearanceItemID[] (effect only, must reference BEFORE)
  data: FillData | StrokeData | EffectData
}

FillData: {kind: solid, color: SolidColor {r:0-255,g:0-255,b:0-255,a:0-1}, opacity:0-1}
StrokeData: {color, width>=0, cap: butt|round|square, join: miter|round|bevel, miterLimit>0, alignment: center only MVP, opacity:0-1}
EffectData: {effectType: string, parameters: Record<string, number|string|boolean>} - no rendering, only graph contract

## Color
Canonical: SolidColor {r,g,b,a}
- r,g,b in [0,255], a in [0,1], finite, no NaN/Infinity
- No silent clamping, validation error for out-of-range
- Backward compat hexToSolidColor for old stores

## Opacity
Canonical location: inside FillData.opacity and StrokeData.opacity (not duplicated)
- Range 0-1 inclusive, finite

## Effect Graph
- inputs must reference items earlier in stack: inputIndex < currentIndex
- Guarantees acyclicity by construction
- Validation: self-reference, direct cycle, indirect cycle, missing input, forward ref, duplicate input
- Explicit DFS validation via validateAppearanceGraph even though forward-ref prevention guarantees acyclic

## Store
AppearanceStore {
  create, get (defensive clone), has, update, delete, list, listIds, size, clear
  Stack ops: addItem(appearanceId, item, index?), removeItem (deletes input used by Effect => effect disabled + warning APPEARANCE_INPUT_REMOVED, no dangling silent), moveItem, updateItem, enableItem, disableItem, getItem, getItems
}
- No Transaction/Undo/Redo (Phase 3.06)
- No EventBus (Phase 3.06)
- Immutability: get returns defensive clone, mutation only via validated APIs

## Dependency Deletion Rule
If item deleted while Effect references it:
- Fill/Stroke removed
- Effect enabled=false
- Warning APPEARANCE_INPUT_REMOVED generated
- Do NOT auto-delete Effect, do NOT silently rewrite inputs

## Insertion Rule
If item contains inputs, every input must already exist before it, else VALIDATION ERROR, no auto-reorder

## Resolution
resolveAppearance(appearanceId) => ResolvedAppearance {fills, strokes, effects} deterministic order, suitable for future Renderer, no Canvas/DOM

## Rendering Boundary
Appearance Engine MUST NOT import canvas, window, document, WebGL, React, Vue, DOM, Renderer
Dependency: Appearance Engine -> Renderer (future), NOT reciprocal

## Visual BBox Support
StrokeBBox = WorldBBox expanded by stroke width/2 (for center alignment)
- Zero-width stroke => StrokeBBox = WorldBBox
- Effects visual expansion not implemented in this phase (future Renderer)
- Document limitations for joins/caps

## Validation
Layered: schema (required fields, discriminated unions, IDs), numeric (finite colors, opacity, stroke width, miter), domain (duplicate IDs, valid refs, no forward refs, no cycles, stack ordering)
- Pure, does not mutate

## Serialization
Appearance -> JSON -> Appearance preserves ID, item order, IDs, fill, stroke, opacity, effect inputs, enabled state, no caches, stable order

## Determinism
Creation, ordering, validation, graph traversal, resolution, serialization deterministic, no timestamps/random ordering/browser state
