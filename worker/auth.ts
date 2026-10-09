import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import * as db from './db';
import type { User } from './db';

export const SESSION_COOKIE_NAME = 'session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

const SEED_USERNAME = 'admin';
const SEED_PASSWORD = 'polyglot';

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT_LEN = 16;
const PBKDF2_KEY_LEN = 32;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(s: string): Uint8Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(password: string, salt: Uint8Array, iterations: number, keyBytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, keyBytes * 8);
  return new Uint8Array(bits);
}

// HashPassword hashes a password with PBKDF2-SHA256 and returns an encoded string.
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_LEN));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

// VerifyPassword reports whether password matches the encoded PBKDF2 hash.
export async function verifyPassword(encoded: string, password: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  const got = await derive(password, salt, iterations, expected.length);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
  return diff === 0;
}

// GenerateToken returns a URL-safe random session token.
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function sessionExpiresAt(): string {
  return new Date(Date.now() + SESSION_DURATION_MS).toISOString();
}

// --- seeding ---

let seedPromise: Promise<void> | null = null;

async function doSeed(database: D1Database): Promise<void> {
  let user = await db.getUserByUsername(database, SEED_USERNAME);
  const hash = await hashPassword(SEED_PASSWORD);
  if (!user) {
    await db.createUser(database, SEED_USERNAME, hash);
  } else if (user.password_hash === '' || !(await verifyPassword(user.password_hash, SEED_PASSWORD))) {
    await db.updateUserPasswordHash(database, user.id, hash);
  }

  user = (await db.getUserByUsername(database, SEED_USERNAME))!;
  const hotkeys = await db.getHotkeys(database, user.id);
  if (hotkeys.length === 0) {
    const prepared = [];
    for (let pos = 1; pos <= 9; pos++) {
      prepared.push(
        database
          .prepare('INSERT INTO user_hotkeys (user_id, position, key) VALUES (?, ?, ?) ON CONFLICT (user_id, position) DO UPDATE SET key = excluded.key')
          .bind(user.id, pos, String(pos)),
      );
    }
    await database.batch(prepared);
  }
}

// seedIfNeeded ensures the hardcoded user and default hotkeys exist exactly once
// per isolate, mirroring the POC's seed-on-startup behavior.
export function seedIfNeeded(database: D1Database): Promise<void> {
  if (!seedPromise) seedPromise = doSeed(database).catch((err) => {
    seedPromise = null;
    throw err;
  });
  return seedPromise;
}

// --- session middleware ---

export async function sessionUser(c: Context<any>): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token) return null;
  return db.getSessionUser(c.env.DB, token, new Date().toISOString());
}

// requireUser is Hono middleware: validate the session cookie and inject the
// authenticated user, or return 401 JSON.
export const requireUser: MiddlewareHandler<{ Bindings: { DB: D1Database }; Variables: { user: User } }> = async (c, next) => {
  const user = await sessionUser(c);
  if (!user) return c.json({ error: 'not authenticated' }, 401);
  c.set('user', user);
  await next();
};

// userFrom returns the authenticated user previously injected by requireUser.
export function userFrom(c: Context<any>): User {
  return c.get('user');
}