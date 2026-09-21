// PHASE 3.13 CHECKPOINT B — §16 determinism probe (spec §41-B mandatory proof).
// Runs the SAME (intent, context) through createExpectedState / createPlan /
// compilePlanToDSL TWICE and proves byte-identical output via JSON.stringify
// equality AND sha256 equality of the serialized artifacts.
import { createHash } from 'node:crypto';
import {
  createPlanningContext, createExpectedState, createPlan, compilePlanToDSL
} from '../src-js/ai.js';

const intent = { type:'create', objectType:'rectangle', width:200, height:100, rx:12, ry:12, fill:'#FF0000', placement:'center' };
const context = createPlanningContext({ artboard:{ width:800, height:600, centerX:400, centerY:300 }, objects:[] });

const run = () => {
  const expectedState = createExpectedState(intent, context);
  const plan = createPlan(intent, context);
  const dsl = compilePlanToDSL(plan);
  return {
    expectedStateJson: JSON.stringify(expectedState),
    planJson: JSON.stringify(plan),
    dslJson: JSON.stringify(dsl)
  };
};

const a = run();
const b = run();

const sha = (s) => createHash('sha256').update(s).digest('hex');
const rows = [
  ['ExpectedState', a.expectedStateJson, b.expectedStateJson],
  ['Plan',          a.planJson,          b.planJson],
  ['DSL',           a.dslJson,           b.dslJson]
];

let allIdentical = true;
for (const [name, ja, jb] of rows){
  const identical = ja === jb;
  if (!identical) allIdentical = false;
  console.log(`${name}:`);
  console.log(`  run1 JSON : ${ja}`);
  console.log(`  run2 JSON : ${jb}`);
  console.log(`  byte-identical: ${identical ? 'YES' : 'NO'}`);
  console.log(`  run1 sha256: ${sha(ja)}`);
  console.log(`  run2 sha256: ${sha(jb)}`);
}
console.log(`plan.id = ${JSON.parse(a.planJson).id}`);
console.log(`plan.intentId = ${JSON.parse(a.planJson).intentId}`);
console.log(`\nDETERMINISM PROOF (§16): same input + same context -> identical output = ${allIdentical ? 'PROVEN' : 'FAILED'}`);
if (!allIdentical) process.exit(1);
