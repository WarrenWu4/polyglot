-- Polyglot database schema (Cloudflare D1 / SQLite).
--
-- Apply against a local D1 database with:
--   npm run db:init
-- and against the remote database with:
--   npm run db:init:remote
--
-- This file is idempotent (CREATE TABLE IF NOT EXISTS), so it is safe to re-run.

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flashcard_sets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flashcards (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id     INTEGER NOT NULL REFERENCES flashcard_sets(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS set_faces (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id   INTEGER NOT NULL REFERENCES flashcard_sets(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flashcard_fields (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    flashcard_id INTEGER NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    face_id      INTEGER NOT NULL REFERENCES set_faces(id) ON DELETE CASCADE,
    value        TEXT NOT NULL DEFAULT '',
    UNIQUE (flashcard_id, face_id)
);

CREATE TABLE IF NOT EXISTS study_sessions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id         INTEGER NOT NULL REFERENCES flashcard_sets(id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at     TEXT NOT NULL DEFAULT (datetime('now')),
    cards_reviewed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS card_reviews (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
    flashcard_id INTEGER NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    outcome      TEXT NOT NULL CHECK (outcome IN ('correct', 'incorrect')),
    reviewed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_hotkeys (
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    key      TEXT NOT NULL,
    PRIMARY KEY (user_id, position),
    UNIQUE (user_id, key)
);

CREATE TABLE IF NOT EXISTS card_fsrs (
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    flashcard_id   INTEGER NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    due            TEXT NOT NULL,
    stability      REAL NOT NULL,
    difficulty     REAL NOT NULL,
    scheduled_days INTEGER NOT NULL,
    reps           INTEGER NOT NULL,
    lapses         INTEGER NOT NULL,
    state          INTEGER NOT NULL,
    last_review    TEXT,
    PRIMARY KEY (user_id, flashcard_id)
);
