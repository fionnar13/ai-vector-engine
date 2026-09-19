
# Semantic Engine — Phase 3.10

Interpretation layer, not authority.

## Ownership

- SemanticStore canonical owner SemanticEngine
- Map<ObjectID, SemanticData>
- No SemanticID for primary record
- ObjectID is key

## What it owns

- role, tags, confidence, source, relationships, updatedAt

## What it does NOT own

- Geometry, Appearance, SceneGraph, Transform, ConstraintStore, Renderer state
- No parent/children/z-order/localTransform/worldTransform duplication

## Contract

SemanticData {
  objectId ObjectID
  role? SemanticRole (background|foreground|container|group|text|heading|button|icon|logo|image|illustration|decorative|shape|unknown)
  tags string[] normalized lowercase deterministic alphabetical unique
  confidence 0..1 finite not NaN/Infinity
  source user|ai|heuristic|import|system
  relationships SemanticRelationship[] targetObjectId ObjectID type contains|containedBy|labels|associatedWith|decorates|references
  updatedAt?
}

## Validation

- objectId valid UUID
- confidence finite 0..1
- tags strings normalized lowercase trimmed collapse whitespace sorted unique no undefined
- role controlled vocabulary extensible /^[a-z_][a-z0-9_]*$/
- relationships targetObjectId valid UUID type valid

## Object existence

SemanticData cannot reference non-existing object. Before commit: semantic.objectId -> ObjectStore exists? If not VALIDATION_SCHEMA. No phantom.

## Stale data

When Object deleted, Transaction responsible must delete its semantic record. No orphan. Recreated object gets new ObjectID per ID contract, never reuse semantic state.

## Heuristic Inference

Deterministic rule-based NOT LLM/ML. Input SemanticInferenceInput {objectId, geometry, appearance, sceneContext {parentId, childCount, siblingCount, depth, bbox {minX minY maxX maxY width height area}, isText, textContent}}

Signals: geometry_type, aspect_ratio, size, position, appearance, text, scene_structure, relationship

Conservative: insufficient evidence -> role unknown or no proposal. Red rectangle alone NOT button unless sufficient evidence.

## Proposal Contract

SemanticProposal {proposalId unique, objectId, proposedRole?, proposedTags, proposedRelationships, confidence, evidence SemanticEvidence[], source heuristic|ai, createdAt?}

Evidence {signal geometry_type|aspect_ratio|size|position|appearance|text|scene_structure|relationship, description, weight}

Confidence: base + sum(weights)*0.3 clamped [0,1] deterministic documented.

Proposal IDs unique via randomUUID but role/tags/confidence/evidence deterministic.

## Inference is Read-Only HARD RULE

SceneGraph GeometryStore ObjectStore AppearanceStore ConstraintStore -> Semantic Heuristic Engine -> SemanticProposal

No mutation: MUST NOT semanticStore.set/delete, objectStore.write, geometryStore.write, sceneGraph.write, constraintStore.write

Logically: Read State -> Proposal

## Persistence Flow

Inference -> SemanticProposal -> Validation -> User/AI approval -> create/update semantic Command -> Transaction -> Working Copy -> Validate -> Commit -> semanticStore -> SemanticUpdated Event

No shortcut.

## Commands

create_semantic, update_semantic, delete_semantic deterministic reversible inverseCommand snapshot not required. Merge policy MVP: role replace, tags replace, relationships replace with future merge mode.

## Undo/Redo

Semantic mutations participate in existing History linear. create -> Transaction -> Undo -> removed -> Redo -> restored. Inference itself no undo because no mutation.

## Events

SemanticCreated, SemanticUpdated, SemanticDeleted, SemanticInferred. Inference produces proposal SemanticInferred, persistence produces Created/Updated/Deleted. Do NOT emit mutation events before commit. Ordering Command -> Working Copy -> Validate -> Commit -> Diff -> Event -> Derived Invalidation

## Query API

findObjectsByRole, findObjectsByTag, getSemantic, getSemanticConfidence, getRelationships all read-only no mutate.

## Serialization

Deterministic stable ordering valid ObjectIDs no runtime-only fields no circular future compatible. Tags alphabetical deterministic, relationships sorted targetObjectId+type.

## Determinism

Same document state -> same role/tags/confidence/evidence. No Math.random, Date.now in deterministic logic except proposalId uniqueness and updatedAt. Inference logic deterministic.

## Merge Policy

MVP role replace tags replace relationships replace with future granular. Documented.

## Dependency

Math -> Geometry -> Object/Appearance/SceneGraph/Constraint -> Semantic -> Tools -> DSL -> Planner

Semantic MUST NOT reverse dependency Renderer -> Semantic or Semantic -> Renderer. No react/vue/window/document/canvas/fs/fetch/renderer UI.

heuristics.ts proposal.ts read-only no direct store mutation.
