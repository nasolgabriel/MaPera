// Domain — §7.3 payday split. PURE functions only, no imports from ui/db.
// All money integer centavos; percentages integer basis points (5000 = 50%) — no floats.
import { daysInMonth } from './calendar';

/** Where an allocation goes: a category cap for the month, or a transfer to an account. */
export type SplitTarget =
  | { type: 'budget'; category_id: string }
  | { type: 'account'; account_id: string };

export interface SplitBucket {
  target: SplitTarget;
  mode: 'percent' | 'fixed';
  /** percent → basis points (5000 = 50%); fixed → centavos. */
  value: number;
}

export interface SplitAllocation {
  bucket: SplitBucket;
  /** Centavos allocated to this bucket. */
  amount: number;
}

export interface SplitResult {
  allocations: SplitAllocation[];
  /** income − Σ allocations. Never negative unless overAllocated. */
  leftFree: number;
  /** Σ allocations > income — UI must disable Apply. */
  overAllocated: boolean;
}

/**
 * Allocate an income into buckets, centavo-exact (B4 accept criterion).
 * Fixed buckets take value verbatim; percent buckets take floor(income × bp / 10000)
 * so sub-centavo dust always lands in leftFree, and Σ allocations + leftFree ≡ income.
 */
export function allocateSplit(incomeCentavos: number, buckets: SplitBucket[]): SplitResult {
  const allocations = buckets.map((bucket) => ({
    bucket,
    amount:
      bucket.mode === 'fixed'
        ? bucket.value
        : Math.floor((incomeCentavos * bucket.value) / 10000),
  }));
  const total = allocations.reduce((sum, a) => sum + a.amount, 0);
  return {
    allocations,
    leftFree: incomeCentavos - total,
    overAllocated: total > incomeCentavos,
  };
}

/**
 * Parse a preset's buckets JSON (split_presets.buckets is JSON-as-text).
 * JSON.parse + shape validation, never eval. Malformed → null.
 */
export function parsePresetBuckets(json: string): SplitBucket[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const buckets: SplitBucket[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const b = item as Record<string, unknown>;
    if (b.mode !== 'percent' && b.mode !== 'fixed') return null;
    if (typeof b.value !== 'number' || !Number.isInteger(b.value) || b.value < 0) return null;
    const t = b.target as Record<string, unknown> | undefined;
    if (typeof t !== 'object' || t === null) return null;
    let target: SplitTarget;
    if (t.type === 'budget' && typeof t.category_id === 'string') {
      target = { type: 'budget', category_id: t.category_id };
    } else if (t.type === 'account' && typeof t.account_id === 'string') {
      target = { type: 'account', account_id: t.account_id };
    } else {
      return null;
    }
    buckets.push({ target, mode: b.mode, value: b.value });
  }
  return buckets;
}

/**
 * Days left in `month` ('YYYY-MM') as seen from `todayISO`, counting today.
 * Month already past → 0 (dailySafeSpend guard renders "—"); future month → full length.
 */
export function daysLeftInMonth(todayISO: string, month: string): number {
  const length = daysInMonth(month); // shared with the calendar grid — one definition
  const todayMonth = todayISO.slice(0, 7);
  if (todayMonth === month) return length - Number(todayISO.slice(8, 10)) + 1;
  return todayMonth > month ? 0 : length;
}
