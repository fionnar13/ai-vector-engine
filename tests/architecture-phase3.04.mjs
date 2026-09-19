
import fs from 'fs';
import path from 'path';

const forbidden = [
  {pattern: /from\s+['"].*renderer['"]/i, desc: 'Renderer import'},
  {pattern: /from\s+['"].*\/ai\//i, desc: 'AI import'},
  {pattern: /window\./, desc: 'window global'},
  {pattern: /document\./, desc: 'document global'},
  {pattern: /fetch\s*\(/, desc: 'fetch'},
  {pattern: /localStorage/, desc: 'localStorage'}
];

const files = [
  'src/core/scenegraph/types.ts',
  'src/core/scenegraph/sceneGraph.ts',
  'src/core/scenegraph/invariants.ts',
  'src/core/scenegraph/traversal.ts',
  'src/core/scenegraph/transform.ts',
  'src/core/scenegraph/spatialIndex.ts'
];

let failed=false;
for(const f of files){
  if(!fs.existsSync(f)) continue;
  const content=fs.readFileSync(f,'utf-8');
  for(const fb of forbidden){
    if(fb.pattern.test(content)){
      console.error(`✗ ${f} violates ${fb.desc}`);
      failed=true;
    }
  }
  // Check SceneGraph does not import SpatialIndex as dependency (should be opposite)
  if(f.includes('sceneGraph.ts') && content.includes('spatialIndex')){
    console.error(`✗ sceneGraph.ts should NOT import spatialIndex (dependency direction violated)`);
    failed=true;
  }
  console.log(`✓ ${f} architecture OK`);
}
if(failed) process.exit(1);
console.log('Architecture checks PASS for Phase 3.04');
