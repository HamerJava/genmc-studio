'use client';
import { parts, type Part } from '@/lib/skin/atlas';
import type { View } from '@/lib/skin/engine';
const names: Record<Part, string> = {
  head: 'Head',
  body: 'Body',
  right_arm: 'Right arm',
  left_arm: 'Left arm',
  right_leg: 'Right leg',
  left_leg: 'Left leg',
};
export default function VisibilityControls({
  view,
  onChange,
}: {
  view: View;
  onChange: (visible: View['visible']) => void;
}) {
  return (
    <section className="visibility-controls" aria-label="3D body visibility">
      <div className="rail-heading">
        <span>Body parts</span>
        <button
          className="show-all"
          onClick={() =>
            onChange(
              Object.fromEntries(
                parts.map((p) => [p, true]),
              ) as View['visible'],
            )
          }
        >
          Show all
        </button>
      </div>
      <div className="body-map">
        {parts.map((part) => (
          <button
            key={part}
            className={`body-part ${part} ${view.visible[part] ? 'is-visible' : ''}`}
            aria-label={`${view.visible[part] ? 'Hide' : 'Show'} ${names[part].toLowerCase()}`}
            aria-pressed={view.visible[part]}
            title={`${names[part]} · click to hide · Shift-click to isolate`}
            onClick={(e) =>
              onChange(
                e.shiftKey
                  ? (Object.fromEntries(
                      parts.map((p) => [p, p === part]),
                    ) as View['visible'])
                  : { ...view.visible, [part]: !view.visible[part] },
              )
            }
          >
            <span>{names[part]}</span>
          </button>
        ))}
      </div>
      <span className="visibility-hint">⇧ click to isolate</span>
    </section>
  );
}
