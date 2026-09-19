
# Tool Registry & Core Tooling — Phase 3.11

Single controlled execution gateway between high-level intent and state mutation.

## Architecture

```
Human / AI Intent -> Planner -> DSL/IR -> ToolRegistry -> Tool Validation -> Command -> Transaction -> Canonical State
```

AI MUST NEVER MUTATE STATE DIRECTLY forbidden:
AI -> ObjectStore.write() etc.

Required:
AI -> ExpectedState -> Plan -> DSL/IR -> ToolRegistry -> Tool Validation -> Command -> Transaction -> Commit -> Canonical Stores

## Categories

- read: no Transaction, no Command, no Event, no Store mutation. Examples find_object_by_role, detect_symmetry, get_object_bounds, detect_shape_primitive
- proposal: no Transaction, no canonical mutation, no Event, produces Proposal requires explicit acceptance before mutation. Examples infer_constraints, infer_semantic. Flow Proposal -> Validation -> Approval -> Mutation Tool -> Transaction
- mutation: MUST create Command, MUST execute through Transaction, MUST validate preconditions, MUST produce Diff, MUST produce Events only after Commit, MUST be reversible. No direct store.write outside Transaction execution context.

## Tool Contract

interface ToolDefinition<TInput,TOutput> { id ToolID T01..T20 stable never reused, name, version, category, description, inputSchema outputSchema machine-readable, permissions, deterministic boolean, validate(input, context): ToolValidationResult, execute(input, context): ToolResult }

## Tool ID

T01..T20 stable unique never reused

## Tool Context

DocumentId, objectStore, geometryStore, appearanceStore, sceneGraph, constraintStore?, semanticStore?, spatialIndex?, commandFactory, transactionManager, validator — dependency injection not global singletons

## Tool Result

{success boolean, output?, errors?, warnings?, commandId?, transactionId?} Read returns output warnings errors, Mutation additionally returns commandId transactionId only after successful commit

## Validation Contract

Schema Validation -> Domain Validation -> Precondition Validation -> Execution. Example move_object verifies ObjectID exists, selectable/movable, Transform finite, Translation finite, No singular matrix. If validation fails NO COMMAND NO TRANSACTION NO MUTATION NO EVENT

## Core Tool Set 20 Tools

T01 create_rectangle mutation RectParams -> Geometry -> GeometryStore Object -> ObjectStore SceneNode -> SceneGraph inside Transaction preserve parametric rectangle
T02 create_ellipse mutation preserve parametric ellipse not flatten
T03 create_path mutation validate finite coordinates valid anchors handles fillRule topology
T04 delete_objects mutation remove objects corresponding scene nodes transactional atomicity snapshot undo FAIL ENTIRE TRANSACTION no partial deletion
T05 move_object mutation validate finite delta preserve geometry semantics update SceneGraph transform update derived bounds produce transaction
T06 transform_objects mutation Matrix3x3 [a c tx][b d ty][0 0 1] Y-down column vectors singular -> TRANSFORM_SINGULAR
T07 apply_fill mutation modify Appearance through Appearance system not Geometry
T08 align_objects mutation using WorldBBox not VisualBBox for canonical alignment axis horizontal|vertical|both mode left|center|right|top|middle|bottom
T09 distribute_objects mutation axis horizontal|vertical mode centers|gaps deterministic WorldBBox
T10 group_objects mutation create SceneGraph group node hierarchy ONLY SceneGraph never parent in GraphicObject
T11 ungroup_objects mutation remove group nodes preserving child effective world transforms reversible
T12 reorder_objects mutation operation front|back|forward|backward Z-order SceneNode.children[] no second z-order store
T13 boolean_operation mutation operation union|difference|intersection fillRule tolerance keepOriginals respect Phase 2.5 Boolean Contract preconditions min 2 closed finite open path GEOMETRY_OPEN_PATH do NOT auto-close undo Snapshot Restore Tool must call Geometry/Boolean service not implement logic itself
T14 outline_text mutation TextObject -> PathGeometry preserve visual geometry FONT_FALLBACK
T15 create_point_text mutation content position Vec2 style fontFamily fontSize fontWeight 400|700 fontStyle normal|italic lineHeight letterSpacing textAlign left|center|right fill Fill MVP only No AreaText TextOnPath RichText
T16 find_object_by_role read role -> objectIds read-only no Event no Transaction
T17 detect_shape_primitive read objectId using detectParametricShape from Geometry Kernel output detected line|rectangle|polygon|null confidence safe failure null no mutation
T18 detect_symmetry read objectIds axis horizontal|vertical|both output horizontal boolean vertical boolean deviation number analytical must not create Constraint
T19 infer_constraints proposal objectIds? -> proposals ConstraintProposal[] type align|center|equalWidth|equalHeight|symmetry MUST NOT mutate ConstraintStore flow Proposal -> Validation -> Approval -> create_constraint -> Transaction NO hidden mutation
T20 infer_semantic proposal objectIds? -> proposals SemanticProposal MUST NOT directly write to SemanticStore

## Registry

class ToolRegistry { register(tool): void, unregister(toolId), get(toolId), has(toolId), list(), listByCategory(category), validate(toolId, input, context), execute(toolId, input, context) }

Invariants:
1 Tool IDs unique
2 Definitions immutable after registration frozen
3 Unknown Tool ID error
4 Input validation before execution
5 Read Tool cannot create Transaction
6 Proposal Tool cannot mutate Canonical State
7 Mutation Tool cannot bypass Transaction
8 Every Mutation Tool reversible
9 Deterministic where declared
10 No filesystem
11 No network
12 No UI dependency
13 No Renderer mutation APIs

## Mutation Boundary Enforcement

Forbidden direct mutation from Tool code objectStore.set/delete geometryStore.set/delete appearanceStore.set/delete sceneGraph.add/remove/reparent constraintStore.set/delete semanticStore.set/delete unless inside officially defined Transaction/Command execution boundary. Preserve existing Store API architecture.

## Command Creation

Tool Input -> Precondition Validation -> Command Creation -> Transaction -> Working Copy -> Command Execute -> Validation -> Diff -> Commit -> Events — Tool must not manually reproduce Transaction internals — Use CommandFactory TransactionManager History from PHASE 3.06

## Error Handling

Use existing Error Model TOOL_PRECONDITION_FAILED VALIDATION_SCHEMA GEOMETRY_OPEN_PATH GEOMETRY_DEGENERATE TOPOLOGY_SELF_INTERSECT TRANSFORM_SINGULAR CONSTRAINT_UNSATISFIABLE TRANSACTION_CONFLICT — errors contain context toolId objectIds etc.

## Events

Read: NO EVENTS, Proposal: NO EVENTS, Mutation: Events emitted by Transaction/Event architecture never before Commit ordering Command Execute -> Validate -> Commit -> Diff -> Events -> Derived Invalidation -> Render — Tool Registry itself should NOT become alternative EventBus

## Determinism

All deterministic Tools return identical logical results for identical Input + Canonical State + Configuration — e.g. create_rectangle move_object transform_objects align_objects distribute_objects detect_shape_primitive — Do not use Math.random Date.now non-deterministic iteration for semantic results — If ID must be generated use existing ID subsystem

## Permission Model

{read: string[], write: string[]} Read {read: [sceneGraph, geometry, semantic], write: []}, Proposal {read: [sceneGraph, geometry, appearance], write: []}, Mutation {read: [...], write: [transaction]} — Prefer declaring permission to Transaction boundary rather than direct Store mutation

## Tool Discovery

Registry supports future Planner/DSL integration: What Tools exist? What category? What input/output? What permissions? Is deterministic? — registry.list() get(T01) listByCategory(mutation) — metadata consumed by PHASE 3.12 Vector DSL PHASE 3.13 AI Planner — Do NOT implement Planner or DSL in this phase

## Tool Schema

Machine-readable must later be usable by DSL/IR layer — Use existing schema abstraction if exists — Do not introduce second validation framework

## Dependency Rule

Foundation -> Geometry -> Canonical Stores -> SceneGraph/Appearance/Constraint/Semantic -> Command/Transaction -> Tool Registry — Tool Registry MAY depend on Geometry Stores SceneGraph Appearance Constraint Semantic Command Transaction Validation Errors IDs — MUST NOT be imported by Foundation Geometry Canonical Stores Renderer — Geometry -> Tool Registry forbidden

## Security

No filesystem, network, arbitrary code, external API, hidden mutation, dynamic eval
