// PHASE 3.13 — CHECKPOINT G scan-pattern probe (pre-embedding validation).
// Validates, against the CLEAN src-js/ai.js:
//   (1) the comment/string stripper terminates and preserves code;
//   (2) every §41-G scan returns ZERO matches on the clean module (no false
//       positives — comments/strings stripped, word boundaries respected);
//   (3) positive controls (synthetic code-position violations) DO match.
// Exit 0 = probe PASS (patterns safe to embed in tests/ai.test.mjs).

import { readFileSync } from 'node:fs';

export function stripCommentsAndStrings(src){
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

// ---- scan definitions (the exact set the G tests will assert) ---------------

export const G_IMPORT_CONTRACT = {
  expectedSubstrateImports: ['./tools.js']
};

export const G_CODE_PATTERNS = [
  { id: 'fs-node',            re: /\bfs\b/,                                              label: 'Planner -> fs (FORBIDDEN)' },
  { id: 'window',             re: /\bwindow\b/,                                          label: 'Planner -> window (FORBIDDEN)' },
  { id: 'document',           re: /\bdocument\b/,                                        label: 'Planner -> document (FORBIDDEN)' },
  { id: 'fetch-network',      re: /\bfetch\s*\(/,                                        label: 'Planner -> fetch (FORBIDDEN)' },
  { id: 'eval',               re: /\beval\b/,                                            label: 'Planner -> eval (FORBIDDEN)' },
  { id: 'Function-ctor',      re: /\bFunction\b/,                                        label: 'Planner -> Function constructor (FORBIDDEN)' },
  { id: 'require',            re: /\brequire\s*\(/,                                      label: 'Planner -> require( (FORBIDDEN)' },
  { id: 'dynamic-import',     re: /\bimport\s*\(/,                                       label: 'Planner -> dynamic import( (FORBIDDEN)' },
  { id: 'globalThis',         re: /\bglobalThis\b/,                                      label: 'Planner -> globalThis escape hatch (FORBIDDEN)' },
  { id: 'process',            re: /\bprocess\b/,                                         label: 'Planner -> process (Node env; FORBIDDEN)' }
];

export const G_MUTATION_METHODS = /\.(write|execute|register|unregister|invalidate|invalidateAll|insert|remove|update|delete|create|render|commit|rollback)\s*\(/;

function collectImportLines(src){
  return src.split('\n').filter(l => /^\s*import\b/.test(l) || /\brequire\s*\(/.test(l) || /\bimport\s*\(/.test(l));
}
function importSpecifiers(importLines){
  const specs = [];
  for (const line of importLines){
    const m = line.match(/from\s*['"]([^'"]+)['"]/) || line.match(/import\s+['"]([^'"]+)['"]/);
    if (m) specs.push(m[1]);
  }
  return specs;
}

// ---- run probe ---------------------------------------------------------------

const src = readFileSync(new URL('../src-js/ai.js', import.meta.url), 'utf-8');
const stripped = stripCommentsAndStrings(src);
let ok = true;

// (1) stripper sanity
if (!stripped.includes('createCoreToolRegistry')){ console.error('FAIL stripper: code lost'); ok = false; }
if (!stripped.includes('deepFreeze')){ console.error('FAIL stripper: code lost'); ok = false; }
if (stripped.includes('EXISTING document objects')){ console.error('FAIL stripper: comment survived'); ok = false; }
if (stripped.includes('document-object references')){ console.error('FAIL stripper: string literal survived'); ok = false; }
if (stripped.split('\n').length !== src.split('\n').length){ console.error('FAIL stripper: line count drift'); ok = false; }
console.log(`stripper sanity: ${ok ? 'OK' : 'BROKEN'} (stripped ${src.length} -> ${stripped.length} chars, ${src.split('\n').length} lines preserved)`);

// (2) clean-source scans — expect ZERO matches
const clean = { failures: 0 };
for (const p of G_CODE_PATTERNS){
  const m = stripped.match(new RegExp(p.re.source, 'g'));
  if (m){ console.error(`FALSE POSITIVE [${p.id}] ${p.label}: ${JSON.stringify(m)}`); clean.failures++; }
}
const mutHits = stripped.match(new RegExp(G_MUTATION_METHODS.source, 'g'));
if (mutHits){ console.error(`FALSE POSITIVE [mutation-methods]: ${JSON.stringify(mutHits)}`); clean.failures++; }
const specs = importSpecifiers(collectImportLines(src));
const badSpecs = specs.filter(s => !(s.startsWith('./') || s.startsWith('../')));
if (badSpecs.length){ console.error(`FALSE POSITIVE [imports] non-relative: ${JSON.stringify(badSpecs)}`); clean.failures++; }
const unexpected = specs.filter(s => !G_IMPORT_CONTRACT.expectedSubstrateImports.includes(s));
if (unexpected.length){ console.error(`FALSE POSITIVE [imports] outside contract: ${JSON.stringify(unexpected)}`); clean.failures++; }
console.log(`clean-source scans: ${clean.failures === 0 ? 'ALL ZERO (no false positives)' : clean.failures + ' FALSE POSITIVES'}`);
if (clean.failures > 0) ok = false;
console.log(`import contract on clean ai.js: ${JSON.stringify(specs)}`);

// (3) positive controls — synthetic violations MUST match
const V = stripCommentsAndStrings([
  "import fs from 'node:fs';",
  "const a = window.location;",
  "const b = document.title;",
  "fetch('http://x');",
  "eval('1');",
  "const f = new Function('return 1');",
  "require('path');",
  "import('x');",
  "globalThis.x = 1;",
  "process.exit(1);",
  "store.write({});",
  "tx.execute(step);",
  "registry.register(tool);",
  "idx.insert(id, bbox);",
  "renderer.render(tree);",
  "tx.commit();",
  "const keep = createCoreToolRegistry();"
].join('\n'));
let ctl = 0;
for (const p of G_CODE_PATTERNS){
  if (!p.re.test(V)){ console.error(`CONTROL MISS [${p.id}]`); ctl++; ok = false; }
}
const ctlMut = (V.match(new RegExp(G_MUTATION_METHODS.source, 'g')) || []).length;
if (ctlMut !== 6){ console.error(`CONTROL MISS [mutation-methods]: expected 6 distinct control calls, got ${ctlMut}`); ctl++; ok = false; }
console.log(`positive controls: ${ctl === 0 ? `ALL FIRE (mutation-method calls: ${ctlMut})` : ctl + ' MISSES'}`);

console.log(ok ? '\nPROBE PASS — patterns safe to embed' : '\nPROBE FAIL — do not embed');
if (!ok) process.exit(1);
