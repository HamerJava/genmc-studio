'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Sparkles,
  ArrowUp,
  Scan,
  Check,
  Clock3,
  X,
  History,
  ChevronDown,
  Activity,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
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
    get_skin_state: 'Reading skin',
    get_edit_context: 'Reading your context',
    get_uv_atlas: 'Reading body map',
    read_region: 'Inspecting pixels',
    read_history: 'Reading edit history',
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
  connected,
  ready,
  tool,
  onTool,
  onSend,
  onCancel,
  onClear,
  onScope,
  historyCount,
  children,
}: {
  context: EditContext;
  calls: AgentCall[];
  connected: boolean;
  ready: boolean;
  tool: string;
  onTool: (tool: string) => void;
  onSend: (text: string) => void;
  onCancel: (id: string) => void;
  onClear: () => void;
  onScope: (value: boolean) => void;
  historyCount: number;
  children: ReactNode;
}) {
  const [text, setText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');
  const queue = useRef<HTMLDivElement>(null);
  const latestMessage = context.messages.at(-1)?.id;
  useEffect(() => {
    if (queue.current) queue.current.scrollLeft = queue.current.scrollWidth;
  }, [latestMessage]);
  const active = calls.filter((c) => c.status === 'running');
  const current =
    active.find((c) => c.name !== 'wait_for_user_action') ??
    active[0] ??
    calls.at(-1);
  const working = active.some((c) => c.name !== 'wait_for_user_action');
  const waiting = active.some((c) => c.name === 'wait_for_user_action');
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
      aria-label="Agent workspace"
    >
      <div className="dock-heading">
        <div className="dock-identity">
          <span
            key={`${current?.id ?? 0}-${current?.status ?? 'idle'}`}
            className={`agent-orb ${current?.status === 'done' ? 'agent-call-finish' : ''}`}
            aria-hidden="true"
          >
            <Sparkles size={14} />
          </span>
          <strong>Agent</strong>
          <span className="dock-status" role="status">
            {active.length
              ? callLabel(current!.name)
              : current
                ? current.status === 'error'
                  ? 'Action failed'
                  : 'Ready for your next idea'
                : connected
                  ? 'Connected'
                  : 'Open in a WebMCP browser'}
          </span>
          {working && (
            <span className="signal-wave" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} style={{ animationDelay: `${i * 90}ms` }} />
              ))}
            </span>
          )}
        </div>
        <div className="dock-buttons">
          <details className="tool-trace">
            <summary aria-label="Agent function activity">
              <Activity size={14} />
              <span>Activity</span>
              <ChevronDown size={11} />
            </summary>
            <div className="tool-trace-list">
              {calls.length ? (
                calls
                  .slice()
                  .reverse()
                  .map((c) => (
                    <div key={c.id}>
                      <span>
                        {c.status === 'running' ? (
                          <Clock3 size={12} />
                        ) : c.status === 'done' ? (
                          <Check size={12} />
                        ) : (
                          <X size={12} />
                        )}
                        <code>{c.name}</code>
                      </span>
                      <small>
                        {c.status === 'running'
                          ? 'Running'
                          : c.status === 'done'
                            ? 'Done'
                            : 'Failed'}
                      </small>
                    </div>
                  ))
              ) : (
                <p>No agent calls yet.</p>
              )}
            </div>
          </details>
          <button
            aria-expanded={showHistory}
            onClick={() => setShowHistory(!showHistory)}
          >
            <History size={14} />
            <span>History</span>
            <small>{historyCount}</small>
          </button>
        </div>
      </div>
      {!!context.messages.length && (
        <div
          ref={queue}
          className="message-queue"
          aria-label="Message queue"
          aria-live="polite"
        >
          {context.messages.map((m) => (
            <details
              className={`queued-message ${m.readAt === null ? 'unread' : 'read'}`}
              key={m.id}
            >
              <summary>
                <span className="message-text">{m.text}</span>
                <small
                  title={
                    m.readAt === null
                      ? 'Waiting for an agent tool call'
                      : 'Delivered in a WebMCP tool response'
                  }
                >
                  {m.readAt === null ? (
                    <Clock3 size={11} />
                  ) : (
                    <Check size={11} />
                  )}{' '}
                  {m.readAt === null ? 'Queued' : 'Read'}
                </small>
              </summary>
              <div className="message-body">
                <p>{m.text}</p>
                <small>
                  {m.mask.length
                    ? `${m.mask.length} mask pixels`
                    : (m.selection?.region ?? 'Whole skin')}{' '}
                  · revision {m.skinRevision}
                </small>
                {m.readAt === null && (
                  <button
                    aria-label={`Cancel message: ${m.text}`}
                    onClick={() => onCancel(m.id)}
                  >
                    <X size={12} />
                    Cancel
                  </button>
                )}
              </div>
            </details>
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
        <textarea
          aria-label="Message to agent"
          rows={1}
          maxLength={4000}
          placeholder="What should your agent change?"
          value={text}
          disabled={!ready}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="send-message"
          type="submit"
          aria-label="Queue message"
          disabled={!ready || !text.trim()}
        >
          <ArrowUp size={17} />
        </button>
      </form>
      {error && (
        <p role="alert" className="dock-error">
          {error}
        </p>
      )}
      <div className="dock-context">
        <div>
          <button
            title="Select an area"
            aria-label="Select area for agent"
            aria-pressed={tool === 'select'}
            onClick={() => onTool('select')}
          >
            <Scan size={13} />
          </button>
          <button
            title="Paint a mask"
            aria-label="Mask pen for agent"
            aria-pressed={tool === 'mask'}
            onClick={() => onTool('mask')}
          >
            <Sparkles size={13} />
          </button>
          <span>
            {context.mask.length
              ? `${context.mask.length} pixels marked`
              : context.selection
                ? `${context.selection.width} × ${context.selection.height} · ${context.selection.region}`
                : 'Whole skin'}
          </span>
          {(context.mask.length > 0 || context.selection) && (
            <button aria-label="Clear marks" onClick={onClear}>
              <X size={12} />
            </button>
          )}
        </div>
        <label>
          Stay inside marks
          <Switch
            size="sm"
            checked={context.limitToContext}
            onCheckedChange={onScope}
          />
        </label>
      </div>
      <p className="delivery-note">
        {waiting
          ? 'Your agent is listening for new actions.'
          : 'Messages reach your agent on its next tool call.'}
      </p>
      {showHistory && <div className="dock-history">{children}</div>}
    </section>
  );
}
