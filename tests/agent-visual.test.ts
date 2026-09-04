import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  visualTargets,
  regionLabel,
  drawAgentFrame,
  visualDuration,
  agentScanPeriod,
} from '../lib/skin/agent-visual';
import { makeSkin } from '../lib/skin/engine';

test('completed reads keep scanning in sky blue without modifying the skin', () => {
  const skin = makeSkin();
  const original = [...skin.pixels];
  const colors: string[] = [];
  const ctx = { fillStyle: '', clearRect() {}, fillRect() {} };
  const fx = { fillStyle: '', clearRect() {}, fillRect() { colors.push(this.fillStyle); } };
  const texture = { getContext: () => ctx } as unknown as HTMLCanvasElement;
  const glow = { getContext: () => fx } as unknown as HTMLCanvasElement;
  const visual = { id: 1, label: 'Reading skin', regions: [], pixels: [520], startedAt: 0, phase: 'done' as const };
  drawAgentFrame(texture, glow, skin, visual, 100, false);
  drawAgentFrame(texture, glow, skin, visual, 100 + agentScanPeriod, false);
  assert.ok(Math.abs(Number(colors[0].split(',')[3].slice(0, -1)) - Number(colors[1].split(',')[3].slice(0, -1))) < 1e-12);
  assert.match(colors[0], /^rgba\(125,211,252,/);
  assert.ok(visualDuration > agentScanPeriod * 2);
  assert.deepEqual(skin.pixels, original);
  colors.length = 0;
  drawAgentFrame(texture, glow, skin, visual, 100, true);
  drawAgentFrame(texture, glow, skin, visual, 500, true);
  assert.deepEqual(colors, ['rgba(125,211,252,0.2)', 'rgba(125,211,252,0.2)']);
});

test('region scan stays on the requested UV face', () => {
  const target = visualTargets('classic', { region: 'body.base.front' });
  assert.equal(target.pixels.length, 96);
  assert.deepEqual(target.regions, ['body.base.front']);
  assert.equal(regionLabel(target.regions), 'Chest');
});
test('global operations identify the actual body part', () => {
  const target = visualTargets('classic', {
    operations: [{ type: 'pixel', x: 9, y: 10 }],
  });
  assert.deepEqual(target.pixels, [649]);
  assert.deepEqual(target.regions, ['head.base.front']);
});
test('visual frames preserve canonical pixels and reduced motion shows final colors immediately', () => {
  const skin = makeSkin();
  const original = [...skin.pixels];
  const colors: string[] = [];
  const context = {
    fillStyle: '',
    globalAlpha: 1,
    clearRect() {},
    fillRect() {
      colors.push(this.fillStyle);
    },
  };
  const canvas = { getContext: () => context } as unknown as HTMLCanvasElement;
  drawAgentFrame(
    canvas,
    canvas,
    skin,
    {
      id: 1,
      label: 'edit',
      regions: [],
      pixels: [520],
      startedAt: 0,
      phase: 'done',
      before: original.map(() => '#ff0000'),
      revision: skin.revision,
    },
    visualDuration / 2,
    true,
  );
  assert.deepEqual(skin.pixels, original);
  assert.ok(!colors.includes('#ff0000'));
});
