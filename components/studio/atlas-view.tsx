'use client';
import { useEffect, useRef, useState } from 'react';
import { atlas, regionAt, type Layer } from '@/lib/skin/atlas';
import { drawColorHighlights } from '@/lib/skin/color-highlight';
import { pixelCanvas, type Skin } from '@/lib/skin/engine';
export default function AtlasView({
  skin,
  selected,
  labels,
  onPixel,
  onEnd,
  onStart,
  grid = false,
  layer = 'base',
  mask = [],
  colorMatches = [],
}: {
  skin: Skin;
  selected?: { x: number; y: number; width: number; height: number };
  labels: boolean;
  onPixel: (x: number, y: number) => void;
  onEnd: () => void;
  onStart?: () => void;
  grid?: boolean;
  layer?: Layer;
  mask?: number[];
  colorMatches?: number[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const down = useRef(false);
  const [hovered, setHovered] = useState(false);
  useEffect(() => setHovered(false), [skin.model, layer]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 768, 768);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pixelCanvas(skin.pixels), 0, 0, 768, 768);
    const regions = atlas(skin.model);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (const r of regions.filter((r) => r.layer !== layer))
      ctx.fillRect(r.x * 12, r.y * 12, r.width * 12, r.height * 12);
    if (grid && hovered)
      for (const r of regions.filter((r) => r.layer === layer)) {
        ctx.strokeStyle =
          layer === 'overlay' ? 'rgba(137,105,193,.35)' : 'rgba(53,99,85,.25)';
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
    ctx.fillStyle = 'rgba(110,112,245,.48)';
    for (const i of mask)
      ctx.fillRect((i % 64) * 12, Math.floor(i / 64) * 12, 12, 12);
    if (labels) {
      for (const r of atlas(skin.model)) {
        ctx.strokeStyle = 'rgba(70,90,65,.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          r.x * 12 + 0.5,
          r.y * 12 + 0.5,
          r.width * 12,
          r.height * 12,
        );
        ctx.fillStyle = '#283c24';
        ctx.font = '8px monospace';
        ctx.fillText(
          `${r.part.replace('_', ' ')} ${r.face[0]}`,
          r.x * 12 + 2,
          r.y * 12 + 9,
        );
      }
    }
    drawColorHighlights(ctx, colorMatches);
    if (selected) {
      ctx.strokeStyle = '#ff7733';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        selected.x * 12,
        selected.y * 12,
        selected.width * 12,
        selected.height * 12,
      );
    }
  }, [skin, selected, labels, grid, hovered, layer, mask, colorMatches]);
  function hover(e: React.PointerEvent) {
    const b = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - b.left) / b.width) * 64);
    const y = Math.floor(((e.clientY - b.top) / b.height) * 64);
    setHovered(
      x >= 0 &&
        x < 64 &&
        y >= 0 &&
        y < 64 &&
        regionAt(skin.model, x, y)?.layer === layer,
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
        data-color-match-count={colorMatches.length}
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
