'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Pencil,
  MousePointer2,
  Undo2,
  Redo2,
  Download,
  Upload,
  Box,
  Grid2X2,
  Eraser,
  Pipette,
  PaintBucket,
  Scan,
  FlipHorizontal2,
  Check,
  ChevronRight,
  Sparkles,
  Play,
  Pause,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  atlas,
  atlasInfo,
  regionAt,
  parts,
  type Model,
  type Region,
} from '@/lib/skin/atlas';
import {
  makeSkin,
  allVisible,
  applyOperations,
  validateSkin,
  type Skin,
  type View,
  type Operation,
} from '@/lib/skin/engine';
import { markSkin } from '@/lib/skin/marker';
import { pngData, readPng } from '@/lib/skin/png';
import { toolDefinitions, registerTools } from '@/lib/skin/webmcp';
import {
  emptyContext,
  emptyJournal,
  recordChange,
  travel,
  describeContext,
  enforceContext,
  validateWorkspace,
  type EditContext,
  type Journal,
  type Author,
  type Selection,
} from '@/lib/skin/workspace';
import AtlasView from '@/components/studio/atlas-view';
const SkinView = dynamic(() => import('@/components/studio/skin-view'), {
  ssr: false,
});
const initialView: View = {
  pose: 'walk',
  layer: 'base',
  visible: allVisible,
  showOverlay: true,
  showBase: true,
};
const poseLabels = {
  stand: 'Stand',
  walk: 'Walk',
};
const swatches = [
  '#71826c',
  '#e1b892',
  '#302f2b',
  '#faf7ee',
  '#535e8b',
  '#bc7990',
];
async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, init);
  const d: any = await r.json();
  if (!r.ok) throw Error(d.error ?? 'Request failed');
  return d;
}
export default function Home() {
  const [skin, setSkin] = useState<Skin>(() => makeSkin());
  const skinRef = useRef(skin);
  const [view, setView] = useState<View>(initialView);
  const [mode, setMode] = useState('3d');
  const [tab, setTab] = useState('studio');
  const [tool, setTool] = useState('rotate');
  const [color, setColor] = useState('#71826c');
  const [mirror, setMirror] = useState(false);
  const [labels, setLabels] = useState(false);
  const [context, setContext] = useState<EditContext>(emptyContext);
  const contextRef = useRef(context);
  const selection = context.selection;
  function updateContext(patch: Partial<EditContext>) {
    const next = {
      ...contextRef.current,
      ...patch,
      revision: contextRef.current.revision + 1,
    };
    contextRef.current = next;
    setContext(next);
  }
  function setSelection(selection?: Selection) {
    updateContext({ selection });
  }
  const [journal, setJournal] = useState<Journal>(emptyJournal);
  const journalRef = useRef(journal);
  function updateJournal(j: Journal) {
    journalRef.current = j;
    setJournal(j);
  }
  const [historyFilter, setHistoryFilter] = useState('all');
  const [grid, setGrid] = useState(true);
  const [activity, setActivity] = useState('');
  const activityId = useRef(0);
  const stroke = useRef<Skin | null>(null);
  function startStroke() {
    selectionStart.current = null;
    if (['pencil', 'eraser', 'fill'].includes(tool))
      stroke.current = skinRef.current;
  }
  function endStroke() {
    if (stroke.current) {
      updateJournal(
        recordChange(
          journalRef.current,
          stroke.current,
          skinRef.current,
          'user',
          tool === 'eraser' ? 'Erase stroke' : 'Paint stroke',
        ),
      );
      stroke.current = null;
    }
    selectionStart.current = null;
  }

  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState('Loading draft…');
  const [ready, setReady] = useState(false);
  const [mcp, setMcp] = useState('Checking agent connection…');
  const [publish, setPublish] = useState<Skin | null>(null);
  const [busy, setBusy] = useState(false);
  const [gallery, setGallery] = useState<any[]>([]);
  const [help, setHelp] = useState(false);

  const upload = useRef<HTMLInputElement>(null);
  const selectionStart = useRef<{
    x: number;
    y: number;
    region: string;
  } | null>(null);
  const saveChain = useRef(Promise.resolve());
  const runRef = useRef<(n: string, i: any) => any>(() => {});
  function commit(
    next: Skin,
    record = true,
    author: Author = 'user',
    label = 'Edit skin',
  ) {
    if (record && !stroke.current)
      updateJournal(
        recordChange(journalRef.current, skinRef.current, next, author, label),
      );
    skinRef.current = next;
    setSkin(next);
    setSaved('Saving…');
    return { revision: next.revision };
  }
  function edit(
    ops: Operation[],
    rev = skinRef.current.revision,
    author: Author = 'user',
    label = 'Paint',
    contextRevision?: number,
  ) {
    const next = applyOperations(skinRef.current, ops, rev);
    if (author === 'agent')
      enforceContext(
        skinRef.current,
        next,
        contextRef.current,
        contextRevision,
      );
    return commit(next, true, author, label);
  }
  function checkout(cursor: number) {
    const result = travel(journalRef.current, skinRef.current, cursor);
    updateJournal(result.journal);
    return commit(result.skin, false);
  }
  function history(which: 'undo' | 'redo') {
    return checkout(
      Math.max(
        0,
        Math.min(
          journalRef.current.entries.length,
          journalRef.current.cursor + (which === 'undo' ? -1 : 1),
        ),
      ),
    );
  }
  function convert(model: Model, author: Author = 'user') {
    if (model === skinRef.current.model) return;
    const current = skinRef.current;
    const pixels = Array(4096).fill('#00000000');
    for (const r of atlas(model)) {
      const old = atlas(current.model).find((o) => o.id === r.id)!;
      for (let y = 0; y < r.height; y++)
        for (let x = 0; x < r.width; x++)
          pixels[(r.y + y) * 64 + r.x + x] =
            current.pixels[
              (old.y + y) * 64 + old.x + Math.min(x, old.width - 1)
            ];
    }
    commit(
      { ...current, pixels, model, revision: current.revision + 1 },
      true,
      author,
      `Switch to ${model}`,
    );
    setSelection(undefined);
  }
  async function readGallery(id: string) {
    if (/^starter-[0-2]$/.test(id))
      return { ...makeSkin(Number(id.slice(-1))), id };
    return await api(`/api/gallery/${encodeURIComponent(id)}`);
  }
  async function useTemplate(
    id: string,
    expected = skinRef.current.revision,
    author: Author = 'user',
  ) {
    const s = validateSkin(await readGallery(id));
    if (expected !== skinRef.current.revision)
      throw Error('Skin changed while loading template. Try again.');
    commit(
      { ...s, sourceId: id, revision: skinRef.current.revision + 1 },
      true,
      author,
      `Template: ${s.name}`,
    );
    setSelection(undefined);
    setTab('studio');
  }
  async function loadGallery() {
    try {
      const d = await api('/api/gallery');
      setGallery(d.skins);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  runRef.current = async (name, input) => {
    const s = skinRef.current;
    if (
      stroke.current &&
      ![
        'get_skin_state',
        'get_uv_atlas',
        'get_edit_context',
        'read_history',
        'read_region',
      ].includes(name)
    )
      throw Error('A user stroke is in progress. Retry after it ends.');
    switch (name) {
      case 'get_skin_state':
        return { ...s, selection: selection ?? null, view, mode };
      case 'get_edit_context':
        return describeContext(contextRef.current, s.model);
      case 'read_history':
        return {
          cursor: journalRef.current.cursor,
          revision: s.revision,
          entries: journalRef.current.entries
            .map((e, i) => ({
              id: e.id,
              position: i + 1,
              author: e.author,
              label: e.label,
              time: e.time,
              pixels: e.pixels.length,
              applied: i < journalRef.current.cursor,
            }))
            .filter(
              (e) =>
                !input.author ||
                input.author === 'all' ||
                e.author === input.author,
            ),
        };
      case 'get_uv_atlas':
        if (input.model && !['classic', 'slim'].includes(input.model))
          throw Error('Invalid model');
        return atlasInfo(input.model ?? s.model);
      case 'read_region': {
        const r = atlas(s.model).find((r) => r.id === input.region);
        if (!r) throw Error('Unknown region');
        return {
          ...r,
          rows: Array.from({ length: r.height }, (_, y) =>
            s.pixels.slice(
              (r.y + y) * 64 + r.x,
              (r.y + y) * 64 + r.x + r.width,
            ),
          ),
        };
      }
      case 'apply_operations':
        if (!Number.isInteger(input.expectedRevision))
          throw Error('expectedRevision is required');
        return edit(
          input.operations,
          input.expectedRevision,
          'agent',
          input.label ?? 'Agent edit',
          input.expectedContextRevision,
        );
      case 'set_selection': {
        const r = atlas(s.model).find((r) => r.id === input.region);
        if (!r) throw Error('Unknown region');
        setSelection({ ...r, region: r.id });
        setView((v) => ({ ...v, layer: r.layer }));
        return { selection: r };
      }
      case 'set_view': {
        if (
          (input.pose && !Object.keys(poseLabels).includes(input.pose)) ||
          (input.layer && !['base', 'overlay'].includes(input.layer)) ||
          (input.mode && !['2d', '3d'].includes(input.mode)) ||
          (input.model && !['classic', 'slim'].includes(input.model))
        )
          throw Error('Invalid view');
        if (input.model) {
          if (input.expectedRevision !== s.revision)
            throw Error(
              'Model conversion requires the current expectedRevision',
            );
          convert(input.model, 'agent');
        }
        setView((v) => ({
          ...v,
          ...(input.pose ? { pose: input.pose } : {}),
          ...(typeof input.animated === 'boolean'
            ? { animated: input.animated }
            : {}),
          ...(input.layer ? { layer: input.layer } : {}),
        }));
        if (input.mode) setMode(input.mode);
        return { updated: true };
      }
      case 'undo':
        return history('undo');
      case 'redo':
        return history('redo');
      case 'list_skins':
        return {
          starters: [0, 1, 2].map((i) => ({
            id: `starter-${i}`,
            name: makeSkin(i).name,
          })),
          ...(await api('/api/gallery')),
        };
      case 'read_gallery_skin':
        return readGallery(input.id);
      case 'use_template':
        if (!Number.isInteger(input.expectedRevision))
          throw Error('expectedRevision is required');
        await useTemplate(input.id, input.expectedRevision, 'agent');
        return { revision: skinRef.current.revision };
      case 'prepare_publish':
        setPublish(structuredClone(s));
        return { status: 'awaiting_human_confirmation', revision: s.revision };
      default:
        throw Error('Unknown tool');
    }
  };
  useEffect(() => {
    let active = true;
    api('/api/draft')
      .then((d) => {
        if (!active) return;
        if (d.skin) {
          const s = validateSkin(d.skin);
          const workspace = validateWorkspace(d.skin.workspace);
          contextRef.current = workspace.context;
          setContext(workspace.context);
          updateJournal(workspace.journal);
          skinRef.current = s;
          setSkin(s);
        }
        setSaved('Saved');
        setReady(true);
      })
      .catch(() => {
        if (active) {
          setSaved('Storage unavailable · retry by reloading');
          setNotice(
            'Could not load your saved draft. Editing is paused to protect it.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaved('Saving…');
    const t = setTimeout(() => {
      const snapshot = { ...skin, workspace: { context, journal } };
      saveChain.current = saveChain.current
        .catch(() => {})
        .then(async () => {
          await api('/api/draft', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshot),
          });
          if (
            skinRef.current === skin &&
            contextRef.current === context &&
            journalRef.current === journal
          )
            setSaved('Saved');
        })
        .catch(() => setSaved('Not saved · check connection'));
    }, 550);
    return () => clearTimeout(t);
  }, [skin, context, journal, ready]);
  useEffect(() => {
    const lifecycle = new AbortController();
    registerTools(
      toolDefinitions(async (n, i) => {
        if (
          !readyRef.current &&
          !['get_uv_atlas', 'get_skin_state'].includes(n)
        )
          throw Error('Draft is still loading');
        const id = ++activityId.current;
        setActivity(`Agent · ${n.replaceAll('_', ' ')}`);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        try {
          return await runRef.current(n, i);
        } catch (e) {
          setNotice((e as Error).message);
          throw e;
        } finally {
          setTimeout(() => {
            if (activityId.current === id) setActivity('');
          }, 1200);
        }
      }),
      lifecycle.signal,
    )
      .then((ok) => setMcp(ok ? 'Agent ready' : 'Use a WebMCP-enabled browser'))
      .catch(() => setMcp('Agent registration failed'));
    return () => lifecycle.abort();
  }, []);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,textarea')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        history(e.shiftKey ? 'redo' : 'undo');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  function pixel(x: number, y: number) {
    if (!ready || tool === 'rotate') return;
    const r = regionAt(skinRef.current.model, x, y);
    if (!r) return;
    if (tool === 'select') {
      const start = selectionStart.current ?? { x, y, region: r.id };
      if (start.region !== r.id) return;
      selectionStart.current = start;
      setSelection({
        x: Math.min(x, start.x),
        y: Math.min(y, start.y),
        width: Math.abs(x - start.x) + 1,
        height: Math.abs(y - start.y) + 1,
        region: r.id,
      });
      return;
    }
    if (tool === 'mask' || tool === 'unmask') {
      const mask = new Set(contextRef.current.mask);
      if (tool === 'mask') mask.add(y * 64 + x);
      else mask.delete(y * 64 + x);
      updateContext({ mask: [...mask] });
      return;
    }
    if (tool === 'pipette') {
      setColor(skinRef.current.pixels[y * 64 + x].slice(0, 7));
      return;
    }
    if (r.layer !== view.layer) {
      setNotice(`Select the ${r.layer} layer to paint this region.`);
      return;
    }
    if (tool === 'eraser' && r.layer === 'base') {
      setNotice('Erase on the overlay. Base pixels stay opaque.');
      return;
    }
    try {
      const c = tool === 'eraser' ? '#00000000' : color;
      const ops: Operation[] = [
        tool === 'fill'
          ? { type: 'fill', region: r.id, color: c }
          : { type: 'pixel', x, y, color: c },
      ];
      if (mirror && tool !== 'fill') {
        const other = r.part.startsWith('left')
          ? r.part.replace('left', 'right')
          : r.part.startsWith('right')
            ? r.part.replace('right', 'left')
            : r.part;
        const target = atlas(skinRef.current.model).find(
          (t) =>
            t.part === other &&
            t.layer === r.layer &&
            t.face ===
              (r.face === 'left'
                ? 'right'
                : r.face === 'right'
                  ? 'left'
                  : r.face),
        )!;
        ops.push({
          type: 'pixel',
          region: target.id,
          x: target.width - 1 - (x - r.x),
          y: y - r.y,
          color: c,
        });
      }
      edit(ops);
      setNotice('');
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      const pixels = await readPng(file);
      commit(
        validateSkin({
          ...skinRef.current,
          pixels,
          name: file.name.replace(/\.png$/i, ''),
          revision: skinRef.current.revision + 1,
          sourceId: undefined,
        }),
      );
      setNotice('Imported · choose Classic or Slim to match your skin.');
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function exportSkin() {
    const a = document.createElement('a');
    a.href = pngData(markSkin(skinRef.current));
    a.download = `${skin.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-genmc.png`;
    a.click();
    setNotice('Exported with GenMC marker.');
  }
  async function publishSkin() {
    if (!publish || busy) return;
    setBusy(true);
    try {
      const marked = markSkin(publish);
      const d = await api('/api/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skin: marked }),
      });
      setPublish(null);
      setNotice('Published to the gallery.');
      setTab('gallery');
      await loadGallery();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      {activity && <div className="agent-glow" aria-hidden="true" />}
      <header>
        <a className="logo" href="/">
          genMC<span>(P)</span>
        </a>
        <nav>
          {[
            ['studio', 'Studio'],
            ['gallery', 'Gallery'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? 'active' : ''}
              onClick={() => {
                setTab(id);
                if (id === 'gallery') void loadGallery();
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button disabled={!ready} onClick={() => upload.current?.click()}>
            <Upload size={15} />
            Import
          </button>
          <button disabled={!ready} onClick={exportSkin}>
            <Download size={15} />
            Export
          </button>
          <button
            disabled={!ready}
            className="primary"
            onClick={() => setPublish(structuredClone(skinRef.current))}
          >
            Publish ↗
          </button>
        </div>
      </header>
      <input
        hidden
        ref={upload}
        type="file"
        accept="image/png"
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {tab === 'studio' && (
        <section className="workspace">
          <div className="workspace-heading">
            <div>
              <span className="eyebrow">YOUR WORKSPACE</span>
              <input
                className="skin-name"
                aria-label="Skin name"
                maxLength={80}
                value={skin.name}
                disabled={!ready}
                onChange={(e) =>
                  commit({
                    ...skinRef.current,
                    name: e.target.value,
                    revision: skinRef.current.revision + 1,
                  })
                }
              />
              <span className="save-state">{saved}</span>
            </div>
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(String(v));
                selectionStart.current = null;
              }}
            >
              <TabsList>
                <TabsTrigger value="3d">
                  <Box />
                  3D
                </TabsTrigger>
                <TabsTrigger value="2d">
                  <Grid2X2 />
                  2D
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className={`layer-bar ${view.layer}`}>
            <Tabs
              value={view.layer}
              onValueChange={(v) =>
                setView({
                  ...view,
                  layer: v as View['layer'],
                  [v === 'base' ? 'showBase' : 'showOverlay']: true,
                })
              }
            >
              <TabsList>
                <TabsTrigger value="base">Base skin</TabsTrigger>
                <TabsTrigger value="overlay">Outer layer</TabsTrigger>
              </TabsList>
            </Tabs>
            <span>
              {view.layer === 'base'
                ? 'Solid skin · green grid'
                : 'Raised overlay · violet grid'}
            </span>
            <label className="setting">
              Pixel grid{' '}
              <Switch size="sm" checked={grid} onCheckedChange={setGrid} />
            </label>
          </div>
          <div className="workbench">
            <aside className="tools">
              {[
                [MousePointer2, 'rotate', 'Rotate'],
                [Pencil, 'pencil', 'Pencil'],
                [Eraser, 'eraser', 'Eraser'],
                [Pipette, 'pipette', 'Pick color'],
                [PaintBucket, 'fill', 'Fill face'],
                [Scan, 'select', 'Select area'],
                [Sparkles, 'mask', 'Mask pen'],
                [Eraser, 'unmask', 'Erase mask'],
              ].map(([Icon, id, label]: any) => (
                <button
                  key={id}
                  title={label}
                  aria-label={label}
                  aria-pressed={tool === id}
                  className={tool === id ? 'selected' : ''}
                  onClick={() => {
                    setTool(id);
                    selectionStart.current = null;
                  }}
                >
                  <Icon />
                </button>
              ))}
              <div className="divider" />
              <button
                title="Undo (⌘Z)"
                aria-label="Undo"
                disabled={!journal.cursor}
                onClick={() => history('undo')}
              >
                <Undo2 />
              </button>
              <button
                title="Redo (⇧⌘Z)"
                aria-label="Redo"
                disabled={journal.cursor === journal.entries.length}
                onClick={() => history('redo')}
              >
                <Redo2 />
              </button>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Paint color"
              />
            </aside>
            {mode === '3d' ? (
              <SkinView
                skin={skin}
                view={view}
                paint={tool !== 'rotate'}
                grid={grid}
                mask={context.mask}
                selected={selection}
                onStart={startStroke}
                onEnd={endStroke}
                onPixel={pixel}
              />
            ) : (
              <AtlasView
                skin={skin}
                selected={selection}
                labels={labels}
                grid={grid}
                layer={view.layer}
                mask={context.mask}
                onStart={startStroke}
                onPixel={pixel}
                onEnd={endStroke}
              />
            )}
            <aside className="inspector">
              <div className="pose-controls" role="group" aria-label="Pose">
                {Object.entries(poseLabels).map(([p, label]) => (
                  <button
                    className={view.pose === p ? 'selected' : ''}
                    key={p}
                    aria-pressed={view.pose === p}
                    onClick={() =>
                      setView({ ...view, pose: p as View['pose'] })
                    }
                  >
                    {label}
                  </button>
                ))}
                <button
                  className="pose-play"
                  aria-label={
                    view.animated ? 'Pause animation' : 'Play animation'
                  }
                  title={view.animated ? 'Pause animation' : 'Play animation'}
                  onClick={() => setView({ ...view, animated: !view.animated })}
                >
                  {view.animated ? <Pause size={13} /> : <Play size={13} />}
                </button>
              </div>
              <details open>
                <summary>Color</summary>
                <div className="swatches">
                  {swatches.map((c) => (
                    <button
                      key={c}
                      style={{ background: c }}
                      aria-label={`Use ${c}`}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
                {context.palette.length > 0 && (
                  <details className="saved-colors">
                    <summary>Saved colors</summary>
                    <div className="swatches">
                      {context.palette.map((c) => (
                        <button
                          key={c}
                          style={{ background: c }}
                          aria-label={`Use saved ${c}`}
                          onClick={() => setColor(c)}
                        />
                      ))}
                    </div>
                  </details>
                )}
                <div className="custom-color">
                  <input
                    type="color"
                    aria-label="Custom color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                  <input
                    aria-label="Hex color"
                    key={color}
                    defaultValue={color.toUpperCase()}
                    maxLength={7}
                    onBlur={(e) => {
                      if (/^#[0-9a-f]{6}$/i.test(e.target.value))
                        setColor(e.target.value);
                      else e.target.value = color.toUpperCase();
                    }}
                  />
                  <button
                    title="Save color"
                    onClick={() =>
                      updateContext({
                        palette: [
                          ...new Set([...context.palette, color]),
                        ].slice(-32),
                      })
                    }
                  >
                    +
                  </button>
                </div>
              </details>
              <details>
                <summary>Visibility</summary>
                {parts.map((p) => (
                  <label className="setting" key={p}>
                    <span>{p.replace('_', ' ')}</span>
                    <Switch
                      checked={view.visible[p]}
                      onCheckedChange={(v) =>
                        setView({
                          ...view,
                          visible: { ...view.visible, [p]: v },
                        })
                      }
                      size="sm"
                    />
                  </label>
                ))}
                {(['showBase', 'showOverlay'] as const).map((key) => (
                  <label className="setting" key={key}>
                    <span>
                      {key === 'showBase' ? 'Base visible' : 'Overlay visible'}
                    </span>
                    <Switch
                      size="sm"
                      checked={view[key]}
                      onCheckedChange={(v) => setView({ ...view, [key]: v })}
                    />
                  </label>
                ))}
              </details>
              <details>
                <summary>Options</summary>
                <label className="setting">
                  Mirror paint
                  <Switch
                    size="sm"
                    checked={mirror}
                    onCheckedChange={setMirror}
                  />
                </label>
                <label className="setting">
                  UV labels
                  <Switch
                    size="sm"
                    checked={labels}
                    onCheckedChange={setLabels}
                  />
                </label>
                <Tabs
                  value={skin.model}
                  onValueChange={(v) => convert(v as Model)}
                >
                  <TabsList>
                    <TabsTrigger value="classic">Classic</TabsTrigger>
                    <TabsTrigger value="slim">Slim</TabsTrigger>
                  </TabsList>
                </Tabs>
              </details>
              <p className="muted">
                64 × 64 · {skin.model}
                <br />
                {selection?.region ?? 'No selection'}
              </p>
              {selection && (
                <button
                  onClick={() => {
                    try {
                      edit([
                        {
                          type: 'rectangle',
                          x: selection.x,
                          y: selection.y,
                          width: selection.width,
                          height: selection.height,
                          color,
                        },
                      ]);
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                >
                  Fill selection
                </button>
              )}
            </aside>
          </div>
          <div className="collaboration-panel">
            <section className="agent-context">
              <div className="panel-heading">
                <h2>For your agent</h2>
                <span
                  role="status"
                  className={activity ? 'agent-active' : 'muted'}
                >
                  {activity || 'Shared editing context'}
                </span>
              </div>
              <textarea
                aria-label="Instructions for agent"
                placeholder="What should change? Your agent can read this."
                maxLength={4000}
                value={context.brief}
                onChange={(e) => updateContext({ brief: e.target.value })}
              />
              <div className="context-actions">
                <button
                  className={tool === 'select' ? 'selected' : ''}
                  onClick={() => setTool('select')}
                >
                  <Scan size={14} />
                  Select area
                </button>
                <button
                  className={tool === 'mask' ? 'selected' : ''}
                  onClick={() => setTool('mask')}
                >
                  <Sparkles size={14} />
                  Mask pen
                </button>
                <button
                  disabled={!selection && !context.mask.length}
                  onClick={() =>
                    updateContext({ selection: undefined, mask: [] })
                  }
                >
                  Clear marks
                </button>
              </div>
              <p className="muted">
                {context.mask.length
                  ? `${context.mask.length} masked pixels · mask takes priority`
                  : selection
                    ? `${selection.width} × ${selection.height} · ${selection.region}`
                    : 'Drag on the skin to select or mark pixels.'}
              </p>
              <label className="setting">
                Keep agent paint inside marks
                <Switch
                  size="sm"
                  checked={context.limitToContext}
                  onCheckedChange={(limitToContext) =>
                    updateContext({ limitToContext })
                  }
                />
              </label>
            </section>
            <section className="edit-history">
              <div className="panel-heading">
                <h2>History</h2>
                <div>
                  <button
                    aria-label="History back"
                    disabled={!journal.cursor}
                    onClick={() => history('undo')}
                  >
                    <Undo2 size={14} />
                  </button>
                  <button
                    aria-label="History forward"
                    disabled={journal.cursor === journal.entries.length}
                    onClick={() => history('redo')}
                  >
                    <Redo2 size={14} />
                  </button>
                </div>
              </div>
              <Tabs
                value={historyFilter}
                onValueChange={(v) => setHistoryFilter(String(v))}
              >
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="user">You</TabsTrigger>
                  <TabsTrigger value="agent">Agent</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="history-list">
                {journal.entries
                  .map((e, i) => ({ e, i }))
                  .filter(
                    ({ e }) =>
                      historyFilter === 'all' || e.author === historyFilter,
                  )
                  .reverse()
                  .map(({ e, i }) => (
                    <button
                      key={e.id}
                      className={`history-entry ${i >= journal.cursor ? 'future' : ''} ${i + 1 === journal.cursor ? 'current' : ''}`}
                      onClick={() => checkout(i + 1)}
                    >
                      <span>
                        {e.author === 'agent' ? (
                          <Sparkles size={14} />
                        ) : (
                          <Pencil size={14} />
                        )}{' '}
                        {e.label}
                      </span>
                      <small>
                        {e.author === 'agent' ? 'Agent' : 'You'} ·{' '}
                        {e.pixels.length} px
                      </small>
                    </button>
                  ))}
                {!journal.entries.length && (
                  <p className="muted">Your next edit starts the timeline.</p>
                )}
              </div>
            </section>
          </div>
          <footer>
            <span>
              {mode === '3d'
                ? tool === 'rotate'
                  ? 'Drag to rotate · Scroll to zoom'
                  : 'Drag on skin to edit · Drag outside to rotate'
                : 'Pixel-perfect · Select a region for your agent'}
            </span>
            <button className="agent-status" onClick={() => setHelp(true)}>
              <span className={mcp === 'Agent ready' ? 'dot ready' : 'dot'} />
              {mcp} <ChevronRight size={12} />
            </button>
          </footer>
        </section>
      )}
      {tab === 'gallery' && (
        <section className="gallery-page">
          <div className="section-heading">
            <h1>A starting point. Make it yours.</h1>
            <span className="muted">Community skins & studio originals</span>
          </div>
          <div className="gallery-grid">
            {[
              ...Array.from({ length: 3 }, (_, i) => ({
                id: `starter-${i}`,
                name: makeSkin(i).name,
                starter: i,
              })),
              ...gallery,
            ].map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                onUse={() =>
                  void useTemplate(item.id).catch((e) => setNotice(e.message))
                }
              />
            ))}
          </div>
        </section>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
      <Dialog
        open={!!publish}
        onOpenChange={(v) => {
          if (!v && !busy) setPublish(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Share this skin?</DialogTitle>
          <DialogDescription>
            Your skin will be public and available to remix.
          </DialogDescription>
          {publish && (
            <>
              <div className="publish-preview">
                <SkinView skin={publish} view={initialView} />
              </div>
              <strong>{publish.name || 'Untitled skin'}</strong>
              <p className="muted">
                GenMC marker included ·{' '}
                {publish.sourceId
                  ? 'Template attribution preserved'
                  : 'Original draft'}
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void publishSkin()}
              >
                {busy ? 'Publishing…' : 'Publish to gallery'}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>Create with your agent</DialogTitle>
          <DialogDescription>
            Open this page in a WebMCP-enabled browser, then ask your agent:
          </DialogDescription>
          <blockquote>
            “Read the skin and UV atlas. Add a gold emblem to the front of the
            jacket overlay. Keep the face unchanged.”
          </blockquote>
          <p className="muted">
            Select a face in 3D or a rectangle in 2D to give your agent precise
            context. Every agent edit can be undone. Your agent runs in its
            browser — no API key is needed here.
          </p>
          <a href="/guide" className="text-button">
            Read the guide ↗
          </a>
        </DialogContent>
      </Dialog>
    </main>
  );
}
function GalleryCard({ item, onUse }: { item: any; onUse: () => void }) {
  const [s, setS] = useState<Skin | null>(
    item.starter !== undefined ? makeSkin(item.starter) : null,
  );
  useEffect(() => {
    if (!s)
      api(`/api/gallery/${item.id}`)
        .then(setS)
        .catch(() => {});
  }, [item.id]);
  return (
    <article className="gallery-card">
      <div className="gallery-preview">
        {s && <SkinView skin={s} view={initialView} />}
      </div>
      <div>
        <span>{item.name}</span>
        <button onClick={onUse}>Remix ↗</button>
      </div>
      <small>
        {item.starter !== undefined
          ? 'Studio original'
          : item.sourceId
            ? 'Community remix'
            : 'Community original'}
      </small>
    </article>
  );
}
