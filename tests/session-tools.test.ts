import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolDefinitions } from '../lib/skin/webmcp';
test('every mutation is bound to an explicitly expected skin session', () => {
  const defs = toolDefinitions(() => ({}));
  for (const tool of defs.filter((t) => !t.annotations.readOnlyHint))
    assert.ok(
      (tool.inputSchema as any).required.includes('expectedSessionId'),
      tool.name,
    );
  for (const name of ['create_skin', 'select_skin', 'complete_requests'])
    assert.ok(defs.some((t) => t.name === name));
});
