import test from 'node:test';
import assert from 'node:assert/strict';
import { atlas } from '../lib/skin/atlas';
import { makeSkin } from '../lib/skin/engine';
import { colorPixels } from '../lib/skin/color-highlight';

test('color matches use exact RGB on occupied opaque or translucent pixels without changing the skin', () => {
  const skin = makeSkin();
  const regions = atlas(skin.model), occupied = new Set<number>();
  for (const r of regions) for (let y=r.y;y<r.y+r.height;y++) for(let x=r.x;x<r.x+r.width;x++) occupied.add(y*64+x);
  const base = regions.find(r=>r.id==='head.base.front')!, outer = regions.find(r=>r.id==='head.overlay.front')!;
  const a=base.y*64+base.x,b=outer.y*64+outer.x,unused=skin.pixels.findIndex((_,i)=>!occupied.has(i));
  skin.pixels[a]='#123456ff'; skin.pixels[b]='#12345680'; skin.pixels[b+1]='#12345600'; skin.pixels[unused]='#123456ff';
  const before=JSON.stringify(skin);
  assert.deepEqual(colorPixels(skin,'#123456').sort((a,b)=>a-b),[a,b].sort((a,b)=>a-b));
  assert.equal(colorPixels(skin,'#123457').length,0);
  assert.equal(JSON.stringify(skin),before);
});
