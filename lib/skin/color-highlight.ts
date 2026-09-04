import { atlas } from './atlas';
import type { Skin } from './engine';

export function colorPixels(skin: Skin, color: string): number[] {
  const rgb = color.slice(0, 7).toLowerCase();
  const found: number[] = [];
  for (const r of atlas(skin.model))
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++) {
        const i = y * 64 + x,
          pixel = skin.pixels[i].toLowerCase();
        if (
          pixel.slice(0, 7) === rgb &&
          (pixel.length === 7 || pixel.slice(7) !== '00')
        )
          found.push(i);
      }
  return found;
}

// The same preview-only contour is drawn on both the UV canvas and 3D hints.
export function drawColorHighlights(
  ctx: CanvasRenderingContext2D,
  pixels: number[],
) {
  if (!pixels.length) return;
  const matches = new Set(pixels),
    size = 12;
  ctx.save();
  ctx.fillStyle = 'rgba(64,212,182,.16)';
  ctx.beginPath();
  for (const i of pixels) {
    const x = i % 64,
      y = Math.floor(i / 64),
      l = x * size,
      t = y * size;
    ctx.fillRect(l, t, size, size);
    if (!x || !matches.has(i - 1)) {
      ctx.moveTo(l + 1, t + 1);
      ctx.lineTo(l + 1, t + size - 1);
    }
    if (x === 63 || !matches.has(i + 1)) {
      ctx.moveTo(l + size - 1, t + 1);
      ctx.lineTo(l + size - 1, t + size - 1);
    }
    if (!y || !matches.has(i - 64)) {
      ctx.moveTo(l + 1, t + 1);
      ctx.lineTo(l + size - 1, t + 1);
    }
    if (y === 63 || !matches.has(i + 64)) {
      ctx.moveTo(l + 1, t + size - 1);
      ctx.lineTo(l + size - 1, t + size - 1);
    }
  }
  ctx.strokeStyle = 'rgba(24,68,62,.9)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(210,255,242,1)';
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.restore();
}
