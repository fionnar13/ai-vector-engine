// PHASE 3.14 — CHECKPOINT G scan-pattern probe (pre-embedding validation).
// Validates, against the CLEAN src-js/evaluation.js and src-js/critic.js:
//   (1) the comment/string stripper (reused verbatim from the 3.13 probe,
//       scripts/probe-3.13-checkpointG-scan.mjs) terminates, preserves code,
//       and strips comments/strings 1:1 on BOTH target modules;
//   (2) every §52/§60 scan returns ZERO matches on the clean modules (no
//       false positives — comments/strings stripped, word boundaries kept);
//   (3) positive controls (synthetic code-position violations, including the
//       ALIAS FORM the A-era paren scans cannot see) DO match;
//   (4) the src/core freeze manifest is computed (aggregate sha256 + file
//       count + top-level entries) for embedding into test G-9;
//   (5) package.json dependency fields are absent.
// Exit 0 = probe PASS (patterns safe to embed in tests/evaluation-critic.test.mjs).

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

// Verbatim copy of the 3.13 Checkpoint G stripper (scripts/probe-3.13-checkpointG-scan.mjs
// / tests/ai.test.mjs:1351). Inlined rather than imported: the 3.13 probe is a
// runnable validation script, not a pure module — importing it would execute
// its own ai.js validation block.
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

const EVAL_SRC = read('src-js/evaluation.js');
const CRITIC_SRC = read('src-js/critic.js');
const EVAL_S = stripCommentsAndStrings(EVAL_SRC);
const CRITIC_S = stripCommentsAndStrings(CRITIC_SRC);

let ok = true;
const fail = (m) => { console.error('PROBE FAIL: ' + m); ok = false; };

// ---- (1) stripper sanity on BOTH modules -----------------------------------
for (const [name, src, stripped] of [['evaluation.js', EVAL_SRC, EVAL_S], ['critic.js', CRITIC_SRC, CRITIC_S]]){
  if (stripped.length !== src.length) fail(`${name}: stripped length ${stripped.length} !== source length ${src.length}`);
  if (stripped.split('\n').length !== src.split('\n').length) fail(`${name}: line count not 1:1`);
  if (stripped.includes('/*') || stripped.includes('*/')) fail(`${name}: comment delimiters survived stripping`);
}
// code preserved (pinned tokens that MUST survive stripping)
for (const t of ['buildActualState','validateActualState','createDeviation','createEvaluationResult','evaluate','EVALUATION_TOLERANCES','rectBBox','bboxCenter','EvaluationErrorCodes']){
  if (!EVAL_S.includes(t)) fail(`evaluation.js stripped body lost code token '${t}'`);
}
for (const t of ['proposeCorrections','createCorrectionProposal','validateCorrectionProposal','evaluateAndCritique','CriticErrorCodes','validateEvaluationResult']){
  if (!CRITIC_S.includes(t)) fail(`critic.js stripped body lost code token '${t}'`);
}
// comments/strings stripped (REAL occurrences in the clean modules)
if (!EVAL_SRC.includes('EVALUATION DATA MODEL')) fail('evaluation.js: stripping control phrase absent from RAW source (control is stale)');
if (EVAL_S.includes('EVALUATION DATA MODEL')) fail('evaluation.js: comment text survived stripping');
if (!CRITIC_SRC.includes('no tool supports semantic mutation')) fail('critic.js: stripping control phrase absent from RAW source (control is stale)');
if (CRITIC_S.includes('no tool supports semantic mutation')) fail('critic.js: comment text survived stripping');
const rawToolWords = (CRITIC_SRC.match(/\btool\b/g) || []).length;
const strippedToolWords = (CRITIC_S.match(/\btool\b/g) || []).length;
if (rawToolWords < 2) fail(`critic.js: expected >=2 raw \\btool\\b comment occurrences, got ${rawToolWords}`);
if (strippedToolWords !== 0) fail(`critic.js: \\btool\\b survives in stripped body (${strippedToolWords})`);
console.log(`(1) stripper: 1:1 on both modules, code preserved, comments/strings stripped (raw \\btool\\b in critic.js: ${rawToolWords}, stripped: ${strippedToolWords})`);

// ---- (2) clean-module scans: ZERO matches -----------------------------------
// Capability words (§52/§60 forbidden surfaces; bare-word form = alias-aware).
const CAP_WORDS = ['window', 'document', 'fetch', 'eval', 'Function', 'globalThis', 'process', 'fs', 'localStorage', 'require'];
const wordHits = (text, w) => text.match(new RegExp(`\\b${w}\\b`, 'g')) || [];
// Dynamic-code / module-escape call forms. NOTE: `import(` is call-form-only
// BY NECESSITY — bare `import` is declaration syntax (pinned by the import
// contract) and the keyword cannot be aliased (SyntaxError); `node:` occurs
// only inside specifier strings, which are stripped — it is scanned at the
// import-contract level (raw import lines), not in the code body.
const CALL_FORMS = [[/\bimport\s*\(/g, 'import(']];
// Substrate mutation-method surface (§52: Store.write, .set, .delete,
// Transaction.execute, Tool.execute, History.write + disclosed full
// vocabulary; `.set` split from `.setX` so `.settle(` can never match).
const MUT1 = /\.(write|set|execute|commit|rollback|register|unregister|insert|remove|update|delete|create|render|invalidate)\s*\(/g;
const MUT2 = /\.set[A-Z]\w*\s*\(/g;
// Tool/transaction execution surface (§52/§60; bare execute/commit words are
// alias-form-aware and subsume the .execute(/.commit( call forms).
const TOOL_WORDS = ['toolRegistry', 'ToolRegistry', 'TransactionExecutor', 'TransactionBuilder', 'DSLExecutor', 'createCoreToolRegistry', 'ToolContext', 'execute', 'commit'];

for (const [name, stripped] of [['evaluation.js', EVAL_S], ['critic.js', CRITIC_S]]){
  for (const w of CAP_WORDS){
    const h = wordHits(stripped, w);
    if (h.length) fail(`${name}: clean body matches \\b${w}\\b — ${JSON.stringify(h)}`);
  }
  for (const [re, id] of CALL_FORMS){
    const h = stripped.match(re) || [];
    if (h.length) fail(`${name}: clean body matches ${id} — ${JSON.stringify(h)}`);
  }
  for (const [re, id] of [[MUT1, 'MUT1'], [MUT2, 'MUT2']]){
    const h = stripped.match(new RegExp(re.source, 'g')) || [];
    if (h.length) fail(`${name}: clean body matches mutation surface ${id} — ${JSON.stringify(h)}`);
  }
  for (const w of TOOL_WORDS){
    const h = wordHits(stripped, w);
    if (h.length) fail(`${name}: clean body matches tool-surface \\b${w}\\b — ${JSON.stringify(h)}`);
  }
}
console.log('(2) clean modules: ZERO matches for all capability words, call forms, mutation surface, tool surface (both modules)');

// ---- (3) positive controls (synthetic code-position violations) --------------
let ctl = 0;
const expectHit = (cond, id) => { if (!cond){ console.error(`CONTROL MISS [${id}]`); ctl++; ok = false; } };
const V = [
  "import fs from 'node:fs';",
  "import x from 'left-pad';",
  "window.alert(1);",
  "document.createElement('div');",
  "fetch('http://x');",
  "eval('1');",
  "const evalAlias = eval; void evalAlias;",
  "const fnAlias = Function; void fnAlias;",
  "const fetchAlias = fetch; void fetchAlias;",
  "new Function('return 1');",
  "require('path');",
  "const reqAlias = require; void reqAlias;",
  "import('x');",
  "globalThis.x = 1;",
  "process.exit(1);",
  "localStorage.setItem('k', 'v');",
  "store.write({});",
  "map.set(k, v);",
  "map.delete(k);",
  "tx.execute(step);",
  "tx.commit();",
  "registry.register(tool);",
  "idx.insert(id, bbox);",
  "obj.remove(id);",
  "obj.update(id, p);",
  "store.create(t);",
  "renderer.render(tree);",
  "tx.rollback();",
  "sg.setLocalTransform(id, m);",
  "const tr = toolRegistry; void tr;",
  "const TR = ToolRegistry; void TR;",
  "const te = TransactionExecutor; void te;",
  "const tb = TransactionBuilder; void tb;",
  "const de = DSLExecutor; void de;",
  "const tc = ToolContext; void tc;",
  "createCoreToolRegistry();",
  "const ex = registry.execute; void ex;"
].join('\n');
const VS = stripCommentsAndStrings(V);
for (const w of CAP_WORDS) expectHit(wordHits(VS, w).length >= 1, `cap:${w}`);
expectHit((VS.match(/\bimport\s*\(/g) || []).length === 1, 'call:import(');
for (const w of TOOL_WORDS) expectHit(wordHits(VS, w).length >= 1, `tool:${w}`);
const mutIds = ((VS.match(new RegExp(MUT1.source, 'g')) || []).concat(VS.match(new RegExp(MUT2.source, 'g')) || []));
expectHit(mutIds.length >= 13, `mutation controls (got ${mutIds.length}): ${JSON.stringify(mutIds)}`);
// ALIAS-FORM CONTRAST: the A-era paren scans structurally MISS the alias
// declarations that the G word-boundary scans above caught.
expectHit(!/\beval\s*\(/.test('const evalAlias = eval; void evalAlias;'), 'contrast: paren-scan misses eval alias');
expectHit(!/\bnew\s+Function\b/.test('const fnAlias = Function; void fnAlias;'), 'contrast: paren-scan misses Function alias');
expectHit(!/\bfetch\s*\(/.test('const fetchAlias = fetch; void fetchAlias;'), 'contrast: paren-scan misses fetch alias');
console.log(`(3) positive controls: ${ctl === 0 ? 'ALL FIRE' : ctl + ' MISSES'} (mutation-method control calls: ${mutIds.length}); alias-form contrast proven (paren scans blind, word scans see)`);

// ---- import-line collection on RAW sources (3.13 verbatim helpers) ----------
function collectImportLines(src){
  return src.split('\n').filter(l => /^\s*import\b/.test(l) || /\brequire\s*\(/.test(l) || /\bimport\s*\(/.test(l));
}
function importSpecifiers(lines){
  const specs = [];
  for (const line of lines){
    const m = line.match(/from\s*['"]([^'"]+)['"]/) || line.match(/import\s+['"]([^'"]+)['"]/);
    if (m) specs.push(m[1]);
  }
  return specs;
}
const evalSpecs = importSpecifiers(collectImportLines(EVAL_SRC));
const criticSpecs = importSpecifiers(collectImportLines(CRITIC_SRC));
if (JSON.stringify([...evalSpecs].sort()) !== JSON.stringify(['./bbox.js','./geometry.js'])) fail(`evaluation.js specifier contract drifted: ${JSON.stringify(evalSpecs)}`);
if (JSON.stringify(criticSpecs) !== JSON.stringify(['./evaluation.js'])) fail(`critic.js specifier contract drifted: ${JSON.stringify(criticSpecs)}`);
console.log(`(4) import contracts: evaluation.js ${JSON.stringify(evalSpecs)}, critic.js ${JSON.stringify(criticSpecs)}`);

// ---- (5) src/core freeze manifest -------------------------------------------
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
const manifest = files.map((f) => `${f}:${sha256(readFileSync(join(ROOT, f)))}`).join('\n');
const aggregate = sha256(manifest);
const topEntries = readdirSync(CORE_DIR).sort();
console.log(`(5) src/core manifest: ${files.length} files, aggregate sha256 = ${aggregate}`);
console.log(`    top-level entries: ${JSON.stringify(topEntries)}`);

// ---- (6) package.json dependency fields --------------------------------------
const pkg = JSON.parse(read('package.json'));
for (const f of ['dependencies','devDependencies','optionalDependencies','peerDependencies']){
  if (pkg[f] !== undefined) fail(`package.json .${f} is present: ${JSON.stringify(pkg[f])}`);
}
console.log('(6) package.json: no dependencies/devDependencies/optionalDependencies/peerDependencies fields');

console.log(ok ? '\nPROBE PASS — patterns safe to embed in tests/evaluation-critic.test.mjs' : '\nPROBE FAIL — do not embed');
if (!ok) process.exit(1);
