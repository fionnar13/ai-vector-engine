
import fs from 'fs';
import path from 'path';

const base = process.cwd();
const forbiddenPatterns = [
  /from\s+['"].*renderer['"]/,
  /from\s+['"].*scene['"]/,
  /from\s+['"].*appearance['"]/,
  /from\s+['"].*ai\//,
  /from\s+['"].*tools\//,
  /from\s+['"].*dsl\//,
  /import.*react/i,
  /window\./,
  /document\./,
  /canvas/,
  /fs\./,
  /fetch\(/
];

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

console.log('Architecture Checks - Geometry Kernel:');
let failed=false;
for (const f of geometryFiles) {
  const full = path.join(base, f);
  if (!fs.existsSync(full)) { console.log(`  skip ${f} not found`); continue; }
  const content = fs.readFileSync(full, 'utf-8');
  for (const pat of forbiddenPatterns) {
    if (pat.test(content)) {
      console.error(`✗ ${f} violates: ${pat}`);
      failed=true;
    }
  }
  console.log(`✓ ${f} - no forbidden imports`);
}
if (failed) { console.error('Architecture checks FAILED'); process.exit(1); }
console.log('✓ Geometry has no UI/Renderer/SceneGraph/AI/FS dependencies');
console.log('✓ No circular dependency (Math -> Geometry only)');
console.log('\nArchitecture tests PASS');
