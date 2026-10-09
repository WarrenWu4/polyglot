import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs';
import * as db from './db';

// Match the POC's go-fsrs v4 defaults: FSRS-managed scheduling without short-term
// (learning/relearning) steps.
const scheduler = fsrs(generatorParameters({ enable_short_term: false, learning_steps: [], relearning_steps: [] }));

export interface FSRSCardState {
  due: string;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: string | null;
}

function toFSRSCardState(card: Card): FSRSCardState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  };
}

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? fallback : t;
}

// loadCard loads the FSRS state for a card, or an empty (new) card if the user
// has never reviewed it.
async function loadCard(database: D1Database, userId: number, flashcardId: number, now: Date): Promise<Card> {
  const row = await db.getCardFSRS(database, userId, flashcardId);
  if (!row) return createEmptyCard(now);
  return {
    due: parseDate(row.due, now),
    stability: row.stability,
    difficulty: row.difficulty,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? parseDate(row.last_review, now) : undefined,
    elapsed_days: 0,
    learning_steps: 0,
  } as Card;
}

// schedule applies a rating (know -> Good, dont-know -> Again) and persists the
// rescheduled card into the card_fsrs table.
export async function scheduleReview(
  database: D1Database,
  userId: number,
  flashcardId: number,
  know: boolean,
): Promise<FSRSCardState> {
  const now = new Date();
  const card = await loadCard(database, userId, flashcardId, now);
  const rating = know ? Rating.Good : Rating.Again;
  const log = scheduler.next(card, now, rating);
  const updated = log.card;

  const state = toFSRSCardState(updated);
  await db.upsertCardFSRS(database, {
    userId,
    flashcardId,
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    scheduledDays: state.scheduledDays,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    lastReview: state.lastReview,
  });
  return state;
}