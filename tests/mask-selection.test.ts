import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMaskRegion } from '../lib/skin/workspace';

test('separate regions and overlapping selections preserve previous mask pixels', () => {
  const first = addMaskRegion([], { x: 8, y: 8, width: 2, height: 2 });
  const second = addMaskRegion(first, { x: 20, y: 20, width: 2, height: 2 });
  assert.equal(second.length, 8);
  assert.ok(first.every(i => second.includes(i)));
  assert.deepEqual(addMaskRegion(second, { x: 8, y: 8, width: 2, height: 2 }), second);
  assert.equal(first.length, 4);
});

test('shrinking a rectangle uses the original mask, not its previous preview', () => {
  const original = [520];
  const large = addMaskRegion(original, { x: 20, y: 20, width: 4, height: 4 });
  const small = addMaskRegion(original, { x: 20, y: 20, width: 1, height: 1 });
  assert.equal(large.length, 17);
  assert.deepEqual(small, [520, 1300]);
  assert.deepEqual(original, [520]);
});
