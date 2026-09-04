import { atlas, regionAt, type Model, type Part, type Layer } from './atlas';
export type Pose = 'stand' | 'walk';
export type Skin = {
  pixels: string[];
  model: Model;
  name: string;
  revision: number;
  sourceId?: string;
};
export type Operation = {
  type: 'pixel' | 'rectangle' | 'fill' | 'replace';
  region?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color: string;
  from?: string;
};
export const palettes = [
  ['#34473f', '#71826c', '#c6d2a8', '#e1b892', '#302f2b'],
  ['#252b44', '#536a9a', '#b7c8f1', '#e9bd9f', '#df8758'],
  ['#5b3245', '#a55774', '#e4a1a5', '#ebc6a6', '#32293d'],
];
export function makeSkin(index = 0): Skin {
  const p = palettes[index % palettes.length];
  const pixels = Array(4096).fill('#00000000');
  for (const r of atlas('classic')) {
    if (r.layer === 'overlay') continue;
    for (let y = 0; y < r.height; y++)
      for (let x = 0; x < r.width; x++) {
        let c = r.part === 'head' ? p[3] : r.part.includes('leg') ? p[0] : p[1];
        if (
          r.part === 'head' &&
          (y < 2 || r.face === 'back' || r.face === 'top')
        )
          c = p[4];
        if (
          r.part === 'head' &&
          r.face === 'front' &&
          y === 4 &&
          (x === 2 || x === 5)
        )
          c = '#252b28';
        if (
          r.part === 'head' &&
          r.face === 'front' &&
          y === 6 &&
          (x === 3 || x === 4)
        )
          c = '#ad7967';
        if (r.part === 'body' && (y < 2 || x === 0 || x === 7)) c = p[0];
        if (
          r.part === 'body' &&
          r.face === 'front' &&
          y > 3 &&
          y < 7 &&
          x > 2 &&
          x < 5
        )
          c = p[2];
        if (r.part.includes('arm') && y > 8) c = p[3];
        if (r.part.includes('leg') && y > 9) c = p[4];
        if ((x + y) % 9 === 0 && c === p[1]) c = p[0];
        pixels[(r.y + y) * 64 + r.x + x] = c;
      }
  }
  return {
    pixels,
    model: 'classic',
    name: ['Moss Explorer', 'Lunar Courier', 'Rose Wanderer'][index % 3],
    revision: 0,
  };
}
export function validateSkin(v: unknown): Skin {
  const s = v as Skin;
  if (
    !s ||
    !['classic', 'slim'].includes(s.model) ||
    !Array.isArray(s.pixels) ||
    s.pixels.length !== 4096 ||
    s.pixels.some(
      (c) => typeof c !== 'string' || !/^#[\da-f]{6}([\da-f]{2})?$/i.test(c),
    )
  )
    throw Error('Invalid 64 × 64 skin');
  if (typeof s.name !== 'string' || s.name.length > 80)
    throw Error('Name must have at most 80 characters');
  const pixels = [...s.pixels];
  for (const r of atlas(s.model).filter((r) => r.layer === 'base'))
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++)
        pixels[y * 64 + x] = pixels[y * 64 + x].slice(0, 7);
  return {
    name:s.name, model:s.model, sourceId: typeof s.sourceId === "string" ? s.sourceId : undefined,
    pixels,
    revision: Number.isInteger(s.revision) ? s.revision : 0,
  };
}
export function applyOperations(
  s: Skin,
  ops: Operation[],
  expected: number,
): Skin {
  if (expected !== s.revision)
    throw Error(
      `Revision conflict: current revision is ${s.revision}. Read the skin again.`,
    );
  if (!Array.isArray(ops) || !ops.length || ops.length > 4096)
    throw Error('Supply 1–4096 operations');
  const pixels = [...s.pixels];
  const regions = atlas(s.model);
  const lookup = Array(4096).fill(null);
  for (const r of regions)
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++) lookup[y * 64 + x] = r;
  let work = 0;
  for (const o of ops) {
    if (
      !['pixel', 'rectangle', 'fill', 'replace'].includes(o.type) ||
      !/^#[\da-f]{6}([\da-f]{2})?$/i.test(o.color)
    )
      throw Error('Invalid operation or color');
    const r = o.region ? regions.find((r) => r.id === o.region) : undefined;
    if (o.region && !r) throw Error('Unknown region');
    let x = o.x ?? 0,
      y = o.y ?? 0,
      w = o.type === 'pixel' ? 1 : (o.width ?? r?.width ?? 64),
      h = o.type === 'pixel' ? 1 : (o.height ?? r?.height ?? 64);
    if (
      [x, y, w, h].some((v) => !Number.isInteger(v)) ||
      x < 0 ||
      y < 0 ||
      w < 1 ||
      h < 1 ||
      x + w > (r?.width ?? 64) ||
      y + h > (r?.height ?? 64)
    )
      throw Error('Operation outside region');
    work += w * h;
    if (work > 65536) throw Error('Batch exceeds 65536 pixel visits');
    x += r?.x ?? 0;
    y += r?.y ?? 0;
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const region = lookup[yy * 64 + xx];
        if (!region) continue;
        if (
          region.layer === 'base' &&
          o.color.length === 9 &&
          o.color.slice(7).toLowerCase() !== 'ff'
        )
          throw Error('Base pixels must stay opaque');
        const i = yy * 64 + xx;
        if (
          o.type !== 'replace' ||
          pixels[i].toLowerCase() === o.from?.toLowerCase()
        )
          pixels[i] = o.color.toLowerCase();
      }
  }
  return { ...s, pixels, revision: s.revision + 1 };
}
export const allVisible = Object.fromEntries(
  ['head', 'body', 'right_arm', 'left_arm', 'right_leg', 'left_leg'].map(
    (p) => [p, true],
  ),
) as Record<Part, boolean>;
export type View = {
  pose: Pose;
  animated?: boolean;
  layer: Layer;
  visible: Record<Part, boolean>;
  showOverlay: boolean;
  showBase: boolean;
  partLayers?: Partial<Record<Part, 'base' | 'overlay' | 'hidden'>>;
};
export function pixelCanvas(pixels: string[]) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  pixels.forEach((p, i) => {
    ctx.fillStyle = p;
    ctx.fillRect(i % 64, Math.floor(i / 64), 1, 1);
  });
  return c;
}
