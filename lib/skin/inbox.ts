import type { Selection } from './workspace';
export type AgentMessage = {
  id: string;
  text: string;
  createdAt: number;
  readAt: number | null;
  completedAt?: number;
  skinRevision: number;
  contextRevision: number;
  selection?: Selection;
  mask: number[];
};
export function enqueueMessage(
  messages: AgentMessage[],
  message: AgentMessage,
): AgentMessage[] {
  const next = [...messages];
  if (next.length >= 16) {
    const index = next.findIndex((m) => m.completedAt !== undefined);
    if (index < 0)
      throw Error(
        'Your queue is full. Complete or cancel a request before adding another.',
      );
    next.splice(index, 1);
  }
  return [...next, message];
}
export function markMessagesRead(
  messages: AgentMessage[],
  ids: string[],
  time = Date.now(),
): AgentMessage[] {
  const selected = new Set(ids);
  return messages.map((m) =>
    m.readAt === null && selected.has(m.id) ? { ...m, readAt: time } : m,
  );
}
export function validateMessages(raw: unknown): AgentMessage[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 16)
    throw Error('Invalid message queue');
  const ids = new Set<string>();
  for (const m of raw) {
    if (
      !m ||
      typeof m.id !== 'string' ||
      m.id.length > 80 ||
      ids.has(m.id) ||
      typeof m.text !== 'string' ||
      !m.text.trim() ||
      m.text.length > 4000 ||
      !Number.isFinite(m.createdAt) ||
      (m.readAt !== null && !Number.isFinite(m.readAt)) ||
      (m.completedAt !== undefined && !Number.isFinite(m.completedAt)) ||
      ![m.skinRevision, m.contextRevision].every(
        (v) => Number.isInteger(v) && v >= 0,
      ) ||
      !Array.isArray(m.mask) ||
      m.mask.length > 4096 ||
      m.mask.some(
        (p: unknown) =>
          !Number.isInteger(p) || Number(p) < 0 || Number(p) > 4095,
      )
    )
      throw Error('Invalid queued message');
    ids.add(m.id);
    const s = m.selection;
    if (
      s &&
      (![s.x, s.y, s.width, s.height].every(Number.isInteger) ||
        s.x < 0 ||
        s.y < 0 ||
        s.width < 1 ||
        s.height < 1 ||
        s.x + s.width > 64 ||
        s.y + s.height > 64 ||
        (s.region !== undefined && typeof s.region !== 'string'))
    )
      throw Error('Invalid message selection');
  }
  return raw;
}
export type UserAction = {
  version: number;
  kind: 'message' | 'selection' | 'mask' | 'edit' | 'history' | 'context';
  skinRevision: number;
  contextRevision: number;
  time: number;
};
export class UserActionChannel {
  version = 0;
  private events: UserAction[] = [];
  private listeners = new Set<() => void>();
  publish(event: Omit<UserAction, 'version' | 'time'>) {
    this.events = [
      ...this.events.slice(-31),
      { ...event, version: ++this.version, time: Date.now() },
    ];
    for (const wake of [...this.listeners]) wake();
  }
  snapshot(after = 0) {
    return {
      version: this.version,
      changed: this.version > after,
      events: this.events.filter((e) => e.version > after),
      truncated: !!this.events.length && after < this.events[0].version - 1,
    };
  }
  wait(
    after: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<ReturnType<UserActionChannel['snapshot']>> {
    if (!Number.isInteger(after) || after < 0 || after > this.version)
      throw Error('Read the current userUpdates.version before waiting.');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 25000)
      throw Error('timeoutMs must be between 0 and 25000.');
    if (signal?.aborted) return Promise.reject(Error('Agent listener closed'));
    if (this.version > after || timeoutMs === 0)
      return Promise.resolve(this.snapshot(after));
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(wake);
        signal?.removeEventListener('abort', abort);
      };
      const wake = () => {
        cleanup();
        resolve(this.snapshot(after));
      };
      const abort = () => {
        cleanup();
        reject(Error('Agent listener closed'));
      };
      const timer = setTimeout(wake, timeoutMs);
      this.listeners.add(wake);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
}

export function completeMessages(
  messages: AgentMessage[],
  ids: string[],
  time = Date.now(),
): AgentMessage[] {
  if (
    !ids.length ||
    ids.some((id) => !messages.some((m) => m.id === id && m.readAt !== null))
  )
    throw Error('Only read messages from this skin session can be completed');
  const selected = new Set(ids);
  return messages.map((m) =>
    selected.has(m.id) ? { ...m, completedAt: time } : m,
  );
}
