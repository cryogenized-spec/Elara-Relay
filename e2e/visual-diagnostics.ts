import { readFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

// Report rendering differences without relaxing the screenshot assertion.
export async function reportVisualDifference(page: Page, info: TestInfo, name: string) {
  const expected = (await readFile(info.snapshotPath(name))).toString('base64');
  const actual = (await page.screenshot()).toString('base64');
  const bands = await page.evaluate(async ({ expected, actual }) => {
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
      return { canvas, context, pixels: context.getImageData(0, 0, image.width, image.height).data };
    };
    const left = await load(expected);
    const right = await load(actual);
    if (left.canvas.width !== right.canvas.width || left.canvas.height !== right.canvas.height) return { sizes: [left.canvas.width, left.canvas.height, right.canvas.width, right.canvas.height] };
    const result: { x: number; y: number; right: number; bottom: number; pixels: number }[] = [];
    for (let y = 0; y < left.canvas.height; y++) {
      let min = left.canvas.width;
      let max = -1;
      let count = 0;
      for (let x = 0; x < left.canvas.width; x++) {
        const offset = (y * left.canvas.width + x) * 4;
        if ([0, 1, 2].some((channel) => Math.abs((left.pixels[offset + channel] ?? 0) - (right.pixels[offset + channel] ?? 0)) > 32)) {
          min = Math.min(min, x); max = Math.max(max, x); count++;
        }
      }
      if (count === 0) continue;
      const previous = result.at(-1);
      if (previous !== undefined && previous.bottom === y - 1) {
        previous.x = Math.min(previous.x, min); previous.right = Math.max(previous.right, max); previous.bottom = y; previous.pixels += count;
      } else result.push({ x: min, y, right: max, bottom: y, pixels: count });
    }
    return result.map((band) => {
      const crop = document.createElement('canvas');
      crop.width = band.right - band.x + 5;
      crop.height = band.bottom - band.y + 5;
      const context = crop.getContext('2d');
      const capture = (canvas: HTMLCanvasElement) => {
        context?.drawImage(canvas, band.x - 2, band.y - 2, crop.width, crop.height, 0, 0, crop.width, crop.height);
        return crop.toDataURL();
      };
      return { ...band, expected: capture(left.canvas), actual: capture(right.canvas) };
    });
  }, { expected, actual });
  console.log('VISUAL_DIAGNOSTICS', info.project.name, name, JSON.stringify(bands));
}
