import { database, owner, sameOrigin, body } from '@/db/raw';
import { validateWorkspace } from '@/lib/skin/workspace';
import { makeSkin, validateSkin } from '@/lib/skin/engine';
const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
async function list(ownerId: string) {
  return (
    await database()
      .prepare(
        'SELECT id, name, source_id as sourceId, updated FROM skin_sessions WHERE owner = ? ORDER BY updated DESC',
      )
      .bind(ownerId)
      .all()
  ).results;
}
async function write(ownerId: string, sessionId: string, skin: unknown) {
  const data = {
    ...validateSkin(skin),
    workspace: validateWorkspace((skin as any).workspace),
  };
  const payload = JSON.stringify({ ...data, sessionId });
  await database().batch([
    database()
      .prepare(
        'INSERT INTO skin_sessions (id, owner, name, source_id, skin, updated) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, source_id=excluded.source_id, skin=excluded.skin, updated=excluded.updated WHERE skin_sessions.owner=excluded.owner',
      )
      .bind(
        sessionId,
        ownerId,
        data.name,
        data.sourceId ?? null,
        payload,
        Date.now(),
      ),
    database()
      .prepare(
        'INSERT INTO drafts (owner, skin, updated) VALUES (?, ?, ?) ON CONFLICT(owner) DO UPDATE SET skin=excluded.skin, updated=excluded.updated',
      )
      .bind(ownerId, payload, Date.now()),
  ]);
  return data;
}
export async function GET(req: Request) {
  try {
    const o = await owner(req);
    const id = new URL(req.url).searchParams.get('id');
    let skin: any;
    let sessionId: string;
    if (id) {
      if (!validId(id)) throw Error('Invalid session ID');
      const row = await database()
        .prepare('SELECT skin FROM skin_sessions WHERE id = ? AND owner = ?')
        .bind(id, o.id)
        .first<{ skin: string }>();
      if (!row)
        return Response.json(
          { error: 'Skin session not found' },
          { status: 404 },
        );
      skin = JSON.parse(row.skin);
      sessionId = id;
    } else {
      const row = await database()
        .prepare('SELECT skin FROM drafts WHERE owner = ?')
        .bind(o.id)
        .first<{ skin: string }>();
      skin = row ? JSON.parse(row.skin) : makeSkin();
      sessionId = validId(skin.sessionId)
        ? skin.sessionId
        : crypto.randomUUID();
      // Preserve the complete legacy draft, including messages and history.
      if (!validId(skin.sessionId)) skin = await write(o.id, sessionId, skin);
    }
    return Response.json(
      { skin, sessionId, sessions: await list(o.id) },
      { headers: { 'Set-Cookie': o.cookie, 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const o = await owner(req);
    const data = await body(req, 1500000);
    const sessionId = crypto.randomUUID();
    const skin = await write(o.id, sessionId, data);
    return Response.json(
      { skin, sessionId, sessions: await list(o.id) },
      { headers: { 'Set-Cookie': o.cookie } },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
export async function PUT(req: Request) {
  try {
    sameOrigin(req);
    const o = await owner(req);
    const data = await body(req, 1500000);
    if (!validId(data.sessionId)) throw Error('sessionId is required');
    const owned = await database()
      .prepare('SELECT id FROM skin_sessions WHERE id = ? AND owner = ?')
      .bind(data.sessionId, o.id)
      .first();
    if (!owned)
      return Response.json(
        { error: 'Skin session not found' },
        { status: 404 },
      );
    await write(o.id, data.sessionId, data);
    return Response.json(
      { saved: true },
      { headers: { 'Set-Cookie': o.cookie } },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
