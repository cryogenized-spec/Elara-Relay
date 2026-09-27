import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { brotliCompressSync, constants } from 'node:zlib';
import { join } from 'node:path';
import process from 'node:process';

const bundlePath = 'test-results/visual-reference-evidence.txt';
const hash = (value) => createHash('sha256').update(value).digest('hex');
if (process.argv[2] === 'prepare') {
  if (!existsSync('test-results')) process.exit(0);
  const require = createRequire(import.meta.url);
  const { PNG } = require('../node_modules/playwright-core/lib/utilsBundle.js');
  const entries = [];
  const buffers = [];
  for (const project of ['chromium', 'mobile-9x16', 'android-portrait']) {
    for (const entry of readdirSync('test-results', { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.endsWith(`-${project}`)) continue;
      for (const name of readdirSync(join('test-results', entry.name))) {
        if (!/^repair-(workflow|waiting-form|final-test-form|ready-blocked)-actual\.png$/.test(name)) continue;
        const filename = name.replace('-actual.png', `-${project}-linux.png`);
        const original = readFileSync(join('e2e/repair-workflow.spec.ts-snapshots', filename));
        const actual = PNG.sync.read(readFileSync(join('test-results', entry.name, name)));
        entries.push({ filename, baselinePngSha256: hash(original), rgbaSha256: hash(actual.data), width: actual.width, height: actual.height, length: actual.data.length });
        buffers.push(actual.data);
      }
    }
  }
  const raw = Buffer.concat([Buffer.from(JSON.stringify(entries) + '\n'), ...buffers]);
  const compressed = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_LGWIN]: 24 } });
  const encoded = compressed.toString('base64');
  if (encoded.length > 6 * 39000) throw new Error('Rendering evidence exceeds transport limit');
  writeFileSync(bundlePath, encoded);
  console.log(`Prepared ${entries.length} PNG rasters (${encoded.length} encoded bytes), SHA-256 ${hash(compressed)}`);
} else if (existsSync(bundlePath)) {
  const part = Number(process.argv[2]);
  if (!Number.isInteger(part) || part < 0 || part > 5) throw new Error('Invalid evidence part');
  const encoded = readFileSync(bundlePath, 'utf8');
  for (let offset = part * 39000; offset < Math.min(encoded.length, (part + 1) * 39000); offset += 3900) {
    console.log(`::notice title=ELARA_VISUAL_BUNDLE-${offset}::${encoded.slice(offset, offset + 3900)}`);
  }
}
