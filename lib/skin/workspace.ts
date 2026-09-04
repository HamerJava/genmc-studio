import { validateMessages, type AgentMessage } from './inbox';
import { atlas, regionAt, type Model } from './atlas';
import type { Skin } from './engine';
export type Selection = {
  x: number;
  y: number;
  width: number;
  height: number;
  region?: string;
};
export type EditContext = {
  brief: string;
  messages: AgentMessage[];
  revision: number;
  selection?: Selection;
  mask: number[];
  palette: string[];
  limitToContext: boolean;
};
export type Author = 'user' | 'agent';
type Meta = Pick<Skin, 'name' | 'model' | 'sourceId'>;
export type Change = {
  id: string;
  author: Author;
  label: string;
  time: number;
  pixels: [number, string, string][];
  before: Meta;
  after: Meta;
};
export type Journal = { entries: Change[]; cursor: number };
export const emptyContext: EditContext = {
  brief: '',
  messages: [],
  revision: 0,
  mask: [],
  palette: [],
  limitToContext: true,
};
export const emptyJournal: Journal = { entries: [], cursor: 0 };
const meta = (s: Skin): Meta => ({
  name: s.name,
  model: s.model,
  sourceId: s.sourceId,
});
export function recordChange(
  j: Journal,
  before: Skin,
  after: Skin,
  author: Author,
  label: string,
): Journal {
  const pixels: [number, string, string][] = before.pixels.flatMap((p, i) =>
    p === after.pixels[i] ? [] : [[i, p, after.pixels[i]]],
  );
  if (
    !pixels.length &&
    JSON.stringify(meta(before)) === JSON.stringify(meta(after))
  )
    return j;
  const entries = [
    ...j.entries.slice(0, j.cursor),
    {
      id: crypto.randomUUID(),
      author,
      label: label.slice(0, 100),
      time: Date.now(),
      pixels,
      before: meta(before),
      after: meta(after),
    },
  ];
  while (entries.length > 100 || JSON.stringify(entries).length > 700000)
    entries.shift();
  return { entries, cursor: entries.length };
}
export function travel(
  j: Journal,
  skin: Skin,
  cursor: number,
): { journal: Journal; skin: Skin } {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > j.entries.length)
    throw Error('Invalid history position');
  if (cursor === j.cursor) return { journal: j, skin };
  let next = { ...skin, pixels: [...skin.pixels] };
  if (cursor < j.cursor)
    for (let i = j.cursor - 1; i >= cursor; i--) {
      const e = j.entries[i];
      for (const [p, before] of e.pixels) next.pixels[p] = before;
      next = { ...next, ...e.before, sourceId: e.before.sourceId };
    }
  else
    for (let i = j.cursor; i < cursor; i++) {
      const e = j.entries[i];
      for (const [p, , after] of e.pixels) next.pixels[p] = after;
      next = { ...next, ...e.after, sourceId: e.after.sourceId };
    }
  return {
    journal: { ...j, cursor },
    skin: { ...next, revision: skin.revision + 1 },
  };
}
export function contextIndices(c: EditContext, model: Model): number[] {
  if (c.mask.length) return c.mask;
  const r = c.selection;
  if (!r) return [];
  const out: number[] = [];
  for (let y = r.y; y < r.y + r.height; y++)
    for (let x = r.x; x < r.x + r.width; x++)
      if (regionAt(model, x, y)) out.push(y * 64 + x);
  return out;
}
export function describeContext(c: EditContext, model: Model) {
  const indices = contextIndices(c, model);
  const selected = new Set(indices);
  return {
    ...c,
    messages: undefined,
    mask: c.mask.map((i) => ({ x: i % 64, y: Math.floor(i / 64) })),
    scope: c.mask.length ? 'mask' : c.selection ? 'selection' : 'whole_skin',
    regions: atlas(model)
      .filter((r) => {
        for (let y = r.y; y < r.y + r.height; y++)
          for (let x = r.x; x < r.x + r.width; x++)
            if (selected.has(y * 64 + x)) return true;
        return false;
      })
      .map((r) => r.id),
    selectedPixelCount: indices.length,
    coordinates:
      '64x64 UV pixels, origin top-left. Mask takes priority over rectangular selection. Context is never included in PNG export.',
  };
}
export function enforceContext(
  before: Skin,
  after: Skin,
  c: EditContext,
  expected?: number,
) {
  if (
    (expected !== undefined || c.brief || c.selection || c.mask.length) &&
    expected !== c.revision
  )
    throw Error(
      `Context changed: read get_edit_context; expectedContextRevision must be ${c.revision}.`,
    );
  const indices = contextIndices(c, before.model);
  if (!c.limitToContext || !indices.length) return;
  const allowed = new Set(indices);
  if (after.pixels.some((p, i) => p !== before.pixels[i] && !allowed.has(i)))
    throw Error(
      'Edit leaves the marked area. Keep operations inside the current mask or selection.',
    );
}
const hex = (v: unknown) =>
  typeof v === 'string' && /^#[a-f0-9]{6}([a-f0-9]{2})?$/i.test(v);
export function validateWorkspace(raw: any): {
  context: EditContext;
  journal: Journal;
} {
  if (!raw)
    return { context: { ...emptyContext }, journal: { ...emptyJournal } };
  const c = raw.context ?? emptyContext;
  const j = raw.journal ?? emptyJournal;
  if (
    typeof c.brief !== 'string' ||
    c.brief.length > 4000 ||
    !Number.isInteger(c.revision) ||
    c.revision < 0 ||
    typeof c.limitToContext !== 'boolean' ||
    !Array.isArray(c.mask) ||
    c.mask.length > 4096 ||
    c.mask.some(
      (i: unknown) => !Number.isInteger(i) || Number(i) < 0 || Number(i) > 4095,
    ) ||
    !Array.isArray(c.palette) ||
    c.palette.length > 32 ||
    c.palette.some((v: unknown) => !hex(v))
  )
    throw Error('Invalid editing context');
  const r = c.selection;
  if (
    r &&
    (![r.x, r.y, r.width, r.height].every(Number.isInteger) ||
      r.x < 0 ||
      r.y < 0 ||
      r.width < 1 ||
      r.height < 1 ||
      r.x + r.width > 64 ||
      r.y + r.height > 64 ||
      (r.region !== undefined && typeof r.region !== 'string'))
  )
    throw Error('Invalid selection');
  if (
    !Array.isArray(j.entries) ||
    j.entries.length > 100 ||
    !Number.isInteger(j.cursor) ||
    j.cursor < 0 ||
    j.cursor > j.entries.length ||
    JSON.stringify(j).length > 800000
  )
    throw Error('Invalid history');
  for (const e of j.entries) {
    if (
      !['user', 'agent'].includes(e.author) ||
      typeof e.id !== 'string' ||
      typeof e.label !== 'string' ||
      e.label.length > 100 ||
      !Number.isFinite(e.time) ||
      !Array.isArray(e.pixels) ||
      e.pixels.length > 4096
    )
      throw Error('Invalid history entry');
    for (const m of [e.before, e.after])
      if (
        !m ||
        !['classic', 'slim'].includes(m.model) ||
        typeof m.name !== 'string' ||
        m.name.length > 80 ||
        (m.sourceId !== undefined && typeof m.sourceId !== 'string')
      )
        throw Error('Invalid history metadata');
    for (const p of e.pixels)
      if (
        !Array.isArray(p) ||
        p.length !== 3 ||
        !Number.isInteger(p[0]) ||
        p[0] < 0 ||
        p[0] > 4095 ||
        !hex(p[1]) ||
        !hex(p[2])
      )
        throw Error('Invalid history pixels');
  }
  let messages = validateMessages(c.messages);
  if (c.messages === undefined && c.brief.trim())
    messages = [
      {
        id: 'legacy-brief',
        text: c.brief,
        createdAt: Date.now(),
        readAt: null,
        skinRevision: 0,
        contextRevision: c.revision,
        selection: c.selection,
        mask: [...c.mask],
      },
    ];
  return {
    context: { ...c, messages, mask: [...new Set(c.mask)] },
    journal: j,
  };
}
