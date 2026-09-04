import { atlas } from './atlas';
import type { Skin } from './engine';

// Count only mapped, visible texels. Unused UV space and transparent pixels
// cannot become paint presets; every returned color exists in the skin.
export function skinPalette(skin: Skin, limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const r of atlas(skin.model)) {
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++) {
        const rgba = skin.pixels[y * 64 + x];
        const alpha = rgba.length === 9 ? parseInt(rgba.slice(7), 16) / 255 : 1;
        if (!alpha) continue;
        const rgb = rgba.slice(0, 7).toLowerCase();
        counts.set(rgb, (counts.get(rgb) ?? 0) + alpha);
      }
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([color]) => color);
}
