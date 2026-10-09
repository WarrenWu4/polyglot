import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import * as db from './db';
import type { User } from './db';
import { generateToken, requireUser, SESSION_COOKIE_NAME, seedIfNeeded, sessionExpiresAt, sessionUser, userFrom, verifyPassword } from './auth';
import { scheduleReview } from './fsrs';
import { computeProgress, computeStreak, isStudySession, validHotkeyKey, type ApiCard, type ApiFace, type ApiSet } from './models';

type Bindings = { DB: D1Database; ASSETS: Fetcher };
type Variables = { user: User };
type AppEnv = { Bindings: Bindings; Variables: Variables };

const app = new Hono<AppEnv>();

// Seed the hardcoded admin user + default hotkeys lazily on the first request.
app.use('*', async (c, next) => {
  await seedIfNeeded(c.env.DB);
  await next();
});

// --- health + auth ---

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.get('/api/auth', async (c) => {
  const user = await sessionUser(c);
  return c.json({ authenticated: user !== null });
});

app.post('/api/auth/login', async (c) => {
  const form = await c.req.parseBody();
  const username = String(form['username'] ?? '').trim();
  const password = String(form['password'] ?? '');

  const user = await db.getUserByUsername(c.env.DB, username);
  const authenticated = user !== null && (await verifyPassword(user.password_hash, password));
  if (!authenticated) return c.json({ error: 'invalid username or password' }, 401);

  await db.deleteSessionsByUser(c.env.DB, user.id);
  const token = generateToken();
  const expiresAt = sessionExpiresAt();
  await db.createSession(c.env.DB, user.id, token, expiresAt);
  setCookie(c, SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    expires: new Date(expiresAt),
  });
  return c.json({ ok: true });
});

app.post('/api/auth/logout', async (c) => {
  const user = await sessionUser(c);
  if (user) {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    if (token) await db.deleteSession(c.env.DB, token);
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  return c.json({ ok: true });
});

// --- dashboard ---

app.get('/api/dashboard', requireUser, async (c) => {
  const user = userFrom(c);
  const database = c.env.DB;

  const sets = await db.listSets(database, user.id);
  const flashcardCounts = await db.countFlashcardsBySet(database, user.id);
  const sessionSizes = await db.listSessionSizesBySet(database, user.id);
  const masteredCounts = await db.masteredCountBySet(database, user.id);
  const studyDates = await db.getStudyDates(database, user.id);

  const fcBySet = new Map(flashcardCounts.map((r) => [r.set_id, r.flashcard_count]));
  const studiesBySet = new Map<number, number>();
  for (const row of sessionSizes) {
    if (isStudySession(row.cards_reviewed, fcBySet.get(row.set_id) ?? 0)) {
      studiesBySet.set(row.set_id, (studiesBySet.get(row.set_id) ?? 0) + 1);
    }
  }
  const masteredBySet = new Map(masteredCounts.map((r) => [r.set_id, r.mastered_count]));

  const apiSets: ApiSet[] = sets.map((set) => {
    const total = fcBySet.get(set.id) ?? 0;
    return {
      id: set.id,
      name: set.name,
      description: set.description,
      flashcardCount: total,
      studyCount: studiesBySet.get(set.id) ?? 0,
      progress: computeProgress(masteredBySet.get(set.id) ?? 0, total),
    };
  });
  apiSets.sort((a, b) => b.id - a.id);

  return c.json({ streak: computeStreak(studyDates), sets: apiSets });
});

// --- sets ---

function parseId(c: Context<AppEnv>): number | null {
  const id = Number(c.req.param('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

app.post('/api/sets', requireUser, async (c) => {
  const user = userFrom(c);
  const body = await c.req.json<{ name?: string; description?: string }>().catch(() => ({}) as { name?: string; description?: string });
  const name = (body.name ?? '').trim();
  if (!name) return c.json({ error: 'name is required' }, 400);

  const setId = await db.createSet(c.env.DB, user.id, name, (body.description ?? '').trim());
  await db.batch(c.env.DB, [
    db.createFaceStmt(c.env.DB, setId, 'word', 1),
    db.createFaceStmt(c.env.DB, setId, 'definition', 2),
  ]);
  return c.json({ id: setId }, 201);
});

app.get('/api/sets/:id', requireUser, async (c) => {
  const user = userFrom(c);
  const setId = parseId(c);
  if (setId === null) return c.json({ error: 'not found' }, 404);
  const set = await db.getSet(c.env.DB, setId, user.id);
  if (!set) return c.json({ error: 'not found' }, 404);

  const faces = await db.listFaces(c.env.DB, setId);
  const cards = await db.listCards(c.env.DB, setId);
  const faceViews: ApiFace[] = faces.map((f) => ({ id: f.id, name: f.name, position: f.position }));
  const cardViews: ApiCard[] = [];
  for (const card of cards) {
    const fields = await db.getCardFields(c.env.DB, card.id);
    cardViews.push({
      id: card.id,
      fields: fields.map((f) => ({ faceId: f.face_id, name: f.face_name, value: f.value })),
    });
  }

  return c.json({
    set: { id: set.id, name: set.name, description: set.description },
    faces: faceViews,
    cards: cardViews,
  });
});

// --- cards ---

function decodeFields(values: Record<string, unknown>): Map<number, string> {
  const fields = new Map<number, string>();
  for (const [key, value] of Object.entries(values)) {
    const id = Number(key);
    if (Number.isInteger(id)) fields.set(id, String(value ?? ''));
  }
  return fields;
}

app.post('/api/sets/:id/cards/delete', requireUser, async (c) => {
  const setId = parseId(c);
  if (setId === null) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{ ids?: number[] }>().catch(() => ({}) as { ids?: number[] });
  await db.deleteFlashcards(c.env.DB, setId, (body.ids ?? []).filter(Number.isInteger));
  return c.body(null, 204);
});

app.post('/api/sets/:id/cards', requireUser, async (c) => {
  const setId = parseId(c);
  if (setId === null) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const want = decodeFields(body);

  const faces = await db.listFaces(c.env.DB, setId);
  const cardId = await db.createFlashcard(c.env.DB, setId);
  await db.batch(
    c.env.DB,
    faces.map((f) => db.upsertCardFieldStmt(c.env.DB, cardId, f.id, want.get(f.id) ?? '')),
  );
  return c.json({ id: cardId }, 201);
});

app.post('/api/sets/:id/cards/:cardId/delete', requireUser, async (c) => {
  const setId = parseId(c);
  const cardId = Number(c.req.param('cardId'));
  if (setId === null || !Number.isInteger(cardId)) return c.json({ error: 'not found' }, 404);
  const cardSet = await db.getCardSetID(c.env.DB, cardId);
  if (cardSet === null || cardSet !== setId) return c.json({ error: 'not found' }, 404);
  await db.deleteFlashcard(c.env.DB, cardId);
  return c.body(null, 204);
});

app.post('/api/sets/:id/cards/:cardId', requireUser, async (c) => {
  const setId = parseId(c);
  const cardId = Number(c.req.param('cardId'));
  if (setId === null || !Number.isInteger(cardId)) return c.json({ error: 'not found' }, 404);
  const cardSet = await db.getCardSetID(c.env.DB, cardId);
  if (cardSet === null || cardSet !== setId) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const want = decodeFields(body);

  const faces = await db.listFaces(c.env.DB, setId);
  await db.batch(
    c.env.DB,
    faces.map((f) => db.upsertCardFieldStmt(c.env.DB, cardId, f.id, want.get(f.id) ?? '')),
  );
  return c.body(null, 204);
});

// --- faces ---

app.post('/api/sets/:id/faces', requireUser, async (c) => {
  const setId = parseId(c);
  if (setId === null) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  const name = (body.name ?? '').trim();
  if (!name) return c.json({ error: 'face name is required' }, 400);

  const pos = await db.maxFacePosition(c.env.DB, setId);
  const faceId = await db.createFace(c.env.DB, setId, name, pos + 1);
  await db.addFaceToAllCards(c.env.DB, setId, faceId);
  return c.json({ id: faceId }, 201);
});

app.post('/api/sets/:id/faces/:faceId/delete', requireUser, async (c) => {
  const setId = parseId(c);
  const faceId = Number(c.req.param('faceId'));
  if (setId === null || !Number.isInteger(faceId)) return c.json({ error: 'not found' }, 404);
  const faceSet = await db.getFaceSetID(c.env.DB, faceId);
  if (faceSet === null || faceSet !== setId) return c.json({ error: 'not found' }, 404);

  const faces = await db.listFaces(c.env.DB, setId);
  if (faces.length <= 2) return c.json({ error: 'a set must keep at least 2 faces' }, 400);
  await db.deleteFace(c.env.DB, faceId);
  return c.body(null, 204);
});

// --- study ---

app.get('/api/sets/:id/study', requireUser, async (c) => {
  const user = userFrom(c);
  const setId = parseId(c);
  if (setId === null) return c.json({ error: 'not found' }, 404);
  const set = await db.getSet(c.env.DB, setId, user.id);
  if (!set) return c.json({ error: 'not found' }, 404);

  const sessionId = await db.createStudySession(c.env.DB, setId, user.id);
  const cards = await db.listCards(c.env.DB, setId);
  const dueRows = await db.listCardFSRSBySet(c.env.DB, setId, user.id);
  const dueByCard = new Map(dueRows.map((d) => [d.flashcard_id, d.due]));

  const now = Date.now();
  const ordered: { card: { id: number; fields: { name: string; value: string }[] }; due: number }[] = [];
  for (const card of cards) {
    const fields = await db.getCardFields(c.env.DB, card.id);
    const dueRaw = dueByCard.get(card.id);
    let due = now;
    if (dueRaw) {
      const t = new Date(dueRaw).getTime();
      if (!Number.isNaN(t)) due = t;
    }
    ordered.push({
      card: { id: card.id, fields: fields.map((f) => ({ name: f.face_name, value: f.value })) },
      due,
    });
  }
  ordered.sort((a, b) => a.due - b.due);

  const hotkeyRows = await db.getHotkeys(c.env.DB, user.id);
  const hotkeys: Record<number, string> = {};
  for (const hk of hotkeyRows) hotkeys[hk.position] = hk.key;

  const faces = await db.listFaces(c.env.DB, setId);
  const faceNames = faces.map((f) => f.name);

  return c.json({
    sessionId,
    setId,
    setName: set.name,
    hotkeys,
    hotkeyRows,
    faceNames,
    cards: ordered.map((o) => o.card),
  });
});

app.post('/api/sets/:id/study/review', requireUser, async (c) => {
  const user = userFrom(c);
  const setId = parseId(c);
  if (setId === null) return c.json({ error: 'not found' }, 404);
  const body = await c.req
    .json<{ sessionId?: number; cardId?: number; know?: boolean }>()
    .catch(() => ({}) as { sessionId?: number; cardId?: number; know?: boolean });
  const cardId = Number(body.cardId);
  const sessionId = Number(body.sessionId);
  if (!Number.isInteger(cardId) || !Number.isInteger(sessionId)) return c.json({ error: 'invalid body' }, 400);

  const cardSet = await db.getCardSetID(c.env.DB, cardId);
  if (cardSet === null || cardSet !== setId) return c.json({ error: 'not found' }, 404);

  const know = body.know === true;
  const state = await scheduleReview(c.env.DB, user.id, cardId, know);

  await db.createCardReview(c.env.DB, sessionId, cardId, know ? 'correct' : 'incorrect');
  await db.incrementSessionReviews(c.env.DB, sessionId);

  return c.json({ ok: true, due: state.due });
});

// --- settings ---

app.get('/api/settings', requireUser, async (c) => {
  const user = userFrom(c);
  const hotkeys = await db.getHotkeys(c.env.DB, user.id);
  hotkeys.sort((a, b) => a.position - b.position);
  return c.json({ hotkeys: hotkeys.map((h) => ({ position: h.position, key: h.key })) });
});

app.post('/api/settings', requireUser, async (c) => {
  const user = userFrom(c);
  const body = await c.req.json<{ hotkeys?: { position: number; key: string }[] }>().catch(() => ({}) as { hotkeys?: { position: number; key: string }[] });
  const seen = new Map<string, number>();
  for (const hk of body.hotkeys ?? []) {
    const pos = Number(hk.position);
    if (!Number.isInteger(pos) || pos < 1) continue;
    const key = (hk.key ?? '').trim();
    if (!key) {
      await db.deleteHotkey(c.env.DB, user.id, pos);
      continue;
    }
    if (!validHotkeyKey(key)) return c.json({ error: `invalid key "${key}" — use a single letter or digit` }, 400);
    const prev = seen.get(key);
    if (prev !== undefined) return c.json({ error: `key "${key}" is used for both face ${prev} and face ${pos}` }, 400);
    seen.set(key, pos);
    await db.upsertHotkey(c.env.DB, user.id, pos, key);
  }
  return c.body(null, 204);
});

// SPA fallback: client-side routes (e.g. /sets/1) don't exist as static files.
// not_found_handling: "single-page-application" in wrangler.jsonc makes
// ASSETS.fetch return index.html for any unmatched path.
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;