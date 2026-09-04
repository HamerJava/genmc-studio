import { atlas, type Model } from './atlas';
import type { Skin } from './engine';

export type AgentVisual = {
  id: number;
  label: string;
  regions: string[];
  pixels: number[];
  startedAt: number;
  phase: 'reading' | 'working' | 'done' | 'error';
  before?: string[];
  revision?: number;
};
export const visualDuration = 3200;
export const agentScanPeriod = 750;
export function regionLabel(ids: string[]) {
  const names = [...new Set(ids.map((id) => id.split('.')[0]))].map(
    (part) =>
      ({
        head: 'Head',
        body: 'Chest',
        left_arm: 'Left arm',
        right_arm: 'Right arm',
        left_leg: 'Left leg',
        right_leg: 'Right leg',
      })[part] ?? part,
  );
  return names.length ? names.join(' · ') : 'Whole skin';
}
export function visualTargets(
  model: Model,
  input: {
    region?: string;
    operations?: {
      region?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      type?: string;
    }[];
  },
) {
  const regions = atlas(model);
  const selected = new Set<number>();
  for (const op of input.operations ?? [input]) {
    const r = regions.find((r) => r.id === op.region);
    if (r) {
      for (let y = 0; y < r.height; y++)
        for (let x = 0; x < r.width; x++)
          selected.add((r.y + y) * 64 + r.x + x);
    } else if (
      'x' in op &&
      typeof op.x === 'number' &&
      typeof op.y === 'number'
    ) {
      for (let y = op.y; y < Math.min(64, op.y + (op.height ?? 1)); y++)
        for (let x = op.x; x < Math.min(64, op.x + (op.width ?? 1)); x++)
          selected.add(y * 64 + x);
    }
  }
  if (!selected.size)
    for (const r of regions)
      for (let y = 0; y < r.height; y++)
        for (let x = 0; x < r.width; x++)
          selected.add((r.y + y) * 64 + r.x + x);
  return {
    pixels: [...selected],
    regions: regions
      .filter((r) =>
        [...selected].some(
          (i) =>
            i % 64 >= r.x &&
            i % 64 < r.x + r.width &&
            Math.floor(i / 64) >= r.y &&
            Math.floor(i / 64) < r.y + r.height,
        ),
      )
      .map((r) => r.id),
  };
}
/** Presentation only: the saved skin always contains the final pixels. */
export function drawAgentFrame(
  texture: HTMLCanvasElement,
  glow: HTMLCanvasElement,
  skin: Skin,
  visual: AgentVisual | undefined,
  now: number,
  reduced: boolean,
  worldScan = false,
) {
  const ctx = texture.getContext('2d')!;
  const fx = glow.getContext('2d')!;
  fx.clearRect(0, 0, 64, 64);
  const elapsed = visual ? now - visual.startedAt : visualDuration;
  const changing =
    visual?.phase === 'done' &&
    visual.before &&
    visual.revision === skin.revision;
  const progress = Math.min(1, elapsed / visualDuration);
  for (let i = 0; i < skin.pixels.length; i++) {
    const x = i % 64,
      y = Math.floor(i / 64);
    ctx.clearRect(x, y, 1, 1);
    ctx.fillStyle = skin.pixels[i];
    ctx.fillRect(x, y, 1, 1);
  }
  if (!visual || visual.phase === 'error') return;
  for (const i of visual.pixels) {
    const x = i % 64,
      y = Math.floor(i / 64);
    // A deterministic diagonal wave, with a small pixel stagger.
    const delay = ((x + y) / 126) * 0.4 + ((i * 13) % 17) / 170;
    const p = reduced ? 1 : Math.max(0, Math.min(1, (progress - delay) / 0.45));
    if (changing && p < 1) {
      ctx.clearRect(x, y, 1, 1);
      const old = visual.before![i];
      const next = skin.pixels[i];
      const rgba = [1, 3, 5, 7].map((offset) => {
        const a = parseInt(old.slice(offset, offset + 2) || 'ff', 16);
        const b = parseInt(next.slice(offset, offset + 2) || 'ff', 16);
        return Math.round(a + (b - a) * p)
          .toString(16)
          .padStart(2, '0');
      });
      ctx.fillStyle = '#' + rgba.join('');
      ctx.fillRect(x, y, 1, 1);
    }
    let alpha = 0;
    if (visual.phase === 'done' && changing)
      alpha = reduced ? 0.18 : Math.sin(p * Math.PI) * 0.75;
    else {
      const beam = ((elapsed / agentScanPeriod) % 1) * 80 - 8;
      alpha = reduced
        ? 0.2
        : 0.08 + Math.max(0, 1 - Math.abs(y - beam) / 6) * 0.65;
    }
    fx.fillStyle = `rgba(125,211,252,${worldScan ? 0.85 : alpha})`;
    fx.fillRect(x, y, 1, 1);
  }
}
