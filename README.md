# AI-Native Vector Graphics Engine

A deterministic, AI-native vector graphics engine with a pure planning layer, DSL, Tool Registry, Transaction system, and ReadOnly renderer.

**Current Status:** Phase 3.12 PASS — Vector DSL implemented, Tool Registry, Constraint Engine, Semantic Engine, Interaction, Renderer, Transaction, SceneGraph, Geometry Kernel, Foundation all passing.

## Architecture Overview

```
Human / External Intent
        ↓
Intent
        ↓
AI Planner (pure planning, no mutation)
        ↓
ExpectedState (reasoning artifact, NOT canonical state)
        ↓
Plan (DAG, deterministic)
        ↓
DSL / IR (Vector DSL v1.0)
        ↓
Tool Registry (20 tools: T01-T20)
        ↓
Validation
        ↓
Transaction (atomic, Command pattern)
        ↓
Canonical State (ObjectStore, GeometryStore, AppearanceStore, SceneGraph, etc.)
        ↓
Derived Caches (SpatialIndex, RenderTree)
        ↓
Renderer (ReadOnly)
```

### Key Invariants

1. Canonical State has one owner
2. SceneGraph owns hierarchy (never `object.parent`)
3. Geometry does not know UI
4. Appearance separate from Geometry
5. Planner never mutates Document State
6. AI never directly writes Stores
7. Mutation only through Transaction
8. DSL never directly mutates Stores
9. Renderer remains ReadOnly
10. History remains Linear in MVP
11. Plan DAG ≠ History DAG

## Project Structure

```
src/
  core/
    ai/                 # Phase 3.13 - Intent, ExpectedState, Plan, Planner
    appearance/         # Fill, Stroke, Effects, Graph, Resolver
    constraints/        # Constraint Store, Evaluator, Solver
    dsl/                # Parser, Validator, Compiler, IR, Executor, Linter
    errors/             # Unified Error Model
    events/             # Event System
    geometry/           # Rect, Ellipse, Path, Bezier, BBox, Transform
    ids/                # ID Factory (deterministic for tests)
    interaction/        # Selection, Drag, Hit-test, Tools
    math/               # Vec2, Matrix3x3, BBox
    renderer/           # RenderTree, Canvas2D backend, Invalidation
    scenegraph/         # SceneGraph, SpatialIndex, Transform, Traversal
    semantic/           # Semantic Store, Heuristics, Proposals
    stores/             # ObjectStore, GeometryStore, AppearanceStore, DocumentStore
    tools/              # 20 Tools: mutation, read, proposal + Registry
    transaction/        # Command, Transaction, History, WorkingCopy
    validation/         # Validation utilities
  core/README.md        # Architecture overview

src-js/                 # JS runtime (mirrors TS for Node tests without tsc)
  ai.js                 # JS Planner runtime
  dsl.js                # DSL JS runtime
  tools.js              # Tool Registry JS runtime
  stores.js, scenegraph.js, geometry.js, etc.

tests/                  # .mjs tests (Node ESM, no build step)
  ai.test.mjs
  dsl.test.mjs
  tools.test.mjs
  geometry.test.mjs
  scenegraph.test.mjs
  etc.

ARCHITECTURE.md         # Full architecture contract
PHASE_*.md              # Build reports per phase
```

## How to Run

### Prerequisites

- Node.js >= 18 (ESM support)
- No external dependencies required for JS runtime tests

### Install (if you add dependencies later)

```bash
npm install
```

### Run Tests (JS runtime, no TypeScript build needed)

```bash
# Run all tests
node tests/dsl.test.mjs
node tests/tools.test.mjs
node tests/ai.test.mjs
node tests/geometry.test.mjs
node tests/scenegraph.test.mjs
node tests/constraints.test.mjs
node tests/semantic.test.mjs
node tests/stores.test.mjs
node tests/transaction.test.mjs
node tests/renderer.test.mjs
node tests/interaction.test.mjs

# Or run single file
node --test tests/dsl.test.mjs  # if using node:test
```

### TypeScript Build (if you have tsc)

```bash
# Install TypeScript if not present
npm install -D typescript

# Build
npx tsc --noEmit          # type-check only
npx tsc -p tsconfig.json  # build if outDir configured
```

### Vertical Slice Example (Red Rounded Centered Rectangle)

```javascript
import { createPlanner, createPlanningContextFromStores } from './src-js/ai.js';
import { createCoreToolRegistry } from './src-js/tools.js';
import { GeometryStore, AppearanceStore, ObjectStore } from './src-js/stores.js';
import { SceneGraph } from './src-js/scenegraph.js';
import { SemanticStore } from './src-js/semantic.js';

const doc = {
  geometryStore: new GeometryStore(),
  appearanceStore: new AppearanceStore(),
  objectStore: new ObjectStore({hasGeometry:()=>true, hasAppearance:()=>true}),
  sceneGraph: new SceneGraph(),
  semanticStore: new SemanticStore()
};

const registry = createCoreToolRegistry();
const context = createPlanningContextFromStores({
  documentId: 'doc-1',
  artboard: {id:'artboard-1', bbox:{x:0,y:0,width:1920,height:1080}},
  objectStore: doc.objectStore,
  sceneGraph: doc.sceneGraph,
  appearanceStore: doc.appearanceStore,
  semanticStore: doc.semanticStore,
  toolRegistry: registry
});

const intent = {
  id: 'intent-1',
  source: 'user',
  action: 'create',
  parameters: {type:'rect', width:200, height:100, rx:12, ry:12, fill:'#FF0000'},
  constraints: [{type:'Centered', target:'artboard', axis:'both'}]
};

const planner = createPlanner();
const result = planner.plan(intent, context);
// result.expectedState -> {geometry:{width:200,height:100,rx:12}, appearance:{fill:{color:'#FF0000'}}, spatial:{centered:{target:'artboard',axis:'both'}}}
// result.plan -> [T01 create_rectangle, T07 apply_fill, T08 align_objects]

const dsl = planner.planToDSL(result.plan, intent);
// Then: parseDSL -> validateDSL -> compileDSL -> DSLExecutor -> Transaction -> Commit
```

Persian example from spec:
```
یک مستطیل قرمز 200×100 بساز، گوشههایش 12px باشد و آن را وسط Artboard قرار بده.
```

## Tool Registry (20 Tools)

| ID | Name | Category |
|----|------|----------|
| T01 | create_rectangle | mutation |
| T02 | create_ellipse | mutation |
| T03 | create_path | mutation |
| T04 | delete_objects | mutation |
| T05 | move_object | mutation |
| T06 | transform_objects | mutation |
| T07 | apply_fill | mutation |
| T08 | align_objects | mutation |
| T09 | distribute_objects | mutation |
| T10 | group_objects | mutation |
| T11 | ungroup_objects | mutation |
| T12 | reorder_objects | mutation |
| T13 | boolean_operation | mutation |
| T14 | outline_text | mutation |
| T15 | create_point_text | mutation |
| T16 | find_object_by_role | read |
| T17 | detect_shape_primitive | read |
| T18 | detect_symmetry | read |
| T19 | infer_constraints | proposal |
| T20 | infer_semantic | proposal |

## Vector DSL Example

```json
{
  "version": "1.0",
  "program": [
    {"op":"create","type":"rect","id":"A","args":{"width":200,"height":100,"rx":12}},
    {"op":"appearance","target":"A","args":{"fill":"#FF0000"}},
    {"op":"align","targets":["A"],"args":{"axis":"both","mode":"center"}}
  ]
}
```

## GitHub Backup Preparation

This repo is ready for GitHub:

```bash
# Initialize git (if not already)
git init
git add .
git commit -m "feat: phase 3.12 - vector DSL + ai planner"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/ai-vector-engine.git
git branch -M main
git push -u origin main
```

The `.gitignore` excludes `node_modules/`, `dist/`, `.env`, logs, and temporary `tmp_*.mjs` files.

No secrets are included. Use `.env.example` as template.

## Documentation

- `ARCHITECTURE.md` — Full contract, boundaries, invariants
- `src/core/README.md` — Core overview
- `src/core/dsl/README.md` — DSL spec
- `src/core/ai/README.md` — Planner spec (Phase 3.13)
- `PHASE_3.xx_BUILD_REPORT.md` — Per-phase reports

## Security

- Planner: no `fs`, `fetch`, `window`, `document`, `eval`, `Function` — pure planning
- DSL: rejects `__proto__`, `constructor`, `prototype`, `eval` via reviver + hasOwnProperty check + prototype pollution detection
- No network, no filesystem in core

## Next Phase

Phase 3.13 — AI Planner + Expected State (Intent → ExpectedState → Plan → DSL → Transaction)
Phase 3.14 — Critic + Evaluation (future)

## License

MIT (or your preferred license) — add LICENSE file if needed.
