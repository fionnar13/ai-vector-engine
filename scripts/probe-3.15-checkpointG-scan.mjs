// PHASE 3.15 — CHECKPOINT G scan-pattern probe (pre-embedding validation).
// Validates, against the CLEAN src-js/correction.js (F-pristine d27de7e9…):
//   (1) the comment/string stripper (verbatim 3.13/3.14 copy) terminates,
//       preserves code, and strips comments/strings 1:1 on the target module;
//   (2) every §52/§66 scan returns ZERO matches on the clean module (no false
//       positives — comments/strings stripped, word boundaries kept);
//   (3) the ALLOWLIST scans observe exactly the surfaces the G tests will pin
//       (the probe derives them; embedding pins them — drift = probe FAIL);
//   (4) positive controls (synthetic code-position violations, including the
//       ALIAS FORM the paren scans cannot see) DO fire, and the SANCTIONED
//       forms (request.document field, local-Map bookkeeping, the pipeline
//       calls) do NOT;
//   (5) the src/core freeze manifest is recomputed (178 files + aggregate) in
//       BOTH buffer-hash and utf8-string-hash form (agreement asserted);
//   (6) package.json dependency fields are absent;
//   (7) correction.js import lines are ZERO (the A-era zero-import pin).
// Exit 0 = probe PASS (patterns safe to embed in tests/correction.test.mjs).

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

// Verbatim copy of the 3.13/3.14 Checkpoint G stripper
// (scripts/probe-3.13-checkpointG-scan.mjs / tests/ai.test.mjs:1351).
function stripCommentsAndStrings(src){
  let out = '';
  let mode = 'code'; // code | line | block | squote | dquote | template
  const frames = []; // template-literal interpolation stack: {braceDepth}
  const n = src.length;
  let i = 0;
  while (i < n){
    const c = src[i];
    const d = i + 1 < n ? src[i + 1] : '';
    if (mode === 'code'){
      if (c === '/' && d === '/'){ mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*'){ mode = 'block'; out += '  '; i += 2; continue; }
      if (c === "'"){ mode = 'squote'; out += ' '; i += 1; continue; }
      if (c === '"'){ mode = 'dquote'; out += ' '; i += 1; continue; }
      if (c === '`'){ mode = 'template'; out += ' '; i += 1; continue; }
      if (frames.length > 0){
        if (c === '{'){ frames[frames.length - 1].braceDepth += 1; }
        else if (c === '}'){
          const f = frames[frames.length - 1];
          if (f.braceDepth === 0){ frames.pop(); mode = 'template'; out += ' '; i += 1; continue; }
          f.braceDepth -= 1;
        }
      }
      out += c; i += 1; continue;
    }
    if (mode === 'line'){
      if (c === '\n'){ mode = 'code'; out += '\n'; } else { out += ' '; }
      i += 1; continue;
    }
    if (mode === 'block'){
      if (c === '*' && d === '/'){ mode = 'code'; out += '  '; i += 2; }
      else { out += (c === '\n' ? '\n' : ' '); i += 1; }
      continue;
    }
    // string modes: squote / dquote / template-literal text
    if (c === '\\'){ out += '  '; i += 2; continue; }
    if (mode === 'squote' && c === "'"){ mode = 'code'; out += ' '; i += 1; continue; }
    if (mode === 'dquote' && c === '"'){ mode = 'code'; out += ' '; i += 1; continue; }
    if (mode === 'template'){
      if (c === '`'){ mode = 'code'; out += ' '; i += 1; continue; }
      if (c === '$' && d === '{'){ frames.push({ braceDepth: 0 }); mode = 'code'; out += '  '; i += 2; continue; }
      out += (c === '\n' ? '\n' : ' '); i += 1; continue;
    }
    // squote / dquote regular content char: emit placeholder and advance.
    out += (c === '\n' ? '\n' : ' '); i += 1; continue;
  }
  return out;
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const CORR_SRC = read('src-js/correction.js');
const CORR_S = stripCommentsAndStrings(CORR_SRC);

let ok = true;
const fail = (m) => { console.error('PROBE FAIL: ' + m); ok = false; };

// ---- (1) stripper sanity on correction.js -----------------------------------
{
  if (CORR_S.length !== CORR_SRC.length) fail(`stripped length ${CORR_S.length} !== source length ${CORR_SRC.length}`);
  if (CORR_S.split('\n').length !== CORR_SRC.split('\n').length) fail('line count not 1:1');
  if (CORR_S.includes('/*') || CORR_S.includes('*/')) fail('comment delimiters survived stripping');
  // code preserved (pinned tokens that MUST survive stripping)
  for (const t of ['executeCorrectionAttempt','acceptCorrectionAttempt','rollbackCorrectionAttempt','detectCorrectionRegression','detectCorrectionConvergence','CorrectionEngine','validateCorrectionLoopRequest','correctionCommandFor','executionPreflightRefusal','substrateWorkingCopyView','engineRun','CORRECTION_MODE_DISPATCH']){
    if (!CORR_S.includes(t)) fail(`stripped body lost code token '${t}'`);
  }
  // comment prose stripped (REAL occurrences in the clean module)
  if (!CORR_SRC.includes('executes transactions or touches stores')) fail('stripping control phrase absent from RAW source (control is stale)');
  if (CORR_S.includes('executes transactions or touches stores')) fail('comment text survived stripping');
  // string-literal TEXT stripped (REAL error-message string in the clean module)
  if (!CORR_SRC.includes('the loop never self-evaluates')) fail('string control phrase absent from RAW source (control is stale)');
  if (CORR_S.includes('the loop never self-evaluates')) fail('string-literal text survived stripping');
  // word-count control: \bdisclosure\b exists ONLY in comments/strings
  const rawD = (CORR_SRC.match(/\bdisclosure\b/g) || []).length;
  const strD = (CORR_S.match(/\bdisclosure\b/g) || []).length;
  if (rawD < 5) fail(`expected >=5 raw \\bdisclosure\\b occurrences, got ${rawD}`);
  if (strD !== 0) fail(`\\bdisclosure\\b survives in stripped body (${strD})`);
  console.log(`(1) stripper: 1:1, code preserved, comments/strings stripped (raw \\bdisclosure\\b: ${rawD}, stripped: ${strD})`);
}

// ---- (2) clean-module scans: ZERO matches ------------------------------------
{
  // Capability words (§52/§66; bare word-boundary form = alias-aware).
  // NOTE: `document` is scanned SEPARATELY in global-reach form — the §25
  // CorrectionLoopRequest legitimately carries `request.document` (approved
  // disclosure 33), so property access is sanctioned and carved out.
  const CAP_WORDS = ['window', 'fetch', 'eval', 'Function', 'globalThis', 'process', 'fs', 'localStorage', 'require'];
  const wordHits = (text, w) => text.match(new RegExp(`\\b${w}\\b`, 'g')) || [];
  // document: carve out the sanctioned property access .document, then require zero bare words
  const docBare = (CORR_S.replace(/\.document\b/g, '').match(/\bdocument\b/g)) || [];
  if (docBare.length) fail(`clean body matches bare \\bdocument\\b after the .document carve-out — ${JSON.stringify(docBare)}`);
  if (!/\.document\b/.test(CORR_S)) fail('sanity: the sanctioned request.document property access is expected in the clean body');
  // Bare mutation-method surface (§52/§66 minus the receiver-pinned forms):
  // .write/.insert/.remove/.update/.commit/.rollback/.register/.unregister/
  // .render/.invalidate must be ABSENT in any form. `.set(`/`.delete(` are
  // covered by the own-collection receiver allowlist (local Map bookkeeping —
  // the disclosed .push precedent class); `.execute(`/`.commit(` on the
  // sanctioned receivers by the G-6 allowlists.
  const MUT_BARE = /\.(write|insert|remove|update|commit|rollback|register|unregister|render|invalidate)\s*\(/g;
  // Store + renderer vocabulary (no store object is reachable at all; the
  // loop never renders).
  const STORE_RE = /\b(stores?|Stores?)\b/g;
  const RENDER_RE = /\b(render|renderer|Renderer|RenderTree|RenderTreeBuilder|invalidate)\b/g;
  // Async / autonomous-execution forms (§66: no self-driving loop).
  const ASYNC_RES = [[/\bsetInterval\s*\(/g, 'setInterval('], [/\bsetTimeout\s*\(/g, 'setTimeout('], [/\bsetImmediate\s*\(/g, 'setImmediate('], [/\bqueueMicrotask\s*\(/g, 'queueMicrotask('], [/\baddEventListener\s*\(/g, 'addEventListener('], [/\brequestAnimationFrame\s*\(/g, 'requestAnimationFrame('], [/\bimport\s*\(/g, 'import('], [/\bnew\s+Promise\b/g, 'new Promise']];
  // Unbounded loop forms.
  const UNB_RES = [[/\bwhile\s*\(\s*true\b/g, 'while(true)'], [/\bfor\s*\(\s*;\s*;\s*\)/g, 'for(;;)'], [/\bdo\s*\{/g, 'do{']];
  // Nesting / DAG vocabulary (§66: no transaction-nesting API, no History DAG).
  const NEST_RE = /\b(nested|nesting|DAG|dag)\b/g;
  // Substrate machinery is INJECTED, never constructed.
  const NEW_RE = /\bnew\s+(SceneGraph|HistoryManager|TransactionBuilder|TransactionExecutor|ToolRegistry|WorkingCopy)\b/g;

  for (const w of CAP_WORDS){
    const h = wordHits(CORR_S, w);
    if (h.length) fail(`clean body matches \\b${w}\\b — ${JSON.stringify(h)}`);
  }
  const mut = CORR_S.match(MUT_BARE) || [];
  if (mut.length) fail(`clean body matches bare mutation surface — ${JSON.stringify(mut)}`);
  const store = CORR_S.match(STORE_RE) || [];
  if (store.length) fail(`clean body matches store vocabulary — ${JSON.stringify(store)}`);
  const render = CORR_S.match(RENDER_RE) || [];
  if (render.length) fail(`clean body matches renderer vocabulary — ${JSON.stringify(render)}`);
  for (const [re, id] of ASYNC_RES){
    const h = CORR_S.match(re) || [];
    if (h.length) fail(`clean body matches async form ${id} — ${JSON.stringify(h)}`);
  }
  for (const [re, id] of UNB_RES){
    const h = CORR_S.match(re) || [];
    if (h.length) fail(`clean body matches unbounded form ${id} — ${JSON.stringify(h)}`);
  }
  const nest = CORR_S.match(NEST_RE) || [];
  if (nest.length) fail(`clean body matches nesting/DAG vocabulary — ${JSON.stringify(nest)}`);
  const newHits = CORR_S.match(NEW_RE) || [];
  if (newHits.length) fail(`clean body constructs substrate machinery — ${JSON.stringify(newHits)}`);
  const whiles = CORR_S.match(/\bwhile\s*\(/g) || [];
  if (whiles.length !== 1) fail(`expected EXACTLY ONE while loop (the bounded engineRun AUTO loop), got ${whiles.length}`);
  const runIdx = CORR_S.indexOf('function engineRun');
  const runEnd = CORR_S.indexOf('\nfunction ', runIdx + 1);
  if (runIdx < 0 || runEnd < 0) fail('engineRun region not found');
  const region = CORR_S.slice(runIdx, runEnd);
  for (const t of ['policy.maxIterations', 'guard', 'while (', 'cyclesPerRun']){
    if (!region.includes(t)) fail(`engineRun region lost '${t}'`);
  }
  if (!CORR_S.includes('CORRECTION_MODE_DISPATCH.SINGLE_STEP.stepBudget')) fail('SINGLE_STEP stepBudget bound not found in code body');
  if (!CORR_SRC.includes('exceeded the iteration bound')) fail('the §17/§18 termination-invariant throw message is absent from the RAW source');
  console.log(`(2) clean module: ZERO matches for capability words, bare mutation surface, store/renderer vocabulary, async forms, unbounded forms, nesting/DAG; exactly ONE while (the guarded engineRun AUTO loop)`);
}

// ---- (3) allowlist extraction: the surfaces G-4/G-5/G-6 will pin -------------
{
  const receiversOf = (re) => { const m = {}; for (const hit of (CORR_S.match(re) || [])){ const r = hit.replace(re, '$1'); m[r] = (m[r] || 0) + 1; } return m; };
  const propsAfter = (word) => { const out = new Set(); const re = new RegExp(`\\b${word}\\s*\\.\\s*(\\w+)`, 'g'); let m; while ((m = re.exec(CORR_S)) !== null) out.add(m[1]); return [...out].sort(); };
  const EXPECT = {
    substrate: ['registry', 'sceneGraph', 'transactionBuilder', 'transactionManager'],
    registry: ['get', 'has', 'validate'],
    transactionManager: ['execute', 'historyManager', 'undo'],
    // addCommand/build also appear in the duck-type guard's typeof checks
    // (executeCorrectionAttempt validates the injected builder surface)
    transactionBuilder: ['addCommand', 'begin', 'build'],
    builder: ['addCommand', 'build'],
    sceneGraph: ['findNodeByObjectId'],
    historyManager: ['getTransactionToUndo'],
    // ctx = the C-era dependency/safety SCAN context (read-only) beside the
    // command-execution context (workingCopy)
    ctx: ['constraints', 'scene', 'semantic', 'workingCopy'],
    scene: ['findNodeByObjectId'],
    tool: ['deterministic', 'execute', 'validate'],
    wc: ['deleteAppearance','deleteGeometry','deleteNode','deleteObject','getAppearance','getGeometry','getNode','getNodes','getObject','hasObject','loadNode','nodes','setAppearance','setGeometry','setNode','setObject']
  };
  for (const [w, expect] of Object.entries(EXPECT)){
    const got = propsAfter(w);
    if (JSON.stringify(got) !== JSON.stringify(expect)) fail(`allowlist drift for ${w}.: expected ${JSON.stringify(expect)}, observed ${JSON.stringify(got)}`);
  }
  // execute-receivers and begin-receivers (call forms)
  const execRecv = Object.keys(receiversOf(/\b(\w+)\s*\.\s*execute\s*\(/g)).sort();
  if (JSON.stringify(execRecv) !== JSON.stringify(['tool', 'transactionManager'])) fail(`execute-receiver drift: ${JSON.stringify(execRecv)}`);
  const beginRecv = Object.keys(receiversOf(/\b(\w+)\s*\.\s*begin\s*\(/g)).sort();
  if (JSON.stringify(beginRecv) !== JSON.stringify(['transactionBuilder'])) fail(`begin-receiver drift: ${JSON.stringify(beginRecv)}`);
  // own-collection bookkeeping receivers (local Maps — the .push precedent class)
  const setDelRecv = Object.keys(receiversOf(/\b(\w+)\s*\.\s*(?:set|delete)\s*\(/g)).sort();
  if (JSON.stringify(setDelRecv) !== JSON.stringify(['afterByIdentity', 'beforeByIdentity', 'seen'])) fail(`own-collection receiver drift: ${JSON.stringify(setDelRecv)}`);
  console.log('(3) allowlists observed EXACTLY as pinned: substrate {registry,sceneGraph,transactionBuilder,transactionManager}; registry {get,has,validate}; transactionManager {execute,historyManager,undo}; transactionBuilder {addCommand,begin,build}; builder {addCommand,build}; sceneGraph {findNodeByObjectId}; historyManager {getTransactionToUndo}; ctx {constraints,scene,semantic,workingCopy}; scene {findNodeByObjectId}; tool {deterministic,execute,validate}; wc {16-prop WorkingCopy view}; execute-> {tool,transactionManager}; begin-> {transactionBuilder}; own-Map bookkeeping {seen,beforeByIdentity,afterByIdentity}');
}

// ---- (4) positive controls + sanctioned negative controls ---------------------
{
  let ctl = 0;
  const expectHit = (cond, id) => { if (!cond){ console.error(`CONTROL MISS [${id}]`); ctl++; ok = false; } };
  const wordHits = (text, w) => text.match(new RegExp(`\\b${w}\\b`, 'g')) || [];
  const V = [
    "const evalAlias = eval; const fnAlias = Function; const fetchAlias = fetch; const winAlias = window; void evalAlias; void fnAlias; void fetchAlias; void winAlias;",
    "document.createElement('div');",
    "fetch('http://x');",
    "require('path');",
    "import('x');",
    "globalThis.x = 1;",
    "process.exit(1);",
    "localStorage.setItem('k', 'v');",
    "const fsAlias = fs; void fsAlias;",
    "store.write({}); map.set(k, v); map.delete(k); tx.commit(); tx.rollback();",
    "reg.register(t); reg.unregister(t); arr.insert(0); arr.remove(0); obj.update(0);",
    "renderer.render(tree); r.invalidate();",
    "substrate.stores.objectStore.write(0);",
    "substrate.sceneGraph.addObject('x');",
    "substrate.historyManager.push('x');",
    "substrate.transactionManager.rollbackAll();",
    "substrate.transactionBuilder.reset();",
    "substrate.registry.execute('T01', {});",
    "substrate.transport.send(0);",
    "const b2 = makeBuilder(); b2.begin({});",
    "const wc = {}; wc.write(0); wc.commit(0);",
    "const stranger = new Map(); stranger.set(1, 2); stranger.delete(1);",
    "const tx2 = {}; tx2.execute(step);",
    "new SceneGraph(); new HistoryManager(); new TransactionBuilder();",
    "setTimeout(f, 0); setInterval(f, 0); setImmediate(f); queueMicrotask(f);",
    "addEventListener('x', f); requestAnimationFrame(f);",
    "new Promise(res => res(1));",
    "let x = 0; while (x < 3){ x++; } while (true){ break; }",
    "const nested = 1; const nesting = 1; const dag = {};"
  ].join('\n');
  const VS = stripCommentsAndStrings(V);
  for (const w of ['window', 'fetch', 'eval', 'Function', 'globalThis', 'process', 'fs', 'localStorage', 'require']) expectHit(wordHits(VS, w).length >= 1, `cap:${w}`);
  expectHit((VS.replace(/\.document\b/g, '').match(/\bdocument\b/g) || []).length >= 1, 'cap:document (bare global reach)');
  for (const f of [/\.write\s*\(/, /\.set\s*\(/, /\.delete\s*\(/, /\.commit\s*\(/, /\.rollback\s*\(/, /\.register\s*\(/, /\.unregister\s*\(/, /\.insert\s*\(/, /\.remove\s*\(/, /\.update\s*\(/, /\.render\s*\(/, /\.invalidate\s*\(/]){
    expectHit(f.test(VS), `mutation:${f}`);
  }
  expectHit(/\bstores?\b/.test(VS), 'store vocabulary');
  expectHit(/\b(renderer|invalidate)\b/.test(VS), 'renderer vocabulary');
  expectHit((VS.match(/\bsetInterval\s*\(/g) || []).length >= 1, 'async:setInterval');
  expectHit((VS.match(/\bsetTimeout\s*\(/g) || []).length >= 1, 'async:setTimeout');
  expectHit((VS.match(/\bsetImmediate\s*\(/g) || []).length >= 1, 'async:setImmediate');
  expectHit((VS.match(/\bqueueMicrotask\s*\(/g) || []).length >= 1, 'async:queueMicrotask');
  expectHit((VS.match(/\baddEventListener\s*\(/g) || []).length >= 1, 'async:addEventListener');
  expectHit((VS.match(/\brequestAnimationFrame\s*\(/g) || []).length >= 1, 'async:requestAnimationFrame');
  expectHit((VS.match(/\bimport\s*\(/g) || []).length >= 1, 'async:import(');
  expectHit(/\bnew\s+Promise\b/.test(VS), 'async:new Promise');
  expectHit(/\bwhile\s*\(\s*true\b/.test(VS), 'unbounded:while(true)');
  expectHit((VS.match(/\bwhile\s*\(/g) || []).length >= 2, 'while-count control (>=2 in violating input)');
  expectHit(/\b(nested|nesting|DAG|dag)\b/.test(VS), 'nesting/DAG vocabulary');
  expectHit(/\bnew\s+(SceneGraph|HistoryManager|TransactionBuilder)\b/.test(VS), 'new substrate construction');
  // allowlist scans must fire on the out-of-contract receivers
  const allowProps = (text, word) => { const out = new Set(); const re = new RegExp(`\\b${word}\\s*\\.\\s*(\\w+)`, 'g'); let m; while ((m = re.exec(text)) !== null) out.add(m[1]); return [...out]; };
  expectHit(allowProps(VS, 'sceneGraph').includes('addObject'), 'allowlist: sceneGraph.addObject');
  expectHit(allowProps(VS, 'historyManager').includes('push'), 'allowlist: historyManager.push');
  expectHit(allowProps(VS, 'transactionManager').includes('rollbackAll'), 'allowlist: transactionManager.rollbackAll');
  expectHit(allowProps(VS, 'transactionBuilder').includes('reset'), 'allowlist: transactionBuilder.reset');
  expectHit(allowProps(VS, 'registry').includes('execute'), 'allowlist: registry.execute');
  expectHit(allowProps(VS, 'substrate').includes('transport'), 'allowlist: substrate.transport');
  expectHit(allowProps(VS, 'wc').includes('write'), 'allowlist: wc.write');
  const execRecv = new Set(); { const re = /\b(\w+)\s*\.\s*execute\s*\(/g; let m; while ((m = re.exec(VS)) !== null) execRecv.add(m[1]); }
  expectHit([...execRecv].some(r => !['tool', 'transactionManager'].includes(r)), 'execute-receiver violation (tx2)');
  const beginRecv = new Set(); { const re = /\b(\w+)\s*\.\s*begin\s*\(/g; let m; while ((m = re.exec(VS)) !== null) beginRecv.add(m[1]); }
  expectHit([...beginRecv].some(r => r !== 'transactionBuilder'), 'begin-receiver violation (b2)');
  const collRecv = new Set(); { const re = /\b(\w+)\s*\.\s*(?:set|delete)\s*\(/g; let m; while ((m = re.exec(VS)) !== null) collRecv.add(m[1]); }
  expectHit([...collRecv].some(r => !['seen', 'beforeByIdentity', 'afterByIdentity'].includes(r)), 'own-collection receiver violation (map/stranger outside the pinned local Maps)');
  // ALIAS-FORM CONTRAST: paren scans structurally MISS alias declarations.
  expectHit(!/\beval\s*\(/.test('const evalAlias = eval; void evalAlias;'), 'contrast: paren-scan misses eval alias');
  expectHit(!/\bnew\s+Function\b/.test('const fnAlias = Function; void fnAlias;'), 'contrast: paren-scan misses Function alias');
  expectHit(!/\bfetch\s*\(/.test('const fetchAlias = fetch; void fetchAlias;'), 'contrast: paren-scan misses fetch alias');
  // SANCTIONED negative controls: the clean-module forms must NOT fire.
  const N = [
    "const afterEvaluation = request.critic.evaluate(request.document, request.evaluationContext);",
    "if (request.document === undefined){ return; }",
    "const seen = new Map(); seen.set(fp, i);",
    "substrate.sceneGraph.findNodeByObjectId(oid);",
    "substrate.transactionManager.execute(transaction);",
    "substrate.transactionManager.undo();",
    "substrate.transactionManager.historyManager.getTransactionToUndo();",
    "substrate.transactionBuilder.begin({ id: 'atx-x' });",
    "const builder = substrate.transactionBuilder.begin({}); builder.addCommand(cmd); builder.build();",
    "substrate.registry.has('T05'); substrate.registry.get('T05'); substrate.registry.validate('T05', {}, {});",
    "const tool = substrate.registry.get(id); tool.validate(input, ctx); tool.execute(input, ctx);",
    "wc.setNode(n); wc.getObject(id); wc.getNodes();"
  ].join('\n');
  const NS = stripCommentsAndStrings(N);
  expectHit((NS.replace(/\.document\b/g, '').match(/\bdocument\b/g) || []).length === 0, 'NEGATIVE control: request.document must not fire the document scan');
  const negColl = new Set(); { const re = /\b(\w+)\s*\.\s*(?:set|delete)\s*\(/g; let m; while ((m = re.exec(NS)) !== null) negColl.add(m[1]); }
  expectHit([...negColl].every(r => ['seen'].includes(r)), 'NEGATIVE control: seen.set is the only own-collection receiver');
  expectHit(allowProps(NS, 'sceneGraph').every(p => p === 'findNodeByObjectId'), 'NEGATIVE control: sceneGraph read projection');
  expectHit(allowProps(NS, 'transactionManager').every(p => ['execute', 'undo', 'historyManager'].includes(p)), 'NEGATIVE control: transactionManager pipeline');
  expectHit(allowProps(NS, 'historyManager').every(p => p === 'getTransactionToUndo'), 'NEGATIVE control: historyManager read');
  expectHit(allowProps(NS, 'registry').every(p => ['has', 'get', 'validate'].includes(p)), 'NEGATIVE control: registry read+schema gate');
  expectHit(allowProps(NS, 'wc').every(p => ['setNode', 'getObject', 'getNodes'].includes(p)), 'NEGATIVE control: wc view calls');
  console.log(`(4) controls: ${ctl === 0 ? 'ALL FIRE / negative controls clean' : ctl + ' MISSES'}; alias-form contrast proven (paren scans blind, word scans see)`);
}

// ---- (5) src/core freeze manifest ---------------------------------------------
{
  const CORE_DIR = join(ROOT, 'src/core');
  const files = [];
  (function walk(dir){
    for (const e of readdirSync(dir, { withFileTypes: true })){
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(relative(ROOT, p).split('\\').join('/'));
    }
  })(CORE_DIR);
  files.sort();
  const bufManifest = files.map((f) => `${f}:${sha256(readFileSync(join(ROOT, f)))}`).join('\n');
  const strManifest = files.map((f) => `${f}:${sha256(readFileSync(join(ROOT, f), 'utf-8'))}`).join('\n');
  const aggBuf = sha256(bufManifest);
  const aggStr = sha256(strManifest);
  if (aggBuf !== aggStr) fail(`src/core manifest buffer-hash ${aggBuf} !== utf8-string-hash ${aggStr} (the 3.14-G pinned value came from the utf8-string form)`);
  if (files.length !== 178) fail(`src/core file count ${files.length} !== 178`);
  if (aggStr !== '137327739471ff095325854c296a82aa84afde0258b396ad6902b22de3e21e56') fail(`src/core aggregate ${aggStr} !== the frozen 3.14-G value`);
  const topEntries = readdirSync(CORE_DIR).sort();
  console.log(`(5) src/core manifest: ${files.length} files, aggregate sha256 = ${aggStr} (buffer==utf8 agreement), top-level entries: ${topEntries.length}`);
}

// ---- (6) package.json dependency fields ----------------------------------------
{
  const pkg = JSON.parse(read('package.json'));
  for (const f of ['dependencies','devDependencies','optionalDependencies','peerDependencies']){
    if (pkg[f] !== undefined) fail(`package.json .${f} is present: ${JSON.stringify(pkg[f])}`);
  }
  console.log('(6) package.json: no dependencies/devDependencies/optionalDependencies/peerDependencies fields');
}

// ---- (7) correction.js import contract: ZERO (the A-era pin) -------------------
// Import DECLARATIONS are detected on raw lines (^\s*import\b — a comment line
// starts with '//', never a declaration). Dynamic escapes (require( / import()
// are detected on the STRIPPED body — comment prose like "zero-import (pinned
// contract)" legitimately contains the words and is stripped before scanning.
{
  const decls = CORR_SRC.split('\n').filter(l => /^\s*import\b/.test(l));
  if (decls.length !== 0) fail(`correction.js import contract drift — found ${decls.length} import-declaration lines: ${JSON.stringify(decls)}`);
  const dyn = [...(CORR_S.match(/\brequire\s*\(/g) || []), ...(CORR_S.match(/\bimport\s*\(/g) || [])];
  if (dyn.length !== 0) fail(`correction.js dynamic module-escape in code body: ${JSON.stringify(dyn)}`);
  console.log('(7) correction.js import declarations: 0; dynamic module-escape calls in code body: 0 (the zero-import pin from Checkpoint A)');
}

console.log(ok ? '\nPROBE PASS — patterns safe to embed in tests/correction.test.mjs' : '\nPROBE FAIL — do not embed');
if (!ok) process.exit(1);
