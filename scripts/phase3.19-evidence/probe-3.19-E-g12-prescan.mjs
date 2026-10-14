// PHASE 3.19 Checkpoint E — G-12 pre-embedding recon probe (NOT a test; evidence helper).
// Predicts whether the alias-form scan will be GREEN on the 15 geometry files.
// Stripper: verbatim 3.13 copy (tests/ai.test.mjs:1351 / tests/evaluation-critic.test.mjs:2048).
import { readFileSync } from 'fs';

const geometryFiles = [
  'src/core/geometry/types.ts',
  'src/core/geometry/rect.ts',
  'src/core/geometry/ellipse.ts',
  'src/core/geometry/polygon.ts',
  'src/core/geometry/star.ts',
  'src/core/geometry/line.ts',
  'src/core/geometry/bezier.ts',
  'src/core/geometry/contour.ts',
  'src/core/geometry/path.ts',
  'src/core/geometry/bbox.ts',
  'src/core/geometry/flatten.ts',
  'src/core/geometry/validation.ts',
  'src/core/geometry/conversion.ts',
  'src/core/geometry/detection.ts',
  'src/core/geometry/transform.ts'
];

function stripCommentsAndStrings(src){
  let out = '';
  let mode = 'code';
  const frames = [];
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
    if (c === '\\'){ out += '  '; i += 2; continue; }
    if (mode === 'squote' && c === "'"){ mode = 'code'; out += ' '; i += 1; continue; }
    if (mode === 'dquote' && c === '"'){ mode = 'code'; out += ' '; i += 1; continue; }
    if (mode === 'template'){
      if (c === '`'){ mode = 'code'; out += ' '; i += 1; continue; }
      if (c === '$' && d === '{'){ frames.push({ braceDepth: 0 }); mode = 'code'; out += '  '; i += 2; continue; }
      out += (c === '\n' ? '\n' : ' '); i += 1; continue;
    }
    out += (c === '\n' ? '\n' : ' '); i += 1;
  }
  return out;
}

const CAP_WORDS = ['fs','fetch','window','document','eval','Function','process','globalThis','require','localStorage'];
function wordHits(stripped, word){
  const re = new RegExp(`\\b${word}\\b`, 'g');
  const hits = [];
  let m;
  while ((m = re.exec(stripped)) !== null) hits.push(m.index);
  return hits;
}

let strippedDirty = false;
for (const f of geometryFiles){
  const raw = readFileSync(new URL('../../' + f, import.meta.url), 'utf-8'); // probe lives in scripts/phase3.19-evidence/ (one level deeper than tests/)
  const stripped = stripCommentsAndStrings(raw);
  const lineDelta = stripped.split('\n').length - raw.split('\n').length;
  const charDelta = stripped.length - raw.length;
  const rawHits = [];
  for (const w of CAP_WORDS) if (wordHits(raw, w).length) rawHits.push(`${w}(${wordHits(raw, w).length})`);
  if (/\bnode:[a-z]+/.test(raw)) rawHits.push('node:*');
  if (/\bimport\s*\(/.test(raw)) rawHits.push('import(');
  if (/\bDate\.now\b/.test(raw)) rawHits.push('Date.now');
  if (/\bMath\.random\b/.test(raw)) rawHits.push('Math.random');
  const stHits = [];
  for (const w of CAP_WORDS) if (wordHits(stripped, w).length) stHits.push(`${w}(${wordHits(stripped, w).length})`);
  if (/\bnode:[a-z]+/.test(stripped)) stHits.push('node:*');
  if (/\bimport\s*\(/.test(stripped)) stHits.push('import(');
  if (/\bDate\.now\b/.test(stripped)) stHits.push('Date.now');
  if (/\bMath\.random\b/.test(stripped)) stHits.push('Math.random');
  if (stHits.length) strippedDirty = true;
  console.log(`${f}  charΔ=${charDelta} lineΔ=${lineDelta}  rawHits=[${rawHits.join(' ')}]  strippedHits=[${stHits.join(' ')}]`);
}
console.log(strippedDirty ? 'PREDICTION: scan would FAIL (real stripped-body hits)' : 'PREDICTION: scan GREEN (zero stripped-body hits across all 15)');
