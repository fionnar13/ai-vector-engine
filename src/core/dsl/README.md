
# Vector DSL — Phase 3.12

Deterministic, validated, machine-readable Vector DSL that converts high-level structured vector operations into IR that executes via Tool Registry.

## Pipeline

DSL
 ↓
Parser (JSON syntax validation → DSL structure validation → AST construction)
 ↓
AST (normalized DSLProgram with sourceIndex)
 ↓
Schema Validation (version, operation, required fields, types, enum, numeric ranges, reference syntax, duplicate refs, dangerous fields)
 ↓
Semantic Validation (unknown refs, forward refs, group empty, boolean <2, align <1, distribute <3, singular matrix, opacity 0..1, etc)
 ↓
IR (ToolIR[] toolId, input, sourceInstructionIndex, sourceRef, targets, category)
 ↓
Tool Registry (T01..T20, ARTBOARD custom)
 ↓
Command
 ↓
Transaction
 ↓
Canonical State

DSL is instruction language NOT Store NOT Transaction NOT second mutation mechanism. NEVER directly mutates ObjectStore, GeometryStore, AppearanceStore, SceneGraph, ConstraintStore, SemanticStore. Only valid path DSL → Parser → Validator → IR → Tool Registry → Mutation Tool → Command → Transaction → Commit

## Design Principles

Deterministic, Typed, Explicit, Serializable, Inspectable, Validatable, Versioned, AI-friendly, Human-readable, Machine-readable

Supports create, update, delete, transform, appearance, group, ungroup, reorder, boolean, align, distribute, text, artboard, propose_constraint, propose_semantic

## MVP Representation

JSON canonical. Example {"version":"1.0","program":[{"op":"create","type":"rect","id":"rectA","args":{"width":200,"height":100,"rx":12,"fill":"#FF0000"}}]}

## Root Contract

interface VectorDSL { version: string; program: DSLInstruction[] }
interface DSLInstruction { op: DSLOp; id?: string; args?: Record<string, unknown>; }
Avoid any unless isolated

## Operations

type DSLOp = "create"|"update"|"delete"|"transform"|"appearance"|"group"|"ungroup"|"reorder"|"boolean"|"align"|"distribute"|"text"|"artboard"|"propose_constraint"|"propose_semantic"

Maps to Tools DSL itself does not implement state-changing behavior

## Create

Types rect ellipse path pointText line polygon star. id is DSLRef NOT ObjectID. Mapping DSLRef → ObjectID via DSL Environment execution context only not canonical state.

## Update

Whitelisted fields width height rx ry x y cx cy content position style fill stroke opacity. Arbitrary mutation rejected.

## Delete

Maps to T04 delete_objects validation before Transaction

## Transform

translate scale rotate matrix using Matrix3x3 existing implementation no second matrix. Example translate {x:100,y:50} → T05 move_object, matrix → T06 transform_objects singular check.

## Appearance

fill #FF0000 opacity 0.8 maps to T07 apply_fill Geometry not mutated for Appearance.

## Group

targets [rectA, ellipseA] id groupA hierarchy stored exclusively in SceneGraph never GraphicObject. Maps to T10.

## Ungroup

target groupA maps to T11 preserves world transforms.

## Reorder

targets [rectA] args operation front maps to T12 Z-order SceneNode.children[] no second store.

## Boolean

operation union targets [shapeA, shapeB] args fillRule nonZero tolerance 0.5 keepOriginals false maps to T13 DSL no Boolean algorithm.

## Align

targets [A,B,C] args axis horizontal mode center uses WorldBBox via T08.

## Distribute

targets [A,B,C] axis horizontal mode gaps maps to T09.

## Text

pointText only content position style fontFamily fontSize fontWeight 700 fontStyle normal lineHeight letterSpacing textAlign left fill #000000. Reject areaText textOnPath richText. Maps to T15.

## Artboard

width 1920 height 1080 MVP single-artboard respect Document/Artboard contract no multi-artboard.

## Constraint Proposal

targets [A,B] args type align axis horizontal maps to T19 infer_constraints Proposal NOT ConstraintStore.write()

## Semantic Proposal

targets [A] maps to T20 infer_semantic produces SemanticProposal not mutate SemanticStore

## AST

interface DSLProgram { version, instructions: DSLNode[] } interface DSLNode { op, ref, target, targets, type, operation, args, sourceIndex } independent of canonical Store objects.

## Parser

parseDSL(input: unknown): ParseResult responsibilities JSON syntax validation → DSL structure validation → AST construction. Parser must NOT execute Tools NOT mutate state.

## Schema Validator

validateDSL structure version operation required fields types enum numeric ranges reference syntax duplicate refs malformed structures example width="200" fail width=200 pass.

## Semantic Validator

delete unknown DSLRef fail, transform unknown fail, group empty fail, boolean <2 fail, align < required fail, invalid matrix fail, invalid fillRule fail, invalid opacity fail. Structured errors.

## Reference Validation

Track Defined References Used References. transform unknownObject fail DSL_UNKNOWN_REFERENCE.

## Forward References

MVP rule forward references allowed only when referenced object guaranteed to be created earlier during program execution. create A transform A valid. transform A create A invalid. No deferred execution.

## IR

interface ToolIR { toolId, input, sourceInstructionIndex, sourceRef, category } Program becomes DSL → AST → ToolIR[] Example create rect → ToolIR {toolId:"T01", input:{...}}

## Tool Mapping

Explicit mapping create rect→T01, ellipse→T02, path→T03, delete→T04, transform translate→T05 matrix→T06, appearance→T07, align→T08, distribute→T09, group→T10, ungroup→T11, reorder→T12, boolean→T13, text outline→T14, create text→T15, find role→T16, detect shape→T17, detect symmetry→T18, constraint proposal→T19, semantic proposal→T20. No dynamic guess explicit testable.

## IR Must Not Mutate

Contains Tool ID Input References Source metadata. Must NOT contain Store handles canonical objects mutable SceneNodes.

## DSL Executor

validate(program), compile(program), execute(ir, context): ExecutionResult. Calls ToolRegistry not Stores directly.

## Execution Mode

Parse → Validate entire DSL → Compile entire DSL → Resolve references → Execute Tools → Transaction(s). Prefer single transaction for one DSL program when TransactionManager supports atomic multi-command else preserve contract document it. Do NOT create second transaction system inside DSL.

## Atomicity

Instruction A valid B valid C fails system must NOT leave A committed B committed C failed unless architecture defines program as multiple independent transactions. For normal DSL program intended as one atomic operation A B C → Atomic Transaction if C fails rollback entire program.

## Read/Proposal DSL

Preserve Tool category semantics detect_symmetry remains READ cannot become Mutation, propose_constraint remains PROPOSAL cannot write ConstraintStore.

## Versioning

version "1.0" parser rejects unsupported major versions future-compatible 1.x may add optional fields do not silently reinterpret unknown semantics.

## Unknown Fields

Unknown operation → Error, Unknown required semantic field → Error, Unknown arguments → Warning or Error per operation schema strict rejection for mutation operations do not silently ignore dangerous mutation parameters.

## Serialization

serializeDSL(program): string deserializeDSL(input: string): DSLProgram deterministic stable round-trippable UTF-8 safe equivalent programs serialize consistently.

## Linter

Checks undefined reference, unused reference, duplicate reference, impossible operation, invalid operation ordering, redundant transform, invalid boolean target count, proposal/mutation confusion. Linting must not mutate.

## Security

MUST NOT support filesystem network arbitrary JavaScript eval Function dynamic imports shell commands HTML execution reject fields attempting to inject executable code DSL is data not executable JavaScript.

## Determinism

Same DSL + same canonical state + same config → equivalent AST IR Tool ordering no random iteration Date.now Math.random for semantic behavior.

## Error Model

Reuse existing Error Model add DSL-specific codes DSL_PARSE_ERROR DSL_UNSUPPORTED_VERSION DSL_INVALID_OPERATION DSL_SCHEMA_INVALID DSL_SEMANTIC_INVALID DSL_UNKNOWN_REFERENCE DSL_DUPLICATE_REFERENCE DSL_INVALID_ARGUMENT DSL_COMPILE_FAILED DSL_EXECUTION_FAILED no incompatible second Error class.

## Traceability

Every IR retains sourceInstructionIndex optionally sourceRef enables AI reasoning trace Critic Debugging Memory to answer which DSL instruction caused this Tool.

## Dependency

Foundation → Geometry → Stores → SceneGraph/Appearance/Constraint/Semantic → Command/Transaction → Tool Registry → Vector DSL. Geometry→DSL forbidden Stores→DSL forbidden DSL is higher-level orchestration.

## Future AI Integration

Planner → DSL Program → Validator → Compiler → Tool IR → Tool Registry. Planner must NOT need knowledge of ObjectStore internals GeometryStore internals SceneGraph internals Transaction internals that complexity remains behind Tool/Transaction boundary.

## DO NOT BUILD

AI Planner NLU ExpectedState Critic Memory Collaboration DAG History Gradient Pattern Brush Mesh Effects 3D AreaText TextOnPath Multi-artboard Custom scripting language JavaScript execution
