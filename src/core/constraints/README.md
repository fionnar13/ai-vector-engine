
# Constraint Engine — Phase 3.09

MVP deterministic constraint engine. NOT a general-purpose optimization solver.

## Ownership

- ConstraintStore canonical owner ConstraintEngine
- Constraint is persistent document state
- ConstraintStore not duplicated in SceneGraph, Geometry, Appearance, Semantic

## Lifecycle

Constraint -> ConstraintStore -> Read-only Evaluation -> Deterministic Solver -> Correction Proposal -> Command -> Transaction -> Working Copy -> Validation -> Commit -> Canonical State -> EventBus -> SpatialIndex / RenderTree Invalidation -> Renderer

## BBox Usage

All constraint calculations use WorldBBox:
- Alignment: WorldBBox minX/maxX/minY/maxY/center
- EqualWidth: WorldBBox.width
- EqualHeight: WorldBBox.height
- FixedDistance: distance between WorldBBox.center in world space

Never VisualBBox for geometric alignment, never screen coordinates, never raw local geometry when defined in world space.

## Solver Boundary

Solver returns corrections, does NOT commit them. Never SceneGraph.write() / ObjectStore.write() / GeometryStore.write() from solver. Solver reads via ConstraintSolveContext {getWorldBBox, getWorldTransform, getParentWorldTransform, tolerance}.

## Determinism

Constraints sorted by strength priority (required > strong > weak) then by id lexicographically. No Map insertion order reliance. Single-pass / bounded-pass <=10 iterations. Each preview derives from working copy + current delta. Same input -> identical status/corrections/violations/iterations.

## Strength

required > strong > weak. Required violations cause unsatisfiable status. Disabled constraints ignored.

## Mutation Path

create_constraint, update_constraint, delete_constraint, enable_constraint, disable_constraint, apply_constraint_corrections all Mutation Tools -> Transaction -> ConstraintStore / SceneGraph -> Commit -> Event -> Derived Invalidation

## Events

ConstraintCreated, ConstraintUpdated, ConstraintDeleted, ConstraintChanged, ConstraintSolveCompleted — published after Commit, ordering Command Execute -> Validate -> Commit -> Diff -> Events -> Derived Invalidation -> Render

## Undo

Every constraint mutation reversible via getInverse() -> History linear only.

## MVP Limitations

- Translation only corrections, no rotation, no geometry modification, no parametric conversion
- equalWidth/equalHeight require geometry change -> treated as unsatisfiable if required and not already satisfied
- fixedDistance moves second object only along current direction, if coincident moves along x
- No AI inference, no Planner, no Critic, no nonlinear optimization
- Parent transform handling via converting world translation to local via inverse parent world transform
