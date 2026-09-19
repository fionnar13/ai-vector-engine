
# Transaction Engine - Phase 3.06

## Architecture

Tool -> Command -> Transaction -> Working Copy -> Validation -> Journal/Diff -> Atomic Commit -> Canonical Stores -> Events -> History -> Derived Invalidation

NO direct Store.write() allowed outside TransactionExecutor Commit layer.

## Command
- id: CommandID, toolId, input, deterministic
- execute(ctx: CommandContext): CommandResult
- getAffectedIds(), getInverse()
- No window/document/canvas/fs/network/AI/Renderer

## CommandContext
- workingCopy: WorkingCopy (affected entities only)
- ids: IDFactory

## WorkingCopy
- Affected-entity copy-on-write, not entire document clone
- Methods: getObject/Geometry/Appearance/Node, set*, delete*
- Journal tracking for added/removed/modified
- Canonical stores immutable until Commit

## Journal
- added: EntityRef[], removed: EntityRef[], modified: EntityRef[]
- EntityRef {store: object|geometry|appearance|node|constraint|semantic, id}
- Normalized, deduplicated

## Diff
- DocumentDiff {added, removed, modified} deterministic

## Validation
- Schema: required fields, IDs, finite numbers, enum
- Domain: reference integrity Object->Geometry/Appearance, SceneGraph invariants
- No partial commit on failure

## Transaction
- id, parentId (null for first, previous for linear history, future DAG), commands, status pending/executing/committed/rolled_back/failed, diff, inverse (commands or snapshot), deterministic, metadata {source user|ai|system, toolId, description}
- TransactionBuilder: begin({source, toolId, description, parentId}) -> addCommand -> build()

## TransactionExecutor
- execute(transaction): loadAffected -> capture beforeSnapshot -> execute commands sequentially -> validate -> journal -> diff -> inverse -> atomic commit -> publish events (ObjectCreated/Updated/Deleted, SceneGraphChanged, TransactionCommitted) -> history.push
- Command failure => discard WorkingCopy, no canonical mutation, no event, status failed
- Atomic commit: no observable intermediate state
- Events only after commit

## Snapshot
- DocumentSnapshot {objects, geometries, appearances, nodes} affected only, immutable
- Snapshot restore atomic via TransactionExecutor

## History
- Linear: transactions[], currentIndex (-1 empty, 0 first)
- canUndo(), canRedo(), push(transaction) with branch invalidation (truncate future when new transaction after undo), current(), clear()
- parentId: first null, next = previous current
- Undo: inverse Transaction via TransactionExecutor, moveBack()
- Redo: reproduce transaction deterministically, moveForward()
- Undo/Redo uses same pipeline (TransactionExecutor -> Commit -> Events), no direct Store.write() from HistoryManager
- Only committed transactions enter history

## Event Ordering
Command Execute -> Working Copy -> Validate -> Commit Canonical -> Diff -> ObjectUpdated/Created/Deleted -> TransactionCommitted -> Derived Invalidation
No event before commit

## Determinism
Commands declare deterministic boolean, MVP true, IDs from IDFactory, no Math.random/Date.now/unordered iteration affecting output

## MVP Commands
create_object, delete_object, move_object, transform_object, update_geometry, update_appearance, create_node, delete_node, reparent_node, set_z_order

## Example
Rectangle at (0,0) 200x100
move_object dx=100 dy=50 => (100,50)
Undo => (0,0)
Redo => (100,50)
No floating drift beyond 1e-9

## Vertical Slices
- Create Artboard -> Create Rectangle -> Move -> Change Appearance -> Undo -> Undo -> Redo
- Boolean: Object A,B -> Boolean Operation removes A,B creates result -> Undo restores A,B removes result

## Boundaries
No UI, Renderer, AI, Memory, filesystem, network, canvas, window, document, fetch
