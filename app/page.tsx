'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Pencil,
  MousePointer2,
  Undo2,
  Redo2,
  Download,
  Upload,
  Box,
  Grid2X2,
  Columns2,
  Eraser,
  Pipette,
  PaintBucket,
  Scan,
  FlipHorizontal2,
  Eye,
  EyeOff,
  ChevronRight,
  Sparkles,
  Play,
  Pause,
} from 'lucide-react';
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
  contextIndices,
  enforceContext,
  validateWorkspace,
  type EditContext,
  type Journal,
  type Author,
  type Selection,
} from '@/lib/skin/workspace';
import VisibilityControls from '@/components/studio/visibility-controls';
import { colorPixels } from '@/lib/skin/color-highlight';
import { skinPalette } from '@/lib/skin/palette';
import {
  enqueueMessage,
  markMessagesRead,
  UserActionChannel,
  type UserAction,
} from '@/lib/skin/inbox';
import AgentDock, { type AgentCall } from '@/components/studio/agent-dock';
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
async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, init);
  const d: any = await r.json();
  if (!r.ok) throw Error(d.error ?? 'Request failed');
  return d;
}
export default function Home() {
  const [skin, setSkin] = useState<Skin>(() => makeSkin());
  const skinRef = useRef(skin);
  const swatches = useMemo(() => skinPalette(skin), [skin.pixels, skin.model]);
  const [channel] = useState(() => new UserActionChannel());
  const lastDelivery = useRef(0);
  const [view, setView] = useState<View>(initialView);
  const [mode, setMode] = useState('3d');
  const [tab, setTab] = useState('studio');
  const [tool, setTool] = useState('rotate');
  const [markMethod, setMarkMethod] = useState<'rectangle' | 'freehand'>(
    'rectangle',
  );
  const [eraseMarks, setEraseMarks] = useState(false);
  const [color, setColor] = useState('#71826c');
  const colorMatches = useMemo(
    () => colorPixels(skin, color),
    [skin.pixels, skin.model, color],
  );
  const [mirror, setMirror] = useState(false);
  const [labels, setLabels] = useState(false);
  const [context, setContext] = useState<EditContext>(emptyContext);
  const contextRef = useRef(context);
  const selection = context.selection;
  function notifyAction(kind: UserAction['kind']) {
    channel.publish({
      kind,
      skinRevision: skinRef.current.revision,
      contextRevision: contextRef.current.revision,
    });
  }
  function updateContext(patch: Partial<EditContext>, fromUser = true) {
    const next = {
      ...contextRef.current,
      ...patch,
      revision: contextRef.current.revision + 1,
    };
    contextRef.current = next;
    setContext(next);
    if (fromUser)
      notifyAction(
        patch.messages
          ? 'message'
          : patch.mask
            ? 'mask'
            : 'selection' in patch
              ? 'selection'
              : 'context',
      );
  }
  function setSelection(selection?: Selection, fromUser = true) {
    updateContext({ selection }, fromUser);
  }
  const [journal, setJournal] = useState<Journal>(emptyJournal);
  const journalRef = useRef(journal);
  function updateJournal(j: Journal) {
    journalRef.current = j;
    setJournal(j);
  }
  const [grid, setGrid] = useState(true);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [calls, setCalls] = useState<AgentCall[]>([]);
  const activityId = useRef(0);
  const activity = calls.some(
    (c) => c.status === 'running' && c.name !== 'wait_for_user_action',
  );
  const lastCompletedCall = calls
    .filter((c) => c.status === 'done' && c.name !== 'wait_for_user_action')
    .at(-1);
  function sendMessage(text: string) {
    const c = contextRef.current;
    const messages = enqueueMessage(c.messages, {
      id: crypto.randomUUID(),
      text,
      createdAt: Date.now(),
      readAt: null,
      skinRevision: skinRef.current.revision,
      contextRevision: c.revision + 1,
      selection: c.selection ? { ...c.selection } : undefined,
      mask: [...c.mask],
    });
    updateContext({ messages, brief: text });
  }
  function cancelMessage(id: string) {
    const messages = contextRef.current.messages.filter(
      (m) => m.id !== id || m.readAt !== null,
    );
    updateContext({ messages, brief: messages.at(-1)?.text ?? '' });
  }
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
      notifyAction('edit');
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
  const runRef = useRef<(n: string, i: any, signal?: AbortSignal) => any>(
    () => {},
  );
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
    if (author === 'user' && !stroke.current) notifyAction('edit');
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
  function checkout(cursor: number, author: Author = 'user') {
    const result = travel(journalRef.current, skinRef.current, cursor);
    updateJournal(result.journal);
    return commit(result.skin, false, author);
  }
  function history(which: 'undo' | 'redo', author: Author = 'user') {
    return checkout(
      Math.max(
        0,
        Math.min(
          journalRef.current.entries.length,
          journalRef.current.cursor + (which === 'undo' ? -1 : 1),
        ),
      ),
      author,
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
    setSelection(undefined, author === 'user');
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
    setSelection(undefined, author === 'user');
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
  runRef.current = async (name, input, signal) => {
    const s = skinRef.current;
    if (
      stroke.current &&
      ![
        'get_skin_state',
        'get_uv_atlas',
        'get_edit_context',
        'read_history',
        'read_region',
        'wait_for_user_action',
      ].includes(name)
    )
      throw Error('A user stroke is in progress. Retry after it ends.');
    switch (name) {
      case 'get_skin_state':
        return {
          ...s,
          selection: selection ?? null,
          view,
          mode,
          activeColor: color,
          colorMatchCount: colorMatches.length,
        };
      case 'wait_for_user_action':
        return await channel.wait(
          input.afterVersion,
          input.timeoutMs ?? 15000,
          signal,
        );
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
        setSelection({ ...r, region: r.id }, false);
        setView((v) => ({ ...v, layer: r.layer }));
        return { selection: r };
      }
      case 'set_view': {
        if (
          (input.pose && !Object.keys(poseLabels).includes(input.pose)) ||
          (input.layer && !['base', 'overlay'].includes(input.layer)) ||
          (input.mode && !['2d', '3d', 'split'].includes(input.mode)) ||
          (input.model && !['classic', 'slim'].includes(input.model)) ||
          (input.color !== undefined &&
            (typeof input.color !== 'string' ||
              !/^#[0-9a-f]{6}$/i.test(input.color))) ||
          (input.visibleParts !== undefined &&
            (!Array.isArray(input.visibleParts) ||
              input.visibleParts.some((p: any) => !parts.includes(p)))) ||
          ['showBase', 'showOverlay'].some(
            (k) => input[k] !== undefined && typeof input[k] !== 'boolean',
          )
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
          ...(input.visibleParts
            ? {
                visible: Object.fromEntries(
                  parts.map((p) => [p, input.visibleParts.includes(p)]),
                ) as View['visible'],
              }
            : {}),
          ...(typeof input.showBase === 'boolean'
            ? { showBase: input.showBase }
            : {}),
          ...(typeof input.showOverlay === 'boolean'
            ? { showOverlay: input.showOverlay }
            : {}),
        }));
        if (input.mode) setMode(input.mode);
        if (input.color) setColor(input.color.toLowerCase());
        return { updated: true };
      }
      case 'undo':
        return history('undo', 'agent');
      case 'redo':
        return history('redo', 'agent');
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
          setColor(skinPalette(s)[0] ?? '#71826c');
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
      toolDefinitions(async (n, i, signal) => {
        if (
          !readyRef.current &&
          !['get_uv_atlas', 'get_skin_state'].includes(n)
        )
          throw Error('Draft is still loading');
        const id = ++activityId.current;
        setCalls((c) => [
          ...c
            .filter((x) => x.status === 'running')
            .concat(c.filter((x) => x.status !== 'running').slice(-11)),
          { id, name: n, status: 'running', startedAt: Date.now() },
        ]);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        try {
          const result = await runRef.current(
            n,
            i,
            signal
              ? AbortSignal.any([signal, lifecycle.signal])
              : lifecycle.signal,
          );
          if (lifecycle.signal.aborted || signal?.aborted)
            throw Error('Agent call cancelled');
          const c = contextRef.current;
          const pending = c.messages.filter((m) => m.readAt === null);
          const deliveredAt = Date.now();
          const userUpdates = {
            ...channel.snapshot(lastDelivery.current),
            skinRevision: skinRef.current.revision,
            contextRevision: c.revision,
            messages: pending.map((m) => ({ ...m, readAt: deliveredAt })),
            delivery:
              'Returned by this tool; not a background interruption. Re-read get_edit_context before editing after new user actions.',
          };
          if (pending.length) {
            const next = {
              ...c,
              messages: markMessagesRead(
                c.messages,
                pending.map((m) => m.id),
                deliveredAt,
              ),
            };
            contextRef.current = next;
            setContext(next);
          }
          lastDelivery.current = channel.version;
          setCalls((c) =>
            c.map((call) =>
              call.id === id
                ? { ...call, status: 'done', endedAt: Date.now() }
                : call,
            ),
          );
          return { ...result, userUpdates };
        } catch (e) {
          setCalls((c) =>
            c.map((call) =>
              call.id === id
                ? { ...call, status: 'error', endedAt: Date.now() }
                : call,
            ),
          );
          setNotice((e as Error).message);
          throw e;
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
    if (tool === 'mark' && markMethod === 'rectangle') {
      const start = selectionStart.current ?? { x, y, region: r.id };
      if (start.region !== r.id) return;
      selectionStart.current = start;
      updateContext({
        selection: {
          x: Math.min(x, start.x),
          y: Math.min(y, start.y),
          width: Math.abs(x - start.x) + 1,
          height: Math.abs(y - start.y) + 1,
          region: r.id,
        },
        mask: [],
      });
      return;
    }
    if (tool === 'mark') {
      const mask = new Set(
        contextIndices(contextRef.current, skinRef.current.model),
      );
      if (!eraseMarks) mask.add(y * 64 + x);
      else mask.delete(y * 64 + x);
      updateContext({ mask: [...mask], selection: undefined });
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
                <TabsTrigger value="split">
                  <Columns2 />
                  Split
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className={`layer-bar ${view.layer}`}>
            <div
              className="layer-picker"
              role="group"
              aria-label="Editing layer"
            >
              {(['base', 'overlay'] as const).map((l) => {
                const visible = l === 'base' ? view.showBase : view.showOverlay;
                return (
                  <div
                    className={`layer-option ${view.layer === l ? 'active' : ''}`}
                    key={l}
                  >
                    <button
                      aria-pressed={view.layer === l}
                      onClick={() =>
                        setView({
                          ...view,
                          layer: l,
                          [l === 'base' ? 'showBase' : 'showOverlay']: true,
                        })
                      }
                    >
                      {l === 'base' ? 'Base skin' : 'Outer layer'}
                    </button>
                    <button
                      className="layer-eye"
                      aria-pressed={visible}
                      aria-label={`${visible ? 'Hide' : 'Show'} ${l === 'base' ? 'base skin' : 'outer layer'}`}
                      title="Show or hide this layer in 3D"
                      onClick={() =>
                        setView({
                          ...view,
                          [l === 'base' ? 'showBase' : 'showOverlay']: !visible,
                        })
                      }
                    >
                      {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                  </div>
                );
              })}
            </div>
            <span>
              {mode === '2d'
                ? 'Shared 64 × 64 grid'
                : view.layer === 'base'
                  ? 'Solid skin · green 3D grid'
                  : 'Raised overlay · violet 3D grid'}
            </span>
            <label className="setting">
              Pixel grid{' '}
              <Switch size="sm" checked={grid} onCheckedChange={setGrid} />
            </label>
          </div>
          <div
            className={`workbench ${mode === 'split' ? 'has-split' : ''} ${activity ? 'agent-painting' : ''}`}
          >
            {tool === 'mark' && (
              <div
                className="mark-methods"
                role="group"
                aria-label="Marking method"
              >
                <span>Mark area</span>
                <div className="mark-method-options">
                  {(['rectangle', 'freehand'] as const).map((method) => (
                    <button
                      key={method}
                      aria-pressed={markMethod === method}
                      onClick={() => {
                        setMarkMethod(method);
                        selectionStart.current = null;
                      }}
                      title={
                        method === 'rectangle'
                          ? 'Draw a new rectangular area'
                          : 'Refine the marked area pixel by pixel'
                      }
                    >
                      {method === 'rectangle' ? (
                        <Scan size={13} />
                      ) : (
                        <Pencil size={13} />
                      )}
                      {method === 'rectangle' ? 'Rectangle' : 'Freehand'}
                    </button>
                  ))}
                </div>
                {markMethod === 'freehand' && (
                  <button
                    className="mark-subtract"
                    aria-label="Erase marks"
                    aria-pressed={eraseMarks}
                    title="Remove pixels from the marked area"
                    onClick={() => setEraseMarks(!eraseMarks)}
                  >
                    <Eraser size={13} />
                    Erase
                  </button>
                )}
              </div>
            )}
            {activity ? (
              <div className="agent-scan" aria-hidden="true" />
            ) : (
              lastCompletedCall && (
                <div
                  key={lastCompletedCall.id}
                  className="agent-scan agent-echo"
                  aria-hidden="true"
                />
              )
            )}
            <aside className="tools">
              {[
                [MousePointer2, 'rotate', 'Rotate'],
                [Pencil, 'pencil', 'Pencil'],
                [Eraser, 'eraser', 'Eraser'],
                [Pipette, 'pipette', 'Pick color'],
                [PaintBucket, 'fill', 'Fill face'],
                [Scan, 'mark', 'Mark area'],
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
            <div className={`preview-area ${mode === 'split' ? 'split' : ''}`}>
              {mode !== '2d' && (
                <div className="preview-pane preview-3d" key="3d">
                  {mode === 'split' && <span className="pane-label">3D</span>}
                  <SkinView
                    skin={skin}
                    view={view}
                    paint={tool !== 'rotate'}
                    grid={grid}
                    mask={context.mask}
                    selected={selection}
                    colorMatches={colorMatches}
                    onStart={startStroke}
                    onEnd={endStroke}
                    onPixel={pixel}
                  />
                </div>
              )}
              {mode !== '3d' && (
                <div className="preview-pane preview-2d" key="2d">
                  {mode === 'split' && (
                    <span className="pane-label">UV · 64 × 64</span>
                  )}
                  <AtlasView
                    skin={skin}
                    selected={selection}
                    labels={labels}
                    grid={grid}
                    mask={context.mask}
                    colorMatches={colorMatches}
                    onStart={startStroke}
                    onPixel={pixel}
                    onEnd={endStroke}
                  />
                </div>
              )}
            </div>
            <aside className="inspector">
              {mode !== '2d' && (
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
                    onClick={() =>
                      setView({ ...view, animated: !view.animated })
                    }
                  >
                    {view.animated ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                </div>
              )}
              <section className="rail-group">
                <div className="rail-heading">
                  <span>Color</span>
                  <small
                    className="color-match-count"
                    title="Pixels of the selected color, highlighted in both views"
                    role="status"
                  >
                    {colorMatches.length} px
                  </small>
                </div>
                <div className="swatches">
                  {swatches.map((c) => (
                    <button
                      key={c}
                      style={{ background: c }}
                      aria-label={`Use ${c}`}
                      aria-pressed={color.toLowerCase() === c}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
                {context.palette.length > 0 && (
                  <div className="saved-swatch-row" aria-label="Saved colors">
                    {context.palette.map((c) => (
                      <button
                        key={c}
                        style={{ background: c }}
                        aria-label={`Use saved ${c}`}
                        aria-pressed={color.toLowerCase() === c.toLowerCase()}
                        onClick={() => setColor(c)}
                      />
                    ))}
                  </div>
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
                        setColor(e.target.value.toLowerCase());
                      else e.target.value = color.toUpperCase();
                    }}
                  />
                  <button
                    title="Save color"
                    aria-label="Save color"
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
              </section>
              {mode !== '2d' && (
                <VisibilityControls
                  view={view}
                  onChange={(visible) => setView({ ...view, visible })}
                />
              )}
              <section className="rail-group paint-options">
                <div className="rail-heading">
                  <span>Paint</span>
                </div>
                <div className="rail-toggles">
                  <button
                    aria-pressed={mirror}
                    onClick={() => setMirror(!mirror)}
                  >
                    <FlipHorizontal2 size={13} />
                    Mirror
                  </button>
                  {mode !== '3d' && (
                    <button
                      aria-pressed={labels}
                      onClick={() => setLabels(!labels)}
                    >
                      <Grid2X2 size={13} />
                      UV labels
                    </button>
                  )}
                </div>
                <Tabs
                  value={skin.model}
                  onValueChange={(v) => convert(v as Model)}
                >
                  <TabsList aria-label="Body model">
                    <TabsTrigger value="classic">Classic</TabsTrigger>
                    <TabsTrigger value="slim">Slim</TabsTrigger>
                  </TabsList>
                </Tabs>
              </section>
              {selection?.region && (
                <p className="surface-location">{selection.region}</p>
              )}
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
          <AgentDock
            context={context}
            calls={calls}
            connected={mcp === 'Agent ready'}
            ready={ready}
            tool={tool}
            onTool={setTool}
            onSend={sendMessage}
            onCancel={cancelMessage}
            onClear={() => updateContext({ selection: undefined, mask: [] })}
            onScope={(limitToContext) => updateContext({ limitToContext })}
            historyCount={journal.entries.length}
          >
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
          </AgentDock>
          <footer>
            <span>
              {mode !== '2d'
                ? tool === 'rotate'
                  ? 'Drag to rotate · Scroll to zoom'
                  : 'Drag on skin to edit · Drag outside to rotate'
                : 'Pixel-perfect · Mark an area for your agent'}
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
