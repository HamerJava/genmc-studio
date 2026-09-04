'use client';
import { useEffect, useRef, useState } from 'react';
import { atlas, regionAt, type Layer } from '@/lib/skin/atlas';
import {
  drawAgentFrame,
  visualDuration,
  type AgentVisual,
} from '@/lib/skin/agent-visual';
import { pixelCanvas, type Skin, type View } from '@/lib/skin/engine';
export default function AtlasView({
  skin,
  agentVisual,
  markMethod,
  selected,
  labels,
  onPixel,
  onEnd,
  onStart,
  grid = false,
  layer = 'base',
  mask = [],
  partLayers,
  visibleParts,
}: {
  skin: Skin;
  agentVisual?: AgentVisual;
  markMethod?: string;
  selected?: { x: number; y: number; width: number; height: number };
  labels: boolean;
  onPixel: (x: number, y: number) => void;
  onEnd: () => void;
  onStart?: () => void;
  grid?: boolean;
  layer?: Layer;
  mask?: number[];
  partLayers?: View['partLayers'];
  visibleParts?: View['visible'];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const down = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [hoverPixel, setHoverPixel] = useState<number | null>(null);
  useEffect(() => setHovered(false), [skin.model, layer]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const texture = pixelCanvas(skin.pixels);
    const glow = document.createElement('canvas');
    glow.width = glow.height = 64;
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    let raf = 0;
    const frame = () => {
      const done =
        !agentVisual ||
        (['done', 'error'].includes(agentVisual.phase) &&
          performance.now() - agentVisual.startedAt >= visualDuration);
      drawAgentFrame(
        texture,
        glow,
        skin,
        done ? undefined : agentVisual,
        performance.now(),
        reduced,
      );
      ctx.clearRect(0, 0, 768, 768);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(texture, 0, 0, 768, 768);
      ctx.drawImage(glow, 0, 0, 768, 768);
      const regions = atlas(skin.model);
      ctx.fillStyle = 'rgba(128,128,128,.18)';
      for (const r of regions.filter((r) => r.layer !== (partLayers?.[r.part] ?? layer) || visibleParts?.[r.part] === false))
        ctx.fillRect(r.x * 12, r.y * 12, r.width * 12, r.height * 12);
      if (grid && hovered)
        for (const r of regions.filter((r) => r.layer === (partLayers?.[r.part] ?? layer) && visibleParts?.[r.part] !== false)) {
          ctx.strokeStyle =
            layer === 'overlay'
              ? 'rgba(150,150,150,.35)'
              : 'rgba(125,125,125,.25)';
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          for (let x = 0; x <= r.width; x++) {
            ctx.moveTo((r.x + x) * 12 + 0.5, r.y * 12);
            ctx.lineTo((r.x + x) * 12 + 0.5, (r.y + r.height) * 12);
          }
          for (let y = 0; y <= r.height; y++) {
            ctx.moveTo(r.x * 12, (r.y + y) * 12 + 0.5);
            ctx.lineTo((r.x + r.width) * 12, (r.y + y) * 12 + 0.5);
          }
          ctx.stroke();
        }
      ctx.fillStyle = 'rgba(125,211,252,.65)';
      for (const i of mask)
        ctx.fillRect((i % 64) * 12, Math.floor(i / 64) * 12, 12, 12);
      if (labels) {
        for (const r of atlas(skin.model)) {
          ctx.strokeStyle = 'rgba(130,130,130,.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(
            r.x * 12 + 0.5,
            r.y * 12 + 0.5,
            r.width * 12,
            r.height * 12,
          );
          ctx.fillStyle = '#777777';
          ctx.font = '8px monospace';
          ctx.fillText(
            `${r.part.replace('_', ' ')} ${r.face[0]}`,
            r.x * 12 + 2,
            r.y * 12 + 9,
          );
        }
      }
      if (markMethod && hovered && hoverPixel !== null && !down.current) {
        const x = hoverPixel % 64, y = Math.floor(hoverPixel / 64);
        const r = regionAt(skin.model, x, y);
        const q = markMethod === 'face' && r ? r : { x, y, width: 1, height: 1 };
        ctx.fillStyle = 'rgba(125,211,252,.22)';
        ctx.fillRect(q.x * 12, q.y * 12, q.width * 12, q.height * 12);
        ctx.strokeStyle = 'rgba(125,211,252,.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(q.x * 12 + .5, q.y * 12 + .5, q.width * 12 - 1, q.height * 12 - 1);
      }
      if (selected) {
        ctx.fillStyle = 'rgba(125,211,252,.65)';
        ctx.fillRect(selected.x * 12, selected.y * 12, selected.width * 12, selected.height * 12);
        ctx.strokeStyle = 'rgba(125,211,252,.85)';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          selected.x * 12,
          selected.y * 12,
          selected.width * 12,
          selected.height * 12,
        );
      }
      if (!done && !reduced) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [skin, selected, labels, grid, hovered, layer, mask, agentVisual, partLayers, visibleParts, markMethod, hoverPixel]);
  function hover(e: React.PointerEvent) {
    const b = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - b.left) / b.width) * 64);
    const y = Math.floor(((e.clientY - b.top) / b.height) * 64);
    setHoverPixel(y * 64 + x);
    setHovered(
      x >= 0 &&
        x < 64 &&
        y >= 0 &&
        y < 64 &&
        (() => { const r = regionAt(skin.model, x, y); return !!r && visibleParts?.[r.part] !== false && r.layer === (partLayers?.[r.part] ?? layer); })(),
    );
  }
  function point(e: React.PointerEvent) {
    const b = e.currentTarget.getBoundingClientRect();
    onPixel(
      Math.min(
        63,
        Math.max(0, Math.floor(((e.clientX - b.left) / b.width) * 64)),
      ),
      Math.min(
        63,
        Math.max(0, Math.floor(((e.clientY - b.top) / b.height) * 64)),
      ),
    );
  }
  return (
    <div className="atlas-wrap">
      <canvas
        ref={ref}
        width={768}
        height={768}
        aria-label="64 by 64 skin canvas"
        onPointerEnter={hover}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={(e) => {
          hover(e);
          down.current = true;
          onStart?.();
          e.currentTarget.setPointerCapture(e.pointerId);
          point(e);
        }}
        onPointerMove={(e) => {
          hover(e);
          if (down.current) point(e);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'touch') setHovered(false);
          down.current = false;
          onEnd();
        }}
        onPointerCancel={() => {
          setHovered(false);
          down.current = false;
          onEnd();
        }}
      />
    </div>
  );
}
