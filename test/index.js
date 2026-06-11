// ============================================================================
// BlitzProxy — Test Runner
// Runs all test suites: node test/index.js
// ============================================================================

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const suites = [
  'translator.test.js',
  'stream.test.js',
];

let overallFailed = 0;

for (const suite of suites) {
  const result = spawnSync(process.execPath, [join(__dirname, suite)], {
    stdio: 'inherit',
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (result.status !== 0) overallFailed++;
}

if (overallFailed > 0) {
  console.error(`\n${overallFailed} suite(s) failed.\n`);
  process.exit(1);
} else {
  console.log('\nAll test suites passed.\n');
}
