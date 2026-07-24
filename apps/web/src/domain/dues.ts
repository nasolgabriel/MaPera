// Domain — §8.5 monthly dues + recurring schedule math. PURE functions only, no imports from ui/db.
// recurring.template is JSON-as-text (the txn a due posts) — parsed here with JSON.parse + full
// shape validation, NEVER eval (same rule as domain/split parsePresetBuckets).
import { daysInMonth } from './calendar';
import type { Recurring, Transaction } from '../db/repositories/types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The transaction a recurring posts when it comes due (recurring.template, JSON-as-text). */
export interface RecurringTemplate {
  amount: number; // integer centavos
  kind: 'expense' | 'income' | 'transfer';
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  note: string | null;
  /** loans only: total scheduled payments, for the "14 of 24" progress read. */
  total_payments: number | null;
  /** custom cadence only: months between occurrences (annual = 12). Ignored when frequency=monthly. */
  interval_months: number | null;
}

/**
 * Parse a recurring's template JSON (recurring.template is JSON-as-text).
 * JSON.parse + shape validation, never eval — a fresh typed object is rebuilt, the raw
 * value never passes through. Malformed → null (caller skips the row).
 */
export function parseRecurringTemplate(json: string): RecurringTemplate | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;

  if (typeof t.amount !== 'number' || !Number.isInteger(t.amount) || t.amount < 0) return null;
  if (t.kind !== 'expense' && t.kind !== 'income' && t.kind !== 'transfer') return null;
  if (typeof t.account_id !== 'string') return null;

  const to_account_id = nullableString(t.to_account_id);
  if (to_account_id === INVALID) return null;
  const category_id = nullableString(t.category_id);
  if (category_id === INVALID) return null;
  const note = nullableString(t.note);
  if (note === INVALID) return null;

  const total_payments = nullablePositiveInt(t.total_payments);
  if (total_payments === INVALID) return null;
  const interval_months = nullablePositiveInt(t.interval_months);
  if (interval_months === INVALID) return null;

  return {
    amount: t.amount,
    kind: t.kind,
    account_id: t.account_id,
    to_account_id,
    category_id,
    note,
    total_payments,
    interval_months,
  };
}

const INVALID = Symbol('invalid');

/** A field that must be `string | null | undefined`; undefined normalises to null. */
function nullableString(v: unknown): string | null | typeof INVALID {
  if (v === undefined || v === null) return null;
  return typeof v === 'string' ? v : INVALID;
}

/** A field that must be a positive integer, `null`, or absent (→ null). */
function nullablePositiveInt(v: unknown): number | null | typeof INVALID {
  if (v === undefined || v === null) return null;
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : INVALID;
}

/**
 * The date one cycle after `nextDue`, day-of-month preserved and clamped (Jan 31 → Feb 28).
 * monthly steps one month; custom steps `intervalMonths` (annual = 12, the default).
 */
export function nextDueAfter(
  nextDue: string,
  frequency: Recurring['frequency'],
  intervalMonths?: number | null,
): string {
  const step = frequency === 'custom' ? intervalMonths ?? 12 : 1;
  const year = Number(nextDue.slice(0, 4));
  const month0 = Number(nextDue.slice(5, 7)) - 1;
  const day = Number(nextDue.slice(8, 10));
  const target = new Date(year, month0 + step, 1); // day 1 avoids roll-over during the shift
  const ty = target.getFullYear();
  const tm = `${ty}-${String(target.getMonth() + 1).padStart(2, '0')}`;
  const clampedDay = Math.min(day, daysInMonth(tm));
  return `${tm}-${String(clampedDay).padStart(2, '0')}`;
}

export interface DueRow {
  id: string;
  name: string;
  amount: number; // centavos, from the template
  dueDay: number; // day-of-month of next_due
  kind: Recurring['kind'];
  paid: boolean;
  /** loans only — for the "14 of 24" read (paid = total − remaining). */
  loanTotal: number | null;
  loanRemaining: number | null;
}

/**
 * Dues scheduled in `month` (§8.5 due_this_month), one row per non-transfer recurring.
 * Membership = next_due ∈ month OR a linked txn already sits in month (recovers auto-posted
 * rows whose next_due has rolled forward). Transfers are auto-transfers (savings badges), not
 * dues, so they're excluded. Amount comes from the template — a due only hits E once it's
 * actually logged (its one linked txn), so this total never double-counts.
 */
export function dueThisMonth(
  recurrings: Recurring[],
  transactions: Transaction[],
  month: string,
): DueRow[] {
  const rows: DueRow[] = [];
  for (const r of recurrings) {
    if (r.kind === 'transfer') continue;
    const tmpl = parseRecurringTemplate(r.template);
    if (tmpl === null) continue;

    const linked = transactions.some(
      (t) => t.recurring_id === r.id && t.date.slice(0, 7) === month,
    );
    const scheduledHere = r.next_due.slice(0, 7) === month;
    if (!linked && !scheduledHere) continue;

    rows.push({
      id: r.id,
      name: tmpl.note && tmpl.note.trim() !== '' ? tmpl.note : capitalize(r.kind),
      amount: tmpl.amount,
      dueDay: Number(r.next_due.slice(8, 10)),
      kind: r.kind,
      paid: linked,
      loanTotal: tmpl.total_payments,
      loanRemaining: r.remaining_payments,
    });
  }
  return rows;
}

/** Σ amount over the rows — the "due this month" figure. */
export function duesTotal(rows: DueRow[]): number {
  return rows.reduce((sum, r) => sum + r.amount, 0);
}

/** still_due (§8.5) = Σ amount over the unpaid rows. */
export function stillDue(rows: DueRow[]): number {
  return rows.reduce((sum, r) => (r.paid ? sum : sum + r.amount), 0);
}

export interface NextMonthDues {
  total: number; // Σ amount projected into next month
  delta: number; // total − this-month total (signed)
  reason: string | null; // one-line diff note, null when nothing changes
}

/**
 * due_next_month (§8.5): project each recurring's schedule into the month after `month`.
 * Monthly recurs always; loans only while payments remain; customs/annuals only in an
 * anniversary month. The diff note names what changed (a loan ending, an annual landing).
 */
export function dueNextMonth(recurrings: Recurring[], month: string): NextMonthDues {
  const nextM = addMonth(month, 1);
  let thisTotal = 0;
  let nextTotal = 0;
  const appeared: string[] = []; // in next month, not this
  const dropped: string[] = []; // in this month, not next

  for (const r of recurrings) {
    if (r.kind === 'transfer') continue;
    const tmpl = parseRecurringTemplate(r.template);
    if (tmpl === null) continue;
    const here = occursInMonth(r, tmpl, month);
    const next = occursInMonth(r, tmpl, nextM);
    if (here) thisTotal += tmpl.amount;
    if (next) nextTotal += tmpl.amount;
    const name = tmpl.note && tmpl.note.trim() !== '' ? tmpl.note : capitalize(r.kind);
    if (next && !here) appeared.push(name);
    if (here && !next) dropped.push(name);
  }

  return { total: nextTotal, delta: nextTotal - thisTotal, reason: diffReason(appeared, dropped, nextM) };
}

/** Whether recurring `r` has a scheduled occurrence in `targetMonth`. */
function occursInMonth(r: Recurring, tmpl: RecurringTemplate, targetMonth: string): boolean {
  const index = monthsBetween(r.next_due.slice(0, 7), targetMonth);
  if (index < 0) return false; // targetMonth is before the schedule starts
  if (r.frequency === 'custom') {
    const step = tmpl.interval_months ?? 12;
    return index % step === 0; // anniversary months only
  }
  // monthly: loans run out after remaining_payments occurrences (index 0 = the next payment)
  if (r.kind === 'loan' && r.remaining_payments !== null) return index < r.remaining_payments;
  return true;
}

function diffReason(appeared: string[], dropped: string[], nextMonth: string): string | null {
  if (appeared.length > 0) {
    return `${appeared[0]} lands in ${MONTH_NAMES[Number(nextMonth.slice(5, 7)) - 1]}`;
  }
  if (dropped.length > 0) return `${dropped[0]} ends`;
  return null;
}

/** Whole-month offset from `fromMonth` to `toMonth` ('YYYY-MM'), signed. */
function monthsBetween(fromMonth: string, toMonth: string): number {
  const fy = Number(fromMonth.slice(0, 4));
  const fm = Number(fromMonth.slice(5, 7));
  const ty = Number(toMonth.slice(0, 4));
  const tm = Number(toMonth.slice(5, 7));
  return (ty - fy) * 12 + (tm - fm);
}

/** 'YYYY-MM' shifted by whole months. */
function addMonth(month: string, delta: number): string {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
