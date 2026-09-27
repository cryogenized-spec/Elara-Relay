import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

// Lossless rendering evidence for environments that cannot download CI's
// artifact storage. The original screenshot assertion still fails the test.
export async function reportVisualDifference(page: Page, info: TestInfo, name: string) {
  const baseline = await readFile(info.snapshotPath(name));
  const actual = await readFile(info.outputPath(name.replace(/\.png$/, '-actual.png')));
  const evidence = await page.evaluate(async ({ expected, actual }) => {
    const load = async (encoded: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('Canvas unavailable');
      context.drawImage(image, 0, 0);
      return { width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
    };
    const left = await load(expected);
    const right = await load(actual);
    if (left.width !== right.width || left.height !== right.height) throw new Error('Screenshot dimensions differ');
    const xor = new Uint8Array(right.data.length);
    for (let i = 0; i < xor.length; i++) xor[i] = (left.data[i] ?? 0) ^ (right.data[i] ?? 0);
    const compressed = new Uint8Array(await new Response(new Blob([xor]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    const hash = await crypto.subtle.digest('SHA-256', right.data);
    return {
      width: right.width, height: right.height,
      rgbaSha256: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(''),
      xorZlibBase64: btoa(Array.from(compressed, (byte) => String.fromCharCode(byte)).join('')),
    };
  }, { expected: baseline.toString('base64'), actual: actual.toString('base64') });
  const payload = JSON.stringify({
    project: info.project.name, name,
    baselinePngSha256: createHash('sha256').update(baseline).digest('hex'),
    ...evidence,
  });
  // Check annotations are accessible through the GitHub API even when artifact
  // storage is unreachable. Chunk beneath GitHub's annotation message limit.
  for (let offset = 0; offset < payload.length; offset += 45000) {
    console.log(`::notice title=ELARA_VISUAL_EVIDENCE-${info.project.name}-${name}-${offset}::${payload.slice(offset, offset + 45000)}`);
  }
}
