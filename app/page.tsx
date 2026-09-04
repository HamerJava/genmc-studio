'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Pencil,
  Plus,
  Download,
  Upload,
  Box,
  Grid2X2,
  Eraser,
  PaintBucket,
  Scan,
  FlipHorizontal2,
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
  MAX_SAVED_COLORS,
  emptyContext,
  emptyJournal,
  recordChange,
  travel,
  describeContext,
  addMaskRegion,
  enforceContext,
  validateWorkspace,
  type EditContext,
  type Journal,
  type Author,
  type Selection,
} from '@/lib/skin/workspace';
import { skinPalette } from '@/lib/skin/palette';
import {
  completeMessages,
  enqueueMessage,
  markMessagesRead,
  UserActionChannel,
  type UserAction,
} from '@/lib/skin/inbox';
import { visualTargets, regionLabel, visualDuration, type AgentVisual } from '@/lib/skin/agent-visual';
import AgentDock, { callLabel, type AgentCall } from '@/components/studio/agent-dock';
import ThemeToggle from '@/components/studio/theme-toggle';
import AtlasView from '@/components/studio/atlas-view';
import Timeline from '@/components/studio/timeline';
const SkinView = dynamic(() => import('@/components/studio/skin-view'), {
  ssr: false,
});
const initialView: View = {
  pose: 'walk',
  layer: 'overlay',
  visible: allVisible,
  showOverlay: true,
  showBase: true,
};
const poseLabels = {
  stand: 'Stand',
  walk: 'Walk',
};
const partLabels: Record<string, string> = {
  head: 'Head',
  body: 'Body',
  right_arm: 'R arm',
  left_arm: 'L arm',
  right_leg: 'R leg',
  left_leg: 'L leg',
};
// One segmented control for every either/or choice in the studio, so the
// interface never needs a dropdown to switch mode, layer, pose or model.
function Seg({
  value,
  onChange,
  options,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string, React.ComponentType<{ size?: number }>?][];
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([id, text, Icon]) => (
        <button
          key={id}
          aria-pressed={value === id}
          className={value === id ? 'selected' : ''}
          onClick={() => onChange(id)}
        >
          {Icon && <Icon size={13} />}
          {text}
        </button>
      ))}
      {children}
    </div>
  );
}
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
  const [sessionId, setSessionId] = useState('');
  const sessionRef = useRef('');
  const switching = useRef(false);
  const [sessions, setSessions] = useState<{id:string;name:string;sourceId?:string}[]>([]);
  const [channel, setChannel] = useState(() => new UserActionChannel());
  const lastDelivery = useRef(0);
  const [view, setView] = useState<View>(initialView);
  const [mode, setMode] = useState('3d');
  const [tab, setTab] = useState('studio');
  const [tool, setTool] = useState('select');
  const [markMethod, setMarkMethod] = useState('rectangle');
  const [color, setColor] = useState('#737373');
  const [mirror, setMirror] = useState(false);
  const [labels, setLabels] = useState(false);
  const [context, setContext] = useState<EditContext>(emptyContext);
  const contextRef = useRef(context);
  const selection = context.selection;
  // Skin colors and saved colors share one grid; saved ones keep a ring.
  const colors = useMemo(
    () => [...new Set([...swatches, ...context.palette].map(c => c.toLowerCase()))],
    [swatches, context.palette],
  );
  function notifyAction(kind: UserAction['kind']) {
    channel.publish({
      kind,
      skinRevision: skinRef.current.revision,
      contextRevision: contextRef.current.revision,
    });
  }
  function updateContext(patch: Partial<EditContext>, fromUser = true) {
    if (switching.current) return;
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
  const [calls, setCalls] = useState<AgentCall[]>([]);
  const activityId = useRef(0);
  const [agentVisual, setAgentVisual] = useState<AgentVisual>();
  useEffect(() => {
    if (!agentVisual || !['done', 'error'].includes(agentVisual.phase)) return;
    const timer = setTimeout(() => setAgentVisual(v => v?.id === agentVisual.id ? undefined : v), visualDuration + 300);
    return () => clearTimeout(timer);
  }, [agentVisual]);
  const activity = calls.some(
    (c) => c.status === 'running' && c.name !== 'wait_for_user_action',
  );
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
      (m) => m.id !== id || m.completedAt !== undefined,
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
    mask: number[];
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
    if (switching.current) return {revision:skinRef.current.revision};
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
    if (switching.current) return {revision:skinRef.current.revision};
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
  function installSession(data: any) {
    const next = validateSkin(data.skin);
    const workspace = validateWorkspace(data.skin.workspace);
    sessionRef.current = data.sessionId;
    setSessionId(data.sessionId);
    setSessions(data.sessions);
    skinRef.current = next; setSkin(next);
    contextRef.current = workspace.context; setContext(workspace.context);
    updateJournal(workspace.journal);
    setChannel(new UserActionChannel()); lastDelivery.current = 0;
    setCalls([]); setAgentVisual(undefined); setPublish(null);
    setView(initialView); selectionStart.current = null;
    setTool('select'); setTab('studio'); setSaved('Saved');
  }
  async function persistCurrent() {
    const snapshot = { ...skinRef.current, sessionId: sessionRef.current, workspace: { context: contextRef.current, journal: journalRef.current } };
    await saveChain.current.catch(() => {});
    await api('/api/draft', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(snapshot) });
  }
  async function switchSession(target: { id?:string; skin?:Skin }) {
    if (switching.current || stroke.current) throw Error('Finish the current action before switching skins');
    switching.current = true; readyRef.current = false; setReady(false);
    try {
      await persistCurrent();
      const data = target.id
        ? await api(`/api/draft?id=${encodeURIComponent(target.id)}`)
        : await api('/api/draft', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...target.skin,workspace:{context:emptyContext,journal:emptyJournal}})});
      installSession(data);
      // Persist the active pointer when resuming an existing session.
      await api('/api/draft', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data.skin,sessionId:data.sessionId})});
      return {sessionId:data.sessionId,revision:skinRef.current.revision,name:skinRef.current.name};
    } finally { switching.current=false; readyRef.current=true; setReady(true); }
  }
  async function useTemplate(id:string, expected=skinRef.current.revision, author:Author='user') {
    const origin = sessionRef.current;
    const data = await api('/api/draft');
    const existing = data.sessions.find((x:any) => x.sourceId === id);
    const template = existing ? undefined : validateSkin(await readGallery(id));
    if(origin !== sessionRef.current || expected !== skinRef.current.revision) throw Error('Skin changed while loading. Read the current session and try again.');
    return switchSession(existing ? {id:existing.id} : {skin:{...template!,sourceId:id,revision:0}});
  }
  async function selectSkin(input:any) {
    if (!['sessions','gallery'].includes(input.source)) throw Error('Choose sessions or gallery');
    const origin=sessionRef.current;
    if ((!input.id && !input.name) || (input.id && input.name)) throw Error('Supply exactly one id or name');
    const items = input.source === 'sessions'
      ? (await api('/api/draft')).sessions
      : [...[0,1,2].map(i=>({id:`starter-${i}`,name:makeSkin(i).name})), ...(await api(`/api/gallery${input.name ? `?name=${encodeURIComponent(input.name)}` : ''}`)).skins];
    if(origin !== sessionRef.current) throw Error('Skin session changed while searching');
    const matches = items.filter((item:any)=>input.id ? item.id===input.id : item.name.toLowerCase()===input.name.toLowerCase());
    if(input.id && input.source==='gallery' && !matches.length) return useTemplate(input.id);
    if(matches.length!==1) return {status:matches.length ? 'ambiguous' : 'not_found',candidates:matches.map((x:any)=>({id:x.id,name:x.name}))};
    return input.source==='sessions' ? switchSession({id:matches[0].id}) : useTemplate(matches[0].id);
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
    const readOnly = ['get_skin_state','get_edit_context','get_uv_atlas','read_history','read_region','wait_for_user_action','list_skins','read_gallery_skin','export_skin_images'].includes(name);
    if (!readOnly && input.expectedSessionId !== sessionRef.current) throw Error('Skin session changed: read get_skin_state and pass its sessionId as expectedSessionId');
    if (switching.current) throw Error('Skin session is switching');
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
      case 'export_skin_images': {
        if (input.expectedSessionId !== sessionRef.current || input.expectedRevision !== s.revision) throw Error('Skin or session changed: read get_skin_state before exporting');
        const snapshot = structuredClone(s);
        const origin = sessionRef.current;
        const {exportSkinPreviews} = await import('@/lib/skin/preview-export');
        if (origin !== sessionRef.current || snapshot.revision !== skinRef.current.revision) throw Error('Skin changed before rendering: read current state');
        return exportSkinPreviews(snapshot,input);
      }
      case 'create_skin': {
        if(typeof input.name !== 'string' || !input.name.trim() || input.name.length>80) throw Error('A skin name is required (max 80 characters)');
        const origin=sessionRef.current;
        const next=input.templateId ? validateSkin(await readGallery(input.templateId)) : {...makeSkin(),pixels:makeSkin().pixels.map(c=>c==='#00000000'?c:'#b8b8b8')};
        if(origin!==sessionRef.current) throw Error('Skin session changed while creating');
        return switchSession({skin:{...next,name:input.name.trim(),revision:0,sourceId:input.templateId}});
      }
      case 'select_skin': return selectSkin(input);
      case 'complete_requests': {
        if(input.expectedRevision!==s.revision) throw Error('Skin changed: read current state before completing requests');
        const messages=completeMessages(contextRef.current.messages,input.messageIds);
        updateContext({messages,brief:messages.filter(m=>m.completedAt===undefined).at(-1)?.text ?? ''},false);
        return {completed:input.messageIds};
      }
      case 'get_skin_state':
        return { ...s, sessionId:sessionRef.current, selection: selection ?? null, view, mode };
      case 'wait_for_user_action':
        return await channel.wait(
          input.afterVersion,
          input.timeoutMs ?? 25000,
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
        setView((v) => ({ ...v, layer: r.layer, partLayers: { ...v.partLayers, [r.part]: r.layer }, visible: { ...v.visible, [r.part]: true } }));
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
          ...(input.layer ? { layer: input.layer, partLayers: {} } : {}),
        }));
        if (input.mode) setMode(input.mode);
        return { updated: true };
      }
      case 'undo':
        return history('undo', 'agent');
      case 'redo':
        return history('redo', 'agent');
      case 'list_skins':
        return {
          sessions:(await api('/api/draft')).sessions,
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
        return useTemplate(input.id, input.expectedRevision, 'agent');
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
        installSession(d);
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
      if (switching.current || sessionId !== sessionRef.current) return;
      const snapshot = { ...skin, sessionId, workspace: { context, journal } };
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
  }, [skin, context, journal, ready, sessionId]);
  useEffect(() => {
    if (!sessionId) return;
    const boundSession = sessionId;
    const lifecycle = new AbortController();
    registerTools(
      toolDefinitions(async (n, i, signal) => {
        if (boundSession !== sessionRef.current) throw Error('This tool belongs to another skin session. Fetch the tools again.');
        const sessionSwitch = ['create_skin','select_skin','use_template'].includes(n);
        if (
          !readyRef.current &&
          !['get_uv_atlas', 'get_skin_state'].includes(n)
        )
          throw Error('Draft is still loading');
        const id = ++activityId.current;
        const before = skinRef.current;
        const showVisual = n !== 'wait_for_user_action';
        const targets = visualTargets(before.model, i);
        if (showVisual) setAgentVisual(v => v?.before && v.phase === 'done' && performance.now() - v.startedAt < visualDuration && !['apply_operations', 'undo', 'redo', 'use_template'].includes(n) ? v : { id, label: callLabel(n), ...targets, startedAt: performance.now(), phase: n === 'apply_operations' ? 'working' : 'reading' });
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
          if(boundSession !== sessionRef.current) throw Error('Skin session changed before this call started');
          const result = await runRef.current(
            n,
            i,
            signal
              ? AbortSignal.any([signal, lifecycle.signal])
              : lifecycle.signal,
          );
          if (sessionSwitch && boundSession !== sessionRef.current) return {...result,sessionId:sessionRef.current,next:'Read get_skin_state and fetch the new session tools before editing'};
          if (lifecycle.signal.aborted || signal?.aborted || boundSession !== sessionRef.current) throw Error('Agent call cancelled: skin session changed');
          if (showVisual) {
            const after = skinRef.current;
            const changed = after.pixels.flatMap((color, index) => color !== before.pixels[index] ? [index] : []);
            const changedRegions = atlas(after.model).filter(r => changed.some(i => i % 64 >= r.x && i % 64 < r.x + r.width && Math.floor(i / 64) >= r.y && Math.floor(i / 64) < r.y + r.height)).map(r => r.id);
            setAgentVisual(v => v?.id === id ? { ...v, phase: 'done', startedAt: performance.now(), label: changed.length ? `${changed.length} pixels updated` : `${callLabel(n)} · complete`, pixels: changed.length ? changed : targets.pixels, regions: changed.length ? changedRegions : targets.regions, before: changed.length ? before.pixels : undefined, revision: after.revision } : v);
          }
          const c = contextRef.current;
          const pending = c.messages.filter((m) => m.readAt === null);
          const deliveredAt = Date.now();
          const userUpdates = {
            sessionId:sessionRef.current,
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
          return { ...result, sessionId:sessionRef.current, userUpdates };
        } catch (e) {
          if(boundSession !== sessionRef.current) throw e;
          if (showVisual) setAgentVisual(v => v?.id === id ? { ...v, phase: 'error', label: 'Action failed · skin unchanged', startedAt: performance.now() } : v);
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
  }, [sessionId, channel]);
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
    if (!ready || switching.current) return;
    const r = regionAt(skinRef.current.model, x, y);
    if (!r) return;
    const activeLayer = view.partLayers?.[r.part] ?? view.layer;
    if (!view.visible[r.part] || activeLayer === 'hidden') return;
    if (tool === 'select') {
      if (r.layer !== activeLayer) return;
      if (markMethod === 'freehand') {
        const c = contextRef.current;
        const mask = new Set(c.mask);
        // Refine an existing face or rectangle without losing its marked pixels.
        if (c.selection) {
          const q = c.selection;
          for (let yy = q.y; yy < q.y + q.height; yy++)
            for (let xx = q.x; xx < q.x + q.width; xx++) mask.add(yy * 64 + xx);
        }
        mask.add(y * 64 + x);
        updateContext({ mask: [...mask], selection: undefined });
        return;
      }
      if (markMethod === 'face') {
        if (selectionStart.current) return;
        const c = contextRef.current;
        const mask = c.selection ? addMaskRegion(c.mask, c.selection) : c.mask;
        selectionStart.current = { x, y, region: r.id, mask };
        updateContext({ mask: addMaskRegion(mask, r), selection: undefined });
        return;
      }
      const c = contextRef.current;
      const start = selectionStart.current ?? { x, y, region: r.id, mask: c.selection ? addMaskRegion(c.mask, c.selection) : [...c.mask] };
      if (start.region !== r.id) return;
      selectionStart.current = start;
      updateContext({ mask: addMaskRegion(start.mask, {
        x: Math.min(x, start.x), y: Math.min(y, start.y),
        width: Math.abs(x - start.x) + 1, height: Math.abs(y - start.y) + 1,
      }), selection: undefined });
      return;
    }
    if (r.layer !== activeLayer) {
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
      await switchSession({skin:
        validateSkin({
          ...skinRef.current,
          pixels,
          name: file.name.replace(/\.png$/i, ''),
          revision: 0,
          sourceId: undefined,
        }),
      });
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
    <main className={tab === 'studio' ? 'studio' : ''}>
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
          <ThemeToggle />
          <button disabled={!ready} onClick={() => void switchSession({skin:{...makeSkin(),name:'Untitled skin',pixels:makeSkin().pixels.map(c=>c==='#00000000'?c:'#b8b8b8')}}).catch(e=>setNotice(e.message))} aria-label="New skin"><Plus size={15} />New skin</button>
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
          <div className="skin-session-picker"><label htmlFor="skin-session">Your skins</label><select id="skin-session" value={sessionId} disabled={!ready} onChange={e=>void switchSession({id:e.target.value}).catch(e=>setNotice(e.message))}>{sessions.map(item=><option key={item.id} value={item.id}>{item.id===sessionId ? skin.name : item.name}</option>)}</select><span>Separate agent session per skin</span></div>
          <div className="workspace-heading">
            <div>
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
            <Seg
              label="View mode"
              value={mode}
              onChange={(v) => {
                setMode(v);
                selectionStart.current = null;
              }}
              options={[
                ['3d', '3D', Box],
                ['2d', '2D', Grid2X2],
              ]}
            />
          </div>
          <div className={`layer-bar ${view.layer}`}>
            <button
              className={grid ? 'chip on' : 'chip'}
              aria-pressed={grid}
              onClick={() => setGrid(!grid)}
            >
              <Grid2X2 size={12} />
              Pixel grid
            </button>
          </div>
          {tool === 'select' && <div className="mark-options">
            <Seg label="Marking method" value={markMethod} onChange={(value) => { setMarkMethod(value); selectionStart.current = null; }} options={[[ 'face', 'Face', Box ], [ 'rectangle', 'Rectangle', Scan ], [ 'freehand', 'Freehand', Pencil ]]} />
            <span>{markMethod === 'face' ? 'Click a face to mark it' : markMethod === 'rectangle' ? 'Drag to mark an area' : 'Draw to add · start on a mark to erase'}</span>
          </div>}
          <div className={`workbench ${activity ? 'agent-painting' : ''}`}>
            {agentVisual && <div className={`agent-focus-status phase-${agentVisual.phase}`} role="status" aria-live="polite"><Sparkles size={16} /><span><strong>{agentVisual.label}</strong><small>{regionLabel(agentVisual.regions)}</small></span><span className="agent-phase">{agentVisual.phase === 'done' ? 'Complete' : agentVisual.phase === 'error' ? 'Failed' : 'Live'}</span></div>}
            <aside className="tools">
              {[
                [Pencil, 'pencil', 'Pencil'],
                [Eraser, 'eraser', 'Eraser'],
                [PaintBucket, 'fill', 'Fill face'],
                null,
                [Scan, 'select', 'Mark area'],
              ].map((entry: any, i) =>
                !entry ? (
                  <div className="divider" key={i} />
                ) : (
                  <ToolButton
                    key={entry[1]}
                    entry={entry}
                    active={tool === entry[1]}
                    onPick={() => {
                      setTool(entry[1]);
                      selectionStart.current = null;
                    }}
                  />
                ),
              )}
            </aside>
            {mode === '3d' ? (
              <SkinView
                skin={skin}
                agentVisual={agentVisual}
                markMethod={tool === 'select' ? markMethod : undefined}
                view={view}
                paint={true}
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
                agentVisual={agentVisual}
                markMethod={tool === 'select' ? markMethod : undefined}
                selected={selection}
                labels={labels}
                grid={grid}
                layer={view.layer}
                partLayers={view.partLayers}
                visibleParts={view.visible}
                mask={context.mask}
                onStart={startStroke}
                onPixel={pixel}
                onEnd={endStroke}
              />
            )}
            <aside className="inspector">
              {mode === '3d' && (
                <div className="seg pose-seg" role="group" aria-label="Pose">
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
                    className="seg-icon"
                    aria-pressed={!!view.animated}
                    aria-label={
                      view.animated ? 'Pause animation' : 'Play animation'
                    }
                    title={view.animated ? 'Pause animation' : 'Play animation'}
                    onClick={() =>
                      setView({ ...view, animated: !view.animated })
                    }
                  >
                    {view.animated ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                </div>
              )}
              <div className="rail-group">
                <span className="rail-label">Color</span>
                <div className="current-color">
                  <input
                    type="color"
                    className="color-well"
                    title="Pick a color"
                    aria-label="Pick a color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                  <input
                    className="hex"
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
                    className="save-color"
                    title={context.palette.length >= MAX_SAVED_COLORS ? 'Palette full (128 saved colors)' : 'Add color to palette'}
                    aria-label="Add color to palette"
                    disabled={context.palette.length >= MAX_SAVED_COLORS || context.palette.some(c => c.toLowerCase() === color.toLowerCase())}
                    onClick={() =>
                      updateContext({
                        palette: [
                          ...new Set([...context.palette.map(c => c.toLowerCase()), color.toLowerCase()]),
                        ],
                      })
                    }
                  >
                    +
                  </button>
                </div>
                <div className="swatches palette-swatches" aria-label="Color palette">
                  {colors.map((c) => (
                    <button
                      key={c}
                      className={context.palette.some(saved => saved.toLowerCase() === c) ? 'saved' : ''}
                      style={{ background: c }}
                      aria-label={`Use ${c}`}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
              <div className="rail-group body-parts">
                <div className="body-parts-heading"><span className="rail-label">Body parts</span><button onClick={() => setView(v => ({ ...v, partLayers: {}, visible: allVisible, layer: 'overlay', showBase: true, showOverlay: true }))}>Reset</button></div>
                <div className={`body-map model-${skin.model}`} role="group" aria-label="Body part layers">
                  {parts.map(p => {
                    const state = view.partLayers?.[p] ?? (view.visible[p] ? view.layer : 'hidden');
                    const next = state === 'base' ? 'overlay' : state === 'overlay' ? 'hidden' : 'base';
                    const label = state === 'overlay' ? 'Outer' : state === 'hidden' ? 'Hidden' : 'Base';
                    return <button key={p} className={`body-part part-${p} state-${state}`} title={`${partLabels[p]} · ${label} — click for ${next === 'overlay' ? 'Outer' : next === 'hidden' ? 'Hidden' : 'Base'}`} aria-label={`${partLabels[p]}: ${label}`} onClick={() => setView(v => ({ ...v, partLayers: { ...v.partLayers, [p]: next }, visible: { ...v.visible, [p]: next !== 'hidden' } }))}><span className="sr-only">{label}</span></button>;
                  })}
                </div>
                <div className="body-legend"><span>Base</span><span>Outer</span><span>Hidden</span></div>
                <p className="muted">Click a part to cycle layers</p>
              </div>
              <div className="rail-group">
                <span className="rail-label">Paint</span>
                <div className="chips">
                  <button
                    className={mirror ? 'chip on' : 'chip'}
                    aria-pressed={mirror}
                    onClick={() => setMirror(!mirror)}
                  >
                    <FlipHorizontal2 size={12} />
                    Mirror
                  </button>
                  {mode === '2d' && (
                    <button
                      className={labels ? 'chip on' : 'chip'}
                      aria-pressed={labels}
                      onClick={() => setLabels(!labels)}
                    >
                      UV labels
                    </button>
                  )}
                </div>
                <Seg
                  label="Body model"
                  value={skin.model}
                  onChange={(v) => convert(v as Model)}
                  options={[
                    ['classic', 'Classic'],
                    ['slim', 'Slim'],
                  ]}
                />
              </div>
              <p className="muted">
                64 × 64 · {skin.model}
                <br />
                {selection?.region ?? 'No selection'}
              </p>
              {selection && (
                <button
                  className="rail-action"
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
            key={`agent-${sessionId}`}
            context={context}
            calls={calls}
            status={mcp}
            connected={mcp === 'Agent ready'}
            ready={ready}
            hint={
              mode === '3d'
                ? 'Drag on the skin to edit · outside to rotate'
                : 'Pixel-perfect · select a region for your agent'
            }
            onSend={sendMessage}
            onCancel={cancelMessage}
            onClear={() => updateContext({ selection: undefined, mask: [] })}
            onScope={(limitToContext) => updateContext({ limitToContext, scopeExplicit: true })}
            onHelp={() => setHelp(true)}
          />
          <Timeline
            key={`timeline-${sessionId}`}
            journal={journal}
            onCheckout={checkout}
            onUndo={() => history('undo')}
            onRedo={() => history('redo')}
          />
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
function ToolButton({
  entry,
  active,
  onPick,
}: {
  entry: [any, string, string];
  active: boolean;
  onPick: () => void;
}) {
  const [Icon, , label] = entry;
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={active ? 'selected' : ''}
      onClick={onPick}
    >
      <Icon />
    </button>
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
