'use client';
import { useState } from 'react';
import { Sparkles, ArrowUp, X } from 'lucide-react';
import type { EditContext } from '@/lib/skin/workspace';
export type AgentCall = {
  id: number;
  name: string;
  status: 'running' | 'done' | 'error';
  startedAt: number;
  endedAt?: number;
};
export const callLabel = (name: string) =>
  ({
    export_skin_images: 'Rendering skin images',
    create_skin: 'Creating a new skin',
    select_skin: 'Switching skin session',
    complete_requests: 'Completing requests',
    get_skin_state: 'Reading skin',
    get_edit_context: 'Reading your context',
    get_uv_atlas: 'Reading body map',
    read_region: 'Inspecting pixels',
    apply_operations: 'Painting skin',
    set_selection: 'Selecting a region',
    set_view: 'Adjusting preview',
    undo: 'Undoing an edit',
    redo: 'Restoring an edit',
    list_skins: 'Exploring templates',
    read_gallery_skin: 'Reading template',
    use_template: 'Opening template',
    prepare_publish: 'Preparing preview',
    wait_for_user_action: 'Listening for your changes',
  })[name] ?? name.replaceAll('_', ' ');
export default function AgentDock({
  context,
  calls,
  status,
  connected,
  ready,
  hint,
  onSend,
  onCancel,
  onClear,
  onScope,
  onHelp,
}: {
  context: EditContext;
  calls: AgentCall[];
  status: string;
  connected: boolean;
  ready: boolean;
  hint: string;
  onSend: (text: string) => void;
  onCancel: (id: string) => void;
  onClear: () => void;
  onScope: (value: boolean) => void;
  onHelp: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const active = calls.filter((c) => c.status === 'running');
  const current =
    active.find((c) => c.name !== 'wait_for_user_action') ??
    active[0] ??
    calls.at(-1);
  const working = active.some((c) => c.name !== 'wait_for_user_action');
  const waiting = active.some((c) => c.name === 'wait_for_user_action');
  const openMessages = context.messages.filter(m => m.completedAt === undefined);
  const marks = context.mask.length
    ? `${context.mask.length} px marked`
    : context.selection
      ? `${context.selection.width} × ${context.selection.height} · ${context.selection.region}`
      : '';
  const send = () => {
    if (!text.trim() || !ready) return;
    try {
      onSend(text.trim());
      setText('');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section
      className={`agent-dock ${working ? 'is-working' : waiting ? 'is-listening' : ''}`}
      aria-label="Agent"
    >
      {!!openMessages.length && (
        <div
          className="message-queue"
          aria-label="Message queue"
          aria-live="polite"
        >
          {openMessages.map((m) => (
            <div
              className={`queued-message ${m.readAt === null ? 'unread' : 'read'}`}
              key={`${m.id}:${m.readAt ?? 'queued'}`}
              title={`${m.text}\n${m.mask.length ? `${m.mask.length} mask pixels` : (m.selection?.region ?? 'Whole skin')} · revision ${m.skinRevision}`}
            >
              <span className="message-text">{m.text}</span>
              <small>{m.readAt === null ? 'Queued' : 'Read'}</small>
              {m.completedAt === undefined && (
                <button
                  aria-label={`Cancel message: ${m.text}`}
                  title="Cancel"
                  onClick={() => onCancel(m.id)}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <form
        className="agent-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <button
          type="button"
          className={`agent-orb ${current?.status === 'done' ? 'agent-call-finish' : ''}`}
          title={status}
          aria-label={`Agent connection: ${status}`}
          onClick={onHelp}
        >
          <Sparkles size={14} />
          <i className={connected ? 'dot ready' : 'dot'} aria-hidden="true" />
        </button>
        <textarea
          aria-label="Message to agent"
          rows={1}
          maxLength={4000}
          placeholder="What should your agent change?"
          value={text}
          disabled={!ready}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        {marks && (
          <>
            <span className="chip mark-chip">
              {marks}
              <button
                type="button"
                aria-label="Clear marks"
                title="Clear marks"
                onClick={onClear}
              >
                <X size={11} />
              </button>
            </span>
            <button
              type="button"
              className={context.limitToContext ? 'chip on' : 'chip'}
              aria-pressed={context.limitToContext}
              title="Optional: restrict agent edits to your marks. Otherwise marks are context only."
              onClick={() => onScope(!context.limitToContext)}
            >
              Stay inside marks
            </button>
          </>
        )}
        <button
          className="send-message"
          type="submit"
          aria-label="Queue message"
          disabled={!ready || !text.trim()}
        >
          <ArrowUp size={17} />
        </button>
      </form>
      <div className="dock-meta">
        <span className="dock-status" role="status">
          {error ||
            (active.length
              ? callLabel(current!.name)
              : current
                ? current.status === 'error'
                  ? 'Action failed'
                  : 'Ready for your next idea'
                : status)}
        </span>
        {!!calls.length && (
          <span className="call-dots" aria-hidden="true">
            {calls.slice(-9).map((c) => (
              <i key={c.id} className={c.status} title={callLabel(c.name)} />
            ))}
          </span>
        )}
        <span className="dock-hint">{hint}</span>
      </div>
    </section>
  );
}
