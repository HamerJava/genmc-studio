'use client';
import { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Sparkles, Pencil, Dot } from 'lucide-react';
import type { Journal } from '@/lib/skin/workspace';
// A Fusion-style strip: one node per edit, left to right, with the playhead
// sitting after the last applied step. Clicking a node travels to it.
export default function Timeline({
  journal,
  onCheckout,
  onUndo,
  onRedo,
}: {
  journal: Journal;
  onCheckout: (cursor: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const { entries, cursor } = journal;
  const [filter, setFilter] = useState<'all' | 'user' | 'agent'>('all');
  // Retain the original position: filtering must never change history targets.
  const visible = entries
    .map((entry, index) => ({ entry, position: index + 1 }))
    .filter(({ entry }) => filter === 'all' || entry.author === filter);
  useEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [entries.length, filter]);
  return (
    <div className="timeline" aria-label="Edit timeline">
      <div
        className="seg tl-filter"
        role="group"
        aria-label="Timeline author filter"
      >
        {(
          [
            ['all', 'All'],
            ['user', 'You'],
            ['agent', 'AI'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`${filter === value ? 'selected' : ''} ${value === 'agent' ? 'agent-filter' : ''}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        className="tl-step"
        title="Undo (⌘Z)"
        aria-label="Undo"
        disabled={!cursor}
        onClick={onUndo}
      >
        <Undo2 size={14} />
      </button>
      <button
        className="tl-step"
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
        disabled={cursor === entries.length}
        onClick={onRedo}
      >
        <Redo2 size={14} />
      </button>
      <div className="tl-track" ref={track}>
        <button
          className={`tl-node start ${cursor === 0 ? 'current' : ''}`}
          title="Original skin"
          aria-label="Back to the original skin"
          onClick={() => onCheckout(0)}
        >
          <Dot size={14} />
        </button>
        {visible.map(({ entry: e, position }) => (
          <button
            key={e.id}
            className={`tl-node ${e.author} ${position > cursor ? 'future' : ''} ${position === cursor ? 'current' : ''}`}
            title={`${e.label} · ${e.author === 'agent' ? 'Agent' : 'You'} · ${e.pixels.length} px`}
            aria-label={`Step ${position}: ${e.label}`}
            onClick={() => onCheckout(position)}
          >
            {e.author === 'agent' ? (
              <Sparkles size={12} />
            ) : (
              <Pencil size={12} />
            )}
          </button>
        ))}
        {!visible.length && (
          <span className="tl-empty" role="status">
            {filter === 'agent'
              ? 'No AI edits yet'
              : filter === 'user'
                ? 'No edits from you yet'
                : 'No edits yet'}
          </span>
        )}
      </div>
      <span
        className="tl-count"
        title="Position in the complete shared history"
      >
        {entries.length
          ? `${cursor}/${entries.length}${filter !== 'all' ? ` · ${visible.length} visible` : ''}`
          : ''}
      </span>
    </div>
  );
}
