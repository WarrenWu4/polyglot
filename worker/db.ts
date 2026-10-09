// Global D1 types are provided by worker-configuration.d.ts (see tsconfig.worker.json).

export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface SetRow {
  id: number;
  user_id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface SetFaceRow {
  id: number;
  set_id: number;
  name: string;
  position: number;
}

export interface CardRow {
  id: number;
  set_id: number;
  created_at: string;
}

export interface CardFieldRow {
  flashcard_id: number;
  face_id: number;
  face_name: string;
  value: string;
}

export interface HotkeyRow {
  position: number;
  key: string;
}

export interface CardFSRSRow {
  user_id: number;
  flashcard_id: number;
  due: string;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

export interface CountBySet {
  set_id: number;
  flashcard_count: number;
}

export interface SessionSizeBySet {
  set_id: number;
  cards_reviewed: number;
}

export interface MasteredBySet {
  set_id: number;
  mastered_count: number;
}

export interface DueByCard {
  flashcard_id: number;
  due: string;
}

const nowIso = () => new Date().toISOString();

// --- users ---

export async function getUserByUsername(db: D1Database, username: string): Promise<User | null> {
  return db
    .prepare('SELECT id, username, password_hash, created_at FROM users WHERE username = ? LIMIT 1')
    .bind(username)
    .first<User>();
}

export async function createUser(db: D1Database, username: string, passwordHash: string): Promise<number> {
  const row = await db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id')
    .bind(username, passwordHash)
    .first<{ id: number }>();
  return row!.id;
}

export async function updateUserPasswordHash(db: D1Database, id: number, passwordHash: string): Promise<void> {
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(passwordHash, id).run();
}

// --- sessions ---

export async function createSession(db: D1Database, userId: number, token: string, expiresAt: string): Promise<void> {
  await db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').bind(userId, token, expiresAt).run();
}

export async function getSessionUser(db: D1Database, token: string, now: string): Promise<User | null> {
  return db
    .prepare(
      `SELECT u.id, u.username, u.password_hash, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?
       LIMIT 1`,
    )
    .bind(token, now)
    .first<User>();
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function deleteSessionsByUser(db: D1Database, userId: number): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

// --- sets ---

export async function listSets(db: D1Database, userId: number): Promise<SetRow[]> {
  const { results } = await db
    .prepare('SELECT id, user_id, name, description, created_at FROM flashcard_sets WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all<SetRow>();
  return results;
}

export async function getSet(db: D1Database, id: number, userId: number): Promise<SetRow | null> {
  return db
    .prepare('SELECT id, user_id, name, description, created_at FROM flashcard_sets WHERE id = ? AND user_id = ? LIMIT 1')
    .bind(id, userId)
    .first<SetRow>();
}

export async function createSet(db: D1Database, userId: number, name: string, description: string): Promise<number> {
  const row = await db
    .prepare('INSERT INTO flashcard_sets (user_id, name, description) VALUES (?, ?, ?) RETURNING id')
    .bind(userId, name, description)
    .first<{ id: number }>();
  return row!.id;
}

export async function countFlashcardsBySet(db: D1Database, userId: number): Promise<CountBySet[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id AS set_id, COUNT(f.id) AS flashcard_count
       FROM flashcard_sets s
       LEFT JOIN flashcards f ON f.set_id = s.id
       WHERE s.user_id = ?
       GROUP BY s.id`,
    )
    .bind(userId)
    .all<CountBySet>();
  return results;
}

export async function listSessionSizesBySet(db: D1Database, userId: number): Promise<SessionSizeBySet[]> {
  const { results } = await db
    .prepare('SELECT set_id, cards_reviewed FROM study_sessions WHERE user_id = ?')
    .bind(userId)
    .all<SessionSizeBySet>();
  return results;
}

export async function masteredCountBySet(db: D1Database, userId: number): Promise<MasteredBySet[]> {
  const { results } = await db
    .prepare(
      `WITH latest_review AS (
         SELECT cr.flashcard_id AS flashcard_id, cr.outcome AS outcome
         FROM card_reviews cr
         WHERE cr.id = (
           SELECT MAX(cr2.id) FROM card_reviews cr2 WHERE cr2.flashcard_id = cr.flashcard_id
         )
       )
       SELECT f.set_id AS set_id, COUNT(*) AS mastered_count
       FROM flashcards f
       JOIN latest_review lr ON lr.flashcard_id = f.id
       JOIN flashcard_sets s ON s.id = f.set_id
       WHERE lr.outcome = 'correct' AND s.user_id = ?
       GROUP BY f.set_id`,
    )
    .bind(userId)
    .all<MasteredBySet>();
  return results;
}

export async function getStudyDates(db: D1Database, userId: number): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT DISTINCT CAST(DATE(started_at) AS TEXT) AS study_date FROM study_sessions WHERE user_id = ?')
    .bind(userId)
    .all<{ study_date: string }>();
  return results.map((r) => r.study_date);
}

// --- faces ---

export async function listFaces(db: D1Database, setId: number): Promise<SetFaceRow[]> {
  const { results } = await db
    .prepare('SELECT id, set_id, name, position FROM set_faces WHERE set_id = ? ORDER BY position ASC')
    .bind(setId)
    .all<SetFaceRow>();
  return results;
}

export async function createFace(db: D1Database, setId: number, name: string, position: number): Promise<number> {
  const row = await db
    .prepare('INSERT INTO set_faces (set_id, name, position) VALUES (?, ?, ?) RETURNING id')
    .bind(setId, name, position)
    .first<{ id: number }>();
  return row!.id;
}

export function createFaceStmt(db: D1Database, setId: number, name: string, position: number): D1PreparedStatement {
  return db.prepare('INSERT INTO set_faces (set_id, name, position) VALUES (?, ?, ?)').bind(setId, name, position);
}

export async function deleteFace(db: D1Database, faceId: number): Promise<void> {
  await db.prepare('DELETE FROM set_faces WHERE id = ?').bind(faceId).run();
}

export async function maxFacePosition(db: D1Database, setId: number): Promise<number> {
  const row = await db
    .prepare('SELECT CAST(COALESCE(MAX(position), 0) AS INTEGER) AS pos FROM set_faces WHERE set_id = ?')
    .bind(setId)
    .first<{ pos: number }>();
  return row?.pos ?? 0;
}

export async function getFaceSetID(db: D1Database, faceId: number): Promise<number | null> {
  const row = await db.prepare('SELECT set_id FROM set_faces WHERE id = ?').bind(faceId).first<{ set_id: number }>();
  return row?.set_id ?? null;
}

// --- cards ---

export async function listCards(db: D1Database, setId: number): Promise<CardRow[]> {
  const { results } = await db
    .prepare('SELECT id, set_id, created_at FROM flashcards WHERE set_id = ? ORDER BY created_at ASC')
    .bind(setId)
    .all<CardRow>();
  return results;
}

export async function createFlashcard(db: D1Database, setId: number): Promise<number> {
  const row = await db
    .prepare('INSERT INTO flashcards (set_id) VALUES (?) RETURNING id')
    .bind(setId)
    .first<{ id: number }>();
  return row!.id;
}

export async function deleteFlashcard(db: D1Database, cardId: number): Promise<void> {
  await db.prepare('DELETE FROM flashcards WHERE id = ?').bind(cardId).run();
}

export async function deleteFlashcards(db: D1Database, setId: number, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  await db
    .prepare(`DELETE FROM flashcards WHERE set_id = ? AND id IN (${placeholders})`)
    .bind(setId, ...ids)
    .run();
}

export async function getCardSetID(db: D1Database, cardId: number): Promise<number | null> {
  const row = await db.prepare('SELECT set_id FROM flashcards WHERE id = ?').bind(cardId).first<{ set_id: number }>();
  return row?.set_id ?? null;
}

export async function getCardFields(db: D1Database, flashcardId: number): Promise<CardFieldRow[]> {
  const { results } = await db
    .prepare(
      `SELECT cf.flashcard_id AS flashcard_id, cf.face_id AS face_id, sf.name AS face_name, cf.value AS value
       FROM flashcard_fields cf
       JOIN set_faces sf ON sf.id = cf.face_id
       WHERE cf.flashcard_id = ?
       ORDER BY sf.position ASC`,
    )
    .bind(flashcardId)
    .all<CardFieldRow>();
  return results;
}

export function upsertCardFieldStmt(db: D1Database, flashcardId: number, faceId: number, value: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO flashcard_fields (flashcard_id, face_id, value) VALUES (?, ?, ?)
       ON CONFLICT (flashcard_id, face_id) DO UPDATE SET value = excluded.value`,
    )
    .bind(flashcardId, faceId, value);
}

export async function addFaceToAllCards(db: D1Database, setId: number, faceId: number): Promise<void> {
  await db
    .prepare(`INSERT INTO flashcard_fields (flashcard_id, face_id, value) SELECT id, ?, '' FROM flashcards WHERE set_id = ?`)
    .bind(faceId, setId)
    .run();
}

// --- study ---

export async function createStudySession(db: D1Database, setId: number, userId: number): Promise<number> {
  const row = await db
    .prepare('INSERT INTO study_sessions (set_id, user_id) VALUES (?, ?) RETURNING id')
    .bind(setId, userId)
    .first<{ id: number }>();
  return row!.id;
}

export async function createCardReview(db: D1Database, sessionId: number, flashcardId: number, outcome: string): Promise<void> {
  await db
    .prepare('INSERT INTO card_reviews (session_id, flashcard_id, outcome) VALUES (?, ?, ?)')
    .bind(sessionId, flashcardId, outcome)
    .run();
}

export async function incrementSessionReviews(db: D1Database, sessionId: number): Promise<void> {
  await db.prepare('UPDATE study_sessions SET cards_reviewed = cards_reviewed + 1 WHERE id = ?').bind(sessionId).run();
}

// --- fsrs ---

export async function getCardFSRS(db: D1Database, userId: number, flashcardId: number): Promise<CardFSRSRow | null> {
  return db
    .prepare(
      `SELECT user_id, flashcard_id, due, stability, difficulty, scheduled_days, reps, lapses, state, last_review
       FROM card_fsrs
       WHERE user_id = ? AND flashcard_id = ?`,
    )
    .bind(userId, flashcardId)
    .first<CardFSRSRow>();
}

export async function upsertCardFSRS(
  db: D1Database,
  row: {
    userId: number;
    flashcardId: number;
    due: string;
    stability: number;
    difficulty: number;
    scheduledDays: number;
    reps: number;
    lapses: number;
    state: number;
    lastReview: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO card_fsrs (user_id, flashcard_id, due, stability, difficulty, scheduled_days, reps, lapses, state, last_review)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, flashcard_id) DO UPDATE SET
         due = excluded.due,
         stability = excluded.stability,
         difficulty = excluded.difficulty,
         scheduled_days = excluded.scheduled_days,
         reps = excluded.reps,
         lapses = excluded.lapses,
         state = excluded.state,
         last_review = excluded.last_review`,
    )
    .bind(
      row.userId,
      row.flashcardId,
      row.due,
      row.stability,
      row.difficulty,
      row.scheduledDays,
      row.reps,
      row.lapses,
      row.state,
      row.lastReview,
    )
    .run();
}

export async function listCardFSRSBySet(db: D1Database, setId: number, userId: number): Promise<DueByCard[]> {
  const { results } = await db
    .prepare(
      `SELECT cf.flashcard_id AS flashcard_id, cf.due AS due
       FROM card_fsrs cf
       JOIN flashcards f ON f.id = cf.flashcard_id
       WHERE f.set_id = ? AND cf.user_id = ?`,
    )
    .bind(setId, userId)
    .all<DueByCard>();
  return results;
}

// --- hotkeys ---

export async function getHotkeys(db: D1Database, userId: number): Promise<HotkeyRow[]> {
  const { results } = await db
    .prepare('SELECT position, key FROM user_hotkeys WHERE user_id = ? ORDER BY position ASC')
    .bind(userId)
    .all<HotkeyRow>();
  return results;
}

export async function upsertHotkey(db: D1Database, userId: number, position: number, key: string): Promise<void> {
  await db
    .prepare('INSERT INTO user_hotkeys (user_id, position, key) VALUES (?, ?, ?) ON CONFLICT (user_id, position) DO UPDATE SET key = excluded.key')
    .bind(userId, position, key)
    .run();
}

export async function deleteHotkey(db: D1Database, userId: number, position: number): Promise<void> {
  await db.prepare('DELETE FROM user_hotkeys WHERE user_id = ? AND position = ?').bind(userId, position).run();
}

export function batch(db: D1Database, statements: D1PreparedStatement[]) {
  return db.batch(statements);
}

export { nowIso };