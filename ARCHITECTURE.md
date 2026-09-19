
# Architecture Direction

Dependency Direction (must not be violated):
Math (no dep) -> Geometry -> ObjectStore -> SceneGraph -> Appearance -> Constraint -> Semantic -> Command/Transaction -> EventBus -> Renderer (ReadOnly) -> Interaction -> Tool Registry -> DSL -> Planner -> Critic

Rules:
- Core (src/core) must NOT import from src/document, src/geometry, src/renderer, src/interaction, src/tools, src/ai, src/dsl
- Math must NOT import Document
- Geometry must NOT import Renderer
- Renderer must NOT import AI, Planner, Interaction
- EventBus must NOT import UI
- All mutations via Transaction
- IDs are type-safe branded UUIDs

## Semantic Engine (Phase 3.10)

- Owner: SemanticEngine, Store: SemanticStore canonical Map<ObjectID, SemanticData>
- Contract: SemanticData {objectId ObjectID, role? SemanticRole, tags string[] normalized lowercase sorted unique, confidence 0..1 finite, source user|ai|heuristic|import|system, relationships SemanticRelationship[] {targetObjectId ObjectID type contains|containedBy|labels|associatedWith|decorates|references}, updatedAt?}
- Roles: background|foreground|container|group|text|heading|button|icon|logo|image|illustration|decorative|shape|unknown extensible /^[a-z_][a-z0-9_]*$/
- Validation: objectId valid UUID, confidence finite 0..1 not NaN/Infinity, tags strings normalized deterministic alphabetical unique no undefined, role vocabulary extensible, relationships targetObjectId valid type valid
- Object existence: semantic.objectId -> ObjectStore exists? else VALIDATION_SCHEMA no phantom
- Stale data: When Object deleted Transaction must delete semantic record no orphan, recreated gets new ObjectID never reuse semantic state
- Heuristic inference: deterministic rule-based NOT LLM/ML, input SemanticInferenceInput {objectId, geometry, appearance, sceneContext {parentId, childCount, siblingCount, depth, bbox, isText, textContent}}, signals geometry_type, aspect_ratio, size, position, appearance, text, scene_structure, relationship, conservative insufficient -> unknown, red rectangle alone NOT button
- Proposal: SemanticProposal {proposalId unique, objectId, proposedRole?, proposedTags, proposedRelationships, confidence, evidence SemanticEvidence[] {signal, description, weight}, source heuristic|ai, createdAt?} evidence deterministic sorted confidence base+sum(weights)*0.3 clamped [0,1]
- Inference read-only HARD: SceneGraph GeometryStore ObjectStore AppearanceStore ConstraintStore -> Heuristic Engine -> Proposal no mutation MUST NOT semanticStore.set/delete objectStore.write geometryStore.write sceneGraph.write constraintStore.write logically Read State -> Proposal
- Persistence flow: Inference -> Proposal -> Validation -> User/AI approval -> create/update semantic Command -> Transaction -> Working Copy -> Validate -> Commit -> semanticStore -> SemanticUpdated Event no shortcut
- Commands: create_semantic, update_semantic, delete_semantic deterministic reversible inverseCommand merge policy MVP role replace tags replace relationships replace
- Undo/Redo: semantic mutations participate in History linear create -> Transaction -> Undo -> removed -> Redo -> restored inference no undo because no mutation
- Events: SemanticCreated, SemanticUpdated, SemanticDeleted, SemanticInferred, inference SemanticInferred does not imply persistence mutation events only after commit ordering Command -> Working Copy -> Validate -> Commit -> Diff -> Event -> Derived Invalidation
- Query API: findObjectsByRole, findObjectsByTag, getSemantic, getSemanticConfidence, getRelationships read-only
- Boundaries: SceneGraph owner hierarchy, Semantic meaning only never duplicate parent/children/z-order/localTransform/worldTransform, Geometry read not modify, Appearance read not modify, Constraint read not create, AI request infer -> proposal cannot direct set, Critic ReadOnly
- Serialization: deterministic stable ordering valid ObjectIDs no runtime-only no circular future compatible tags alphabetical deterministic relationships sorted
- Determinism: same doc state -> same role/tags/confidence/evidence no Math.random Date.now unstable iteration in inference logic
- Confidence model: base + sum(evidence weights)*0.3 clamped [0,1] documented deterministic testable explainable heuristic confidence score
- Performance: deterministic correct bounded no infinite traversal no recursive cycles guard against relationship cycles not hierarchy
- Security: no fs/network/arbitrary code/external API/hidden mutation/dynamic eval
- Dependency: Math -> Geometry -> Object/Appearance/SceneGraph/Constraint -> Semantic -> Tools -> DSL -> Planner, Semantic MUST NOT reverse Renderer -> Semantic or Semantic -> Renderer

## Tool Registry & Core Tooling (Phase 3.11)

- Owner: ToolRegistry class formal execution boundary Human/AI Intent -> Planner -> DSL/IR -> ToolRegistry -> Tool Validation -> Command -> Transaction -> Canonical State
- Tool Registry NOT UI, NOT second state-management, NOT allowed to directly mutate canonical stores, controlled interface for higher-level systems to request operations
- AI MUST NEVER MUTATE STATE DIRECTLY forbidden AI -> ObjectStore.write() GeometryStore.write() SceneGraph.write() AppearanceStore.write() ConstraintStore.write() SemanticStore.write() Required AI -> ExpectedState -> Plan -> DSL/IR -> ToolRegistry -> Tool Validation -> Command -> Transaction -> Commit -> Canonical Stores enforced in code via ToolContext permissions and Transaction boundary
- Categories: read | proposal | mutation exactly one category per tool
  - read: No Transaction No Command execution No Event No Store mutation No derived-state mutation examples find_object_by_role detect_symmetry get_object_bounds detect_shape_primitive
  - proposal: No Transaction No canonical mutation No Event Produces Proposal requires explicit acceptance before mutation examples infer_constraints infer_semantic flow Proposal -> Validation -> Approval -> Mutation Tool -> Transaction
  - mutation: MUST create Command MUST execute through Transaction MUST validate preconditions MUST produce Diff MUST produce Events only after Commit MUST be reversible No direct store.write/delete outside Transaction execution context
- Tool Contract: ToolDefinition {id ToolID T01..T20 stable never reused, name, version, category, description, inputSchema outputSchema machine-readable, permissions, deterministic boolean, validate(input, context): ToolValidationResult, execute(input, context): ToolResult}
- Tool ID: T01..T20 stable unique never silently reused for different semantic operation
- Tool Context: documentId, objectStore, geometryStore, appearanceStore, sceneGraph, constraintStore?, semanticStore?, spatialIndex?, commandFactory, transactionManager, validator — dependency injection not global singletons, Stores not hidden inside Registry
- Tool Result: {success boolean, output?, errors?, warnings?, commandId?, transactionId?} Read returns output warnings errors Mutation additionally returns commandId transactionId only after successful commit
- Validation Contract: Schema Validation -> Domain Validation -> Precondition Validation -> Execution example move_object verifies ObjectID exists selectable/movable Transform finite Translation finite No singular matrix introduces if validation fails NO COMMAND EXECUTION NO TRANSACTION NO STATE MUTATION NO EVENT
- Core Tools 20: T01 create_rectangle mutation RectParams -> Geometry -> GeometryStore Object -> ObjectStore SceneNode -> SceneGraph inside Transaction preserve parametric rectangle, T02 create_ellipse mutation preserve parametric ellipse not flatten, T03 create_path mutation validate finite coordinates valid anchors handles fillRule topology, T04 delete_objects mutation remove objects corresponding scene nodes transactional atomicity snapshot undo FAIL ENTIRE TRANSACTION no partial deletion, T05 move_object mutation validate finite delta preserve geometry semantics update SceneGraph transform update derived bounds produce transaction, T06 transform_objects mutation Matrix3x3 [a c tx][b d ty][0 0 1] Y-down column vectors singular -> TRANSFORM_SINGULAR, T07 apply_fill mutation modify Appearance through Appearance system not Geometry, T08 align_objects mutation WorldBBox not VisualBBox axis horizontal|vertical|both mode left|center|right|top|middle|bottom, T09 distribute_objects mutation axis horizontal|vertical mode centers|gaps deterministic WorldBBox, T10 group_objects mutation create SceneGraph group node hierarchy ONLY SceneGraph never parent in GraphicObject, T11 ungroup_objects mutation remove group nodes preserving child effective world transforms reversible, T12 reorder_objects mutation operation front|back|forward|backward Z-order SceneNode.children[] no second z-order store, T13 boolean_operation mutation operation union|difference|intersection fillRule tolerance keepOriginals respect Phase 2.5 Boolean Contract preconditions min 2 closed finite open path GEOMETRY_OPEN_PATH do NOT auto-close undo Snapshot Restore Tool must call Geometry/Boolean service not implement logic itself, T14 outline_text mutation TextObject -> PathGeometry preserve visual geometry FONT_FALLBACK, T15 create_point_text mutation content position Vec2 style fontFamily fontSize fontWeight 400|700 fontStyle normal|italic lineHeight letterSpacing textAlign left|center|right fill Fill MVP only No AreaText TextOnPath RichText, T16 find_object_by_role read role -> objectIds read-only no Event no Transaction, T17 detect_shape_primitive read objectId using detectParametricShape from Geometry Kernel output detected line|rectangle|polygon|null confidence safe failure null no mutation, T18 detect_symmetry read objectIds axis horizontal|vertical|both output horizontal boolean vertical boolean deviation number analytical must not create Constraint, T19 infer_constraints proposal objectIds? -> proposals ConstraintProposal[] type align|center|equalWidth|equalHeight|symmetry MUST NOT mutate ConstraintStore flow Proposal -> Validation -> Approval -> create_constraint -> Transaction NO hidden mutation, T20 infer_semantic proposal objectIds? -> proposals SemanticProposal MUST NOT directly write to SemanticStore
- Registry: register(tool): void, unregister(toolId), get(toolId), has(toolId), list(), listByCategory(category), validate(toolId, input, context), execute(toolId, input, context) — invariants: IDs unique, definitions immutable after registration frozen, unknown ID error, input validation before execution, Read cannot create Transaction, Proposal cannot mutate Canonical State, Mutation cannot bypass Transaction, Every Mutation reversible, deterministic where declared, no filesystem, no network, no UI dependency, no Renderer mutation APIs
- Mutation Boundary Enforcement: forbidden direct mutation objectStore.set/delete geometryStore.set/delete appearanceStore.set/delete sceneGraph.add/remove/reparent constraintStore.set/delete semanticStore.set/delete unless inside officially defined Transaction/Command execution boundary preserve existing Store API architecture no duplicate mutation APIs
- Command Creation: Tool Input -> Precondition Validation -> Command Creation -> Transaction -> Working Copy -> Command Execute -> Validation -> Diff -> Commit -> Events — Tool must not manually reproduce Transaction internals use CommandFactory TransactionManager History from Phase 3.06
- Error Handling: existing Error Model TOOL_PRECONDITION_FAILED VALIDATION_SCHEMA GEOMETRY_OPEN_PATH GEOMETRY_DEGENERATE TOPOLOGY_SELF_INTERSECT TRANSFORM_SINGULAR CONSTRAINT_UNSATISFIABLE TRANSACTION_CONFLICT errors contain context toolId objectIds
- Events: Read NO EVENTS Proposal NO EVENTS Mutation Events emitted by Transaction/Event architecture never before Commit ordering Command Execute -> Validate -> Commit -> Diff -> Events -> Derived Invalidation -> Render Tool Registry itself NOT alternative EventBus
- Determinism: All deterministic Tools return identical logical results for identical Input + Canonical State + Configuration examples create_rectangle move_object transform_objects align_objects distribute_objects detect_shape_primitive no Math.random Date.now non-deterministic iteration for semantic operation results If ID must be generated use existing ID subsystem
- Permission Model: {read: string[], write: string[]} Read {read: [sceneGraph, geometry, semantic], write: []}, Proposal {read: [sceneGraph, geometry, appearance], write: []}, Mutation {read: [...], write: [transaction]} prefer declaring permission to Transaction boundary rather than direct Store mutation permission
- Tool Discovery: Registry supports future Planner/DSL integration What Tools exist? What category? What input/output? What permissions? Is deterministic? registry.list() get(T01) listByCategory(mutation) metadata consumed by Phase 3.12 Vector DSL Phase 3.13 AI Planner Do NOT implement Planner or DSL in this phase
- Tool Schema: machine-readable usable by DSL/IR layer example {type: object, required: [width, height], properties: {width: {type: number}, height: {type: number}}} Use existing schema abstraction if exists no second validation framework
- Dependency Rule: Foundation -> Geometry -> Canonical Stores -> SceneGraph/Appearance/Constraint/Semantic -> Command/Transaction -> Tool Registry — Tool Registry MAY depend on Geometry Stores SceneGraph Appearance Constraint Semantic Command Transaction Validation Errors IDs — MUST NOT be imported by Foundation Geometry Canonical Stores Renderer — Geometry -> Tool Registry forbidden

## PHASE 3.12 — VECTOR DSL

Vector DSL is deterministic, validated, machine-readable instruction language that converts high-level structured vector operations into IR that executes via Tool Registry.

Pipeline: DSL -> Parser -> AST -> Schema Validation -> Semantic Validation -> IR -> Tool Registry -> Command -> Transaction -> Canonical State

DSL is NOT Store, NOT Transaction, NOT second mutation mechanism. NEVER directly mutates ObjectStore, GeometryStore, AppearanceStore, SceneGraph, ConstraintStore, SemanticStore. Only valid path DSL -> Parser -> Validator -> IR -> Tool Registry -> Mutation Tool -> Command -> Transaction -> Commit.

Design Principles: Deterministic, Typed, Explicit, Serializable, Inspectable, Validatable, Versioned, AI-friendly, Human-readable, Machine-readable.

Supports create (rect ellipse path pointText line polygon star), update (whitelisted width height rx ry x y cx cy content position style fill stroke opacity), delete (T04), transform (translate scale rotate matrix using Matrix3x3 existing, translate -> T05 move, matrix -> T06 singular check), appearance (fill opacity -> T07 Appearance not Geometry), group (targets >=2 -> T10 hierarchy only SceneGraph never GraphicObject), ungroup (T11 preserve world transforms), reorder (front back forward backward -> T12 SceneNode.children[]), boolean (union difference intersection fillRule tolerance keepOriginals -> T13 Boolean Contract GEOMETRY_OPEN_PATH no auto-close), align (axis horizontal vertical both mode left center right top middle bottom -> T08 WorldBBox), distribute (axis horizontal vertical mode centers gaps -> T09 deterministic WorldBBox), text (pointText only content position style fontFamily fontSize fontWeight 400|700 fontStyle normal|italic lineHeight letterSpacing textAlign left center right fill -> T15 MVP no AreaText TextOnPath RichText), artboard (width height MVP single-artboard), propose_constraint (targets -> T19 infer_constraints Proposal NOT write), propose_semantic (targets -> T20 infer_semantic Proposal NOT write).

Root Contract: VectorDSL { version: string; program: DSLInstruction[] } DSLInstruction { op: DSLOp; id?: DSLRef; target?: DSLRef; targets?: DSLRef[]; type?: string; operation?: string; args?: Record<string,unknown>; } Avoid any.

DSLOp: create|update|delete|transform|appearance|group|ungroup|reorder|boolean|align|distribute|text|artboard|propose_constraint|propose_semantic. Maps to Tools DSL does not implement state-changing behavior.

DSLRef: string temporary reference. Mapping rectangleA -> DSL Environment -> ObjectID. Environment execution context only not canonical state.

Update: whitelisted fields only, arbitrary mutation rejected.

Delete: targets [rectangleA, ellipseA] -> T04 validation before Transaction.

Transform: translate {x:100,y:50} scale rotate matrix using Matrix3x3 existing no second matrix.

Appearance: fill #FF0000 opacity 0.8 -> T07 Appearance Tools.

Group: targets [rectA, ellipseA] id groupA hierarchy exclusively SceneGraph.

Ungroup: target groupA -> T11 preserve effective world transforms.

Reorder: targets [rectA] operation front -> T12 Z-order SceneNode.children[].

Boolean: operation union targets [shapeA, shapeB] args fillRule nonZero tolerance 0.5 keepOriginals false -> T13 DSL no Boolean algorithm.

Align: targets [A,B,C] axis horizontal mode center uses WorldBBox via T08.

Distribute: targets [A,B,C] axis horizontal mode gaps -> T09.

Text: pointText content position style -> T15 only MVP.

Artboard: width 1920 height 1080 MVP single-artboard respect Document/Artboard contract no multi-artboard.

Constraint Proposal: targets [A,B] type align axis horizontal -> T19 Proposal NOT write.

Semantic Proposal: targets [A] -> T20 SemanticProposal not mutate.

AST: DSLProgram { version, instructions: DSLNode[] } DSLNode { op, ref, target, targets, type, operation, args, sourceIndex } independent of canonical Stores.

Parser: parseDSL(input: unknown): ParseResult JSON syntax validation -> DSL structure validation -> AST construction. Parser must NOT execute Tools NOT mutate state.

Schema Validator: validateDSL version operation required fields types enum numeric ranges reference syntax duplicate refs malformed structures width="200" fail width=200 pass.

Semantic Validator: delete unknown DSLRef fail, transform unknown fail, group empty fail, boolean <2 fail, align <1 fail, distribute <3 fail, invalid matrix fail (singular det check), invalid fillRule fail, invalid opacity 0..1 fail. Structured errors.

Reference Validation: Track Defined Used. transform unknownObject fail DSL_UNKNOWN_REFERENCE.

Forward References: MVP rule forward references allowed only when referenced object guaranteed to be created earlier during program execution. create A transform A valid. transform A create A invalid. No deferred execution.

IR: ToolIR { toolId, input, sourceInstructionIndex, sourceRef, targets, category } Program DSL -> AST -> ToolIR[] Example create rect -> ToolIR {toolId:"T01", input:{...}}.

Tool Mapping: Explicit mapping create rect->T01 ellipse->T02 path->T03 delete->T04 transform translate->T05 matrix->T06 appearance->T07 align->T08 distribute->T09 group->T10 ungroup->T11 reorder->T12 boolean->T13 text outline->T14 create text->T15 find role->T16 detect shape->T17 detect symmetry->T18 constraint proposal->T19 semantic proposal->T20. No dynamic guess explicit testable.

IR Must Not Mutate: Contains Tool ID Input References Source metadata. Must NOT contain Store handles canonical objects mutable SceneNodes.

DSL Executor: validate(program), compile(program), execute(ir, context): ExecutionResult. Calls ToolRegistry not Stores directly.

Execution Mode: Parse -> Validate entire DSL -> Compile entire DSL -> Resolve references -> Execute Tools -> Transaction(s). Prefer single transaction for one DSL program when TransactionManager supports atomic multi-command else preserve contract document it. Do NOT create second transaction system inside DSL.

Atomicity: Instruction A valid B valid C fails system must NOT leave A committed B committed C failed unless architecture defines program as multiple independent transactions. For normal DSL program intended as one atomic operation A B C -> Atomic Transaction if C fails rollback entire program. Implemented via tracking createdObjectIds and deleting on failure via T04 with fallback direct store delete.

Read/Proposal DSL: Preserve Tool category semantics detect_symmetry remains READ cannot become Mutation, propose_constraint remains PROPOSAL cannot write ConstraintStore.

Versioning: version "1.0" parser rejects unsupported major versions future-compatible 1.x may add optional fields do not silently reinterpret unknown semantics.

Unknown Fields: Unknown operation -> Error, Unknown required semantic field -> Error, Unknown arguments -> Warning or Error per operation schema strict rejection for mutation operations do not silently ignore dangerous mutation parameters.

Serialization: serializeDSL(program): string deserializeDSL(input: string): DSLProgram deterministic stable round-trippable UTF-8 safe equivalent programs serialize consistently. Sort keys for determinism.

Linter: Checks undefined reference, unused reference, duplicate reference, impossible operation, invalid operation ordering, redundant transform, invalid boolean target count, proposal/mutation confusion. Linting must not mutate state.

Security: MUST NOT support filesystem network arbitrary JavaScript eval Function dynamic imports shell commands HTML execution reject fields attempting to inject executable code DSL is data not executable JavaScript. Implemented via JSON.parse reviver rejecting __proto__, constructor, prototype, plus Object.getPrototypeOf check for prototype pollution, plus dangerous field list __proto__ constructor prototype eval Function exec import require process fs child_process.

Determinism: Same DSL + same canonical state + same config -> equivalent AST IR Tool ordering no random iteration Date.now Math.random for semantic behavior.

Error Model: Reuse existing Error Model add DSL-specific codes DSL_PARSE_ERROR DSL_UNSUPPORTED_VERSION DSL_INVALID_OPERATION DSL_SCHEMA_INVALID DSL_SEMANTIC_INVALID DSL_UNKNOWN_REFERENCE DSL_DUPLICATE_REFERENCE DSL_INVALID_ARGUMENT DSL_COMPILE_FAILED DSL_EXECUTION_FAILED no incompatible second Error class.

Traceability: Every IR retains sourceInstructionIndex optionally sourceRef enables AI reasoning trace Critic Debugging Memory to answer which DSL instruction caused this Tool.

Dependency: Foundation -> Geometry -> Stores -> SceneGraph/Appearance/Constraint/Semantic -> Command/Transaction -> Tool Registry -> Vector DSL. Geometry->DSL forbidden Stores->DSL forbidden DSL is higher-level orchestration.

Future AI Integration: Planner -> DSL Program -> Validator -> Compiler -> Tool IR -> Tool Registry. Planner must NOT need knowledge of ObjectStore internals GeometryStore internals SceneGraph internals Transaction internals that complexity remains behind Tool/Transaction boundary.

DO NOT BUILD: AI Planner NLU ExpectedState Critic Memory Collaboration DAG History Gradient Pattern Brush Mesh Effects 3D AreaText TextOnPath Multi-artboard Custom scripting language JavaScript execution.

Tests: Parser valid program malformed JSON missing version unsupported version missing operation unknown operation, Schema wrong types missing required fields invalid enum invalid numeric values invalid nested objects, Reference valid reference unknown reference duplicate reference forward reference rejection, Compilation create rect T01 ellipse T02 delete T04 transform translate T05 matrix T06 appearance T07 align T08 distribute T09 group T10 boolean T13 propose_constraint T19 propose_semantic T20, DSL Operations create update delete transform appearance group ungroup reorder boolean align distribute pointText artboard constraint proposal semantic proposal, Serialization deterministic round-trippable, Linter unused reference warning undefined reference error, Non-Mutation compile does not mutate stores, Proposal Proposal returned ConstraintStore unchanged No mutation No Event No Transaction, Rollback ALL changes rolled back No partial canonical state remains, Vertical Slice create red 200x100 rx12 and center DSL -> Parser -> AST -> Validation -> IR -> T01 create_rectangle -> T08 align_objects -> Command -> Transaction -> Commit -> Canonical State -> Events -> SpatialIndex -> RenderTree -> Renderer final state width=200 height=100 rx=12 fill=#FF0000 centered=true.

Architecture Checks: DSL has no UI dependency, no filesystem, no network, no eval, does not directly mutate Stores, Parser does not mutate, Validator does not mutate, Compiler does not mutate, IR does not mutate, Executor uses ToolRegistry, Mutation uses Transaction, Proposal remains Proposal, Read remains Read, SceneGraph remains hierarchy owner, Geometry remains independent of DSL, Renderer remains ReadOnly, No circular dependency.
