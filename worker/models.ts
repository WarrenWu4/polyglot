// Domain helpers and JSON response shapes for the React frontend.

export interface ApiSet {
  id: number;
  name: string;
  description: string;
  flashcardCount: number;
  studyCount: number;
  progress: number;
}

export interface ApiSetInfo {
  id: number;
  name: string;
  description: string;
}

export interface ApiFace {
  id: number;
  name: string;
  position: number;
}

export interface ApiField {
  faceId: number;
  name: string;
  value: string;
}

export interface ApiCard {
  id: number;
  fields: ApiField[];
}

export interface ApiSettingsResponse {
  hotkeys: { position: number; key: string }[];
}

export interface ApiStudyResponse {
  sessionId: number | null;
  setId: number;
  setName: string;
  hotkeys: Record<number, string>;
  hotkeyRows: { position: number; key: string }[];
  faceNames: string[];
  cards: {
    id: number;
    fields: { name: string; value: string }[];
  }[];
}

// IsStudySession reports whether a pass through a set qualifies as a "study"
// per the dashboard spec: at least 5 cards reviewed, or at least 20% of the set.
export function isStudySession(cardsReviewed: number, setSize: number): boolean {
  if (cardsReviewed >= 5) return true;
  return setSize > 0 && cardsReviewed * 5 >= setSize;
}

// ComputeProgress returns the percentage of cards mastered (0-100).
export function computeProgress(mastered: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor((mastered * 100) / total);
}

// ComputeStreak returns the number of consecutive days (ending today or
// yesterday) on which the user studied. Dates must be "YYYY-MM-DD" strings.
export function computeStreak(dates: string[]): number {
  const present = new Set(dates.filter((d) => d !== ''));

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const minusDay = (d: Date) => new Date(d.getTime() - 86_400_000);

  let cursor = today;
  // Allow the current day to not yet be studied: if today is missing but
  // yesterday was studied, the streak is still alive.
  if (!present.has(fmt(today))) {
    if (present.has(fmt(minusDay(today)))) {
      cursor = minusDay(today);
    } else {
      return 0;
    }
  }

  let count = 0;
  while (present.has(fmt(cursor))) {
    count++;
    cursor = minusDay(cursor);
  }
  return count;
}

// validHotkeyKey reports whether a key is a single letter or digit.
export function validHotkeyKey(key: string): boolean {
  if (key.length !== 1) return false;
  const c = key.charCodeAt(0);
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}