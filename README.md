# Polyglot

A self-hosted flashcard (spaced-repetition) app that runs entirely on
Cloudflare's developer platform: a single **Cloudflare Worker** (Hono) with a
**D1** SQLite database, plus a **React** single-page app served as static
assets by the same Worker.

This project is a rewrite of that proof-of-concept that runs on Cloudflare's
Worker platform instead of a Go server. The learning algorithm is **FSRS**
(via the `ts-fsrs` package), and passwords are hashed with **PBKDF2-SHA256**
using the Web Crypto API.

> Default local login: user `admin`, password `polyglot`.

---

## What you need installed

- **Node.js 20+** (this repo uses `type: module` and modern tooling)
- **npm** (comes with Node)

That's it for local development — the local D1 database is just a SQLite file
in `.wrangler/`, no separate database server needed.

---

## Getting started

```bash
# 1. install dependencies
npm install

# 2. create the local database schema
npm run db:init

# 3. load the example dataset
npm run db:seed

# 4. run the dev server
npm run dev
```

Then open http://localhost:5173 , click **Sign in**, and use `admin` /
`polyglot`.

> If the `admin` user doesn't exist yet (for example right after
> `npm run db:init`), the Worker creates it automatically on the first
> request. It also re-creates it with the known password if the stored one
> doesn't match, so you always have a working entry point in development.

### Other useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server (Vite + Worker + local D1) |
| `npm run build` | Type-check everything and build `dist/` |
| `npm run lint` | Run the Oxlint linter |
| `npm run preview` | Build and preview the production bundle locally |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |
| `npm run db:init` | Apply `db/schema.sql` to the **local** database |
| `npm run db:seed` | Load `db/seed_1500_common_chinese_characters.sql` locally |
| `npm run db:reset` | Delete the local database and re-init it from scratch |
| `npm run db:init:remote` | Apply the schema to the **remote** D1 database |
| `npm run db:seed:remote` | Load the seed data into the **remote** database |

### Resetting everything

```bash
npm run db:reset   # wipes the local database, re-applies the schema
npm run db:seed    # load the example dataset again
```

---

## Project structure

```
db/
  schema.sql                              # D1 schema (all tables)
  seed_1500_common_chinese_characters.sql # example dataset (15 sets, 100 cards each)
worker/
  index.ts                                # Hono app: all API routes + SPA fallback
  auth.ts                                 # PBKDF2 hashing, sessions, seed logic
  db.ts                                   # typed D1 queries
  fsrs.ts                                 # FSRS scheduling wrapper (ts-fsrs)
  models.ts                               # domain helpers (streaks, progress, ...)
src/
  main.tsx                                # React entry point + routing
  components/                             # Layout, Navbar, Footer, Modal
  pages/                                  # Dashboard, Login, NewSet, SetPage, Study, Settings
  lib/auth.ts                             # React auth context
  types.ts                                # shared frontend types
  index.css                               # global styles
wrangler.jsonc                            # Worker + D1 + assets configuration
worker-configuration.d.ts                 # generated Cloudflare types
```

---

## How it works

### One Worker serves both the API and the website

`wrangler.jsonc` configures a single Worker with:

- a **D1 database** binding (the `DB` binding → `polyglot_dev`),
- a **static assets** directory (the built React app, `ASSETS` binding).

The React app is a normal client-side SPA. The Worker exposes a JSON API under
`/api/*`. Client-side routes like `/sets/1` don't exist as real files, so a
catch-all route calls `ASSETS.fetch()`, and
`not_found_handling: "single-page-application"` makes Cloudflare return
`index.html` for those paths.

### The data model

- `users` — one account. `sessions` — login cookies: the cookie value is a
  random 256-bit token that is also stored in the DB with a 7-day expiry.
- `flashcard_sets` — a set of cards (e.g. "Chinese Characters 1–100").
- `set_faces` — the *column layout* of a set (e.g. `word`, `definition`,
  `pinyin`, …). Every card in the set has one text field per face.
- `flashcards` + `flashcard_fields` — cards and their per-face text values.
- `study_sessions` / `card_reviews` — one session per study run, with one row
  per answered card.
- `card_fsrs` — per-user, per-card FSRS scheduling state (due date, stability,
  difficulty, repetitions, …).
- `user_hotkeys` — which keyboard key maps to which face during a study
  session (stored per position, positions 1–9 seeded by default).

### The API (`worker/index.ts`)

| Method & path | Purpose |
| --- | --- |
| `GET /api/auth` | Is the request authenticated? |
| `POST /api/auth/login` | Verify password, create a session cookie |
| `POST /api/auth/logout` | Delete the session |
| `GET /api/dashboard` | Streak + per-set counts and progress |
| `POST /api/sets` | Create a set (always starts with `word`, `definition` faces) |
| `GET /api/sets/:id` | Set info, faces, all cards with their fields |
| `POST /api/sets/:id/cards` | Add a card (fields keyed by face id) |
| `POST /api/sets/:id/cards/:cardId` | Update a card's fields |
| `POST /api/sets/:id/cards/delete` | Delete many cards at once |
| `POST /api/sets/:id/cards/:cardId/delete` | Delete one card |
| `POST /api/sets/:id/faces` | Add a face (new column across all cards) |
| `POST /api/sets/:id/faces/:faceId/delete` | Remove a face (keeps ≥ 2) |
| `GET /api/sets/:id/study` | Start a session: cards sorted by due date + hotkeys |
| `POST /api/sets/:id/study/review` | Answer a card: records review, runs FSRS |
| `GET /api/settings` | Read hotkey configuration |
| `POST /api/settings` | Update hotkeys (validates single key, no duplicates) |

All `/api` routes except auth/health check the session cookie. The `requireUser`
middleware injects the current user into the request context, and auth failures
return `401` JSON.

### Scheduling with FSRS

FSRS scheduling is implemented in `worker/fsrs.ts` using `ts-fsrs`. Its default
parameters are configured to match the Go `go-fsrs` defaults used by the POC
(`enable_short_term` off, no learning/relearning steps), so scheduling behaviour
is essentially the same. When you review a card, `card_fsrs` is updated and the
card's next due date is stored as an ISO timestamp; the study endpoint orders
cards by that due date.

### Seeding and the example dataset

`db/schema.sql` creates all tables. `db/seed_1500_common_chinese_characters.sql`
inserts 15 demonstration sets of 100 cards — the 1500 most common Chinese
characters split by frequency rank ("Chinese Characters 1–100" … "Chinese
Characters 1401–1500") — with six faces (`word`, `definition`, `pinyin`,
`example sentence`, `example pinyin`, `example translation`), totalling 1500
cards and 9000 fields.

The seed driver script in `package.json` simply passes these files to
`wrangler d1 execute`. Wrangler splits the SQL on semicolons, splitting rows.

The `admin` user and default hotkeys are **not** in SQL files — they are seeded
lazily by the Worker on its first request (see `seedIfNeeded` in
`worker/auth.ts`).

### Passwords

Passwords are hashed with PBKDF2-SHA256 (100,000 iterations, 16-byte random
salt, 32-byte key) using only the browser-equivalent Web Crypto API available
in Workers (`worker/auth.ts`). Stored hashes look like:

```
pbkdf2_sha256$100000$<base64 salt>$<base64 hash>
```

---

## Deploying

Requires a Cloudflare account. Create a D1 database and put its id in
`wrangler.jsonc`:

```bash
npm run db:init:remote   # apply the schema to the remote database
npm run db:seed:remote   # load the example dataset
npm run deploy           # build + upload the Worker + assets
```

Then open the Worker's URL. `admin` / `polyglot` will be seeded on the first
request, exactly like in local development.