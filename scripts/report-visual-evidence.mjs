import { readFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import process from 'node:process';

const project = process.argv[2];
if (!['chromium', 'mobile-9x16', 'android-portrait'].includes(project)) throw new Error('Unknown project');
const summary = process.env.GITHUB_STEP_SUMMARY;
if (!summary || !existsSync('test-results')) process.exit(0);
const records = [];
for (const entry of readdirSync('test-results', { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.endsWith(`-${project}`)) continue;
  for (const name of readdirSync(join('test-results', entry.name))) {
    if (!/^repair-(workflow|waiting-form|final-test-form|ready-blocked)-actual\.png$/.test(name)) continue;
    const filename = name.replace('-actual.png', `-${project}-linux.png`);
    const original = readFileSync(join('e2e/repair-workflow.spec.ts-snapshots', filename));
    const actual = readFileSync(join('test-results', entry.name, name));
    records.push({ filename,
      baselinePngSha256: createHash('sha256').update(original).digest('hex'),
      actualPngSha256: createHash('sha256').update(actual).digest('hex'),
      actualPngBase64: actual.toString('base64'),
    });
  }
}
const markdown = `## Screenshot evidence — ${project}\n\nLossless CI PNG evidence for human review; no assertion is bypassed.\n\n\`\`\`json\n${JSON.stringify(records)}\n\`\`\`\n`;
if (Buffer.byteLength(markdown) > 1000000) throw new Error('Evidence exceeds summary limit');
appendFileSync(summary, markdown);
console.log(`Published ${records.length} screenshot evidence records (${Buffer.byteLength(markdown)} bytes).`);
