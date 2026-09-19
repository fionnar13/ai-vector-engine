
# SceneGraph + SpatialIndex + Transform - Phase 3.04

## Ownership
SceneGraph is the single canonical owner of hierarchy.
- GraphicObject has NO parent/children/worldTransform
- Hierarchy exists only in SceneGraph
- ObjectStore remains hierarchy-free

## Node Model
SceneNode {
  id: NodeID
  objectRef: ObjectID | null (null for empty groups)
  parent: NodeID | null (null = root)
  children: NodeID[] (ordered, authoritative for Z-order)
  localTransform: Matrix3x3
}

## Invariants
- I01 Parent/Child Consistency: parent.children contains child => child.parent == parent.id
- I02 No duplicate children
- I03 No cycles (detect via walking up parent chain)
- I04 Valid references (parent, child, objectRef must exist when non-null)
- I05 Root integrity: root nodes parent === null
- I06 Object reference integrity: objectRef must exist in ObjectStore
- I07 Object uniqueness: one ObjectID -> one SceneNode (unless instancing allowed, default false)

## World Transform
WorldTransform is DERIVED, NOT stored canonically.
Formula:
  World(node) = World(parent) * Local(node)
  World(root) = Local(root)
Uses Phase 3.01 Matrix3x3 convention [a c tx; b d ty; 0 0 1], column vectors, Y-down, clockwise positive.

Cache: Map<NodeID, Matrix3x3> derived, invalidated on:
- localTransform changes (node + descendants)
- reparent (node + descendants)
- parent transform changes (descendants)

Cache can be discarded and rebuilt - correctness never depends on cache.

## WorldBBox
WorldBBox = transform(GeometryBBox, WorldTransform)
- GeometryBBox from Geometry Kernel exact BBox
- Transform via BBox.transform (4 corners)
- Empty group: bbox from descendants, or null if no drawable descendants
- No stroke/effects in WorldBBox (effects are Phase 3.05+)

## SpatialIndex
- Derived/cached, NOT canonical
- Owner: SceneGraph Engine (SceneGraph -> SpatialIndex, NOT reciprocal)
- Indexed entity: NodeID (not ObjectID)
- BBox type: WorldBBox
- API: insert, update, delete, query(bbox), queryPoint(point, tolerance), clear, rebuild
- Implementation: SimpleSpatialIndex (linear scan deterministic) for MVP - API compatible with RBush
- Query: returns NodeIDs whose WorldBBox intersects query BBox, deterministic ordering (sorted)
- Stale fallback: if index stale/unavailable, fallback to SceneGraph traversal + BBox intersection - still correct
- Update rules: localTransform, hierarchy, geometry, insertion, deletion, reparenting must update index

## Transform Services
- getWorldTransform(nodeId)
- getWorldBBox(nodeId) (requires geometry lookup)
- setLocalTransform, translateNode, scaleNode, rotateNode, transformNode
- All respect Matrix3x3 convention, never local*parentWorld (always parentWorld*local)

## Parametric Preservation
Transform applied to SceneNode modifies SceneNode.localTransform, NOT geometry.
Geometry remains parametric (Rect, Ellipse, etc. stay parametric).

## Dependency Direction
Math -> Geometry -> Stores -> SceneGraph -> SpatialIndex
SceneGraph does NOT import Renderer, AI, Transaction, Interaction, UI, browser globals
