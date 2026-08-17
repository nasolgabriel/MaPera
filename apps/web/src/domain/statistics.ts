// Domain — §8.7 trends + the Statistics screen's monthly series (§6.4). PURE functions,
// no imports from ui/db. Every per-month figure is re-derived from the raw transaction
// set so editing/deleting a transaction recomputes everything (invariant 4) — nothing is
// cached. Money math (I/E/S_net/free_cash_flow/total_saved) is reused verbatim from stats.ts.
import type { Account, Transaction } from '../db/repositories/types';
import { accountBalance, expenses, freeCashFlow, isSavingsAccount, totalSaved } from './stats';

/** One point of a monthly time series. */
export interface SeriesPoint {
  /** Month key 'YYYY-MM'. */
  month: string;
  /** Value in integer centavos. */
  value: number;
  /** True only for the live current month — drawn dashed/hollow, excluded from mom_change
   *  (§8.7: "comparing 12 days against 31 is the classic misleading chart"). */
  partial: boolean;
}

/** month + count as a single number so months order/subtract cleanly. */
function monthIndex(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return y! * 12 + (m! - 1);
}

/** 'YYYY-MM' key `delta` months from `month` (delta may be negative). */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The `count` month keys ending at (and including) currentMonth, oldest first. */
export function monthKeys(currentMonth: string, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) keys.push(shiftMonth(currentMonth, -i));
  return keys;
}

/**
 * total_saved as of the end of `month` (§8.1) — the cumulative savings balance the line
 * chart plots per month. Counts only transactions dated in `month` or earlier; 'YYYY-MM'
 * prefixes compare lexicographically so a string compare is the whole month filter.
 */
export function totalSavedAsOf(accounts: Account[], transactions: Transaction[], month: string): number {
  const upToMonth = transactions.filter((t) => t.date.slice(0, 7) <= month);
  return totalSaved(accounts, upToMonth);
}

/** Mark a series point partial iff it is the live current month. */
function point(month: string, value: number, currentMonth: string): SeriesPoint {
  return { month, value, partial: month === currentMonth };
}

/** Cumulative total_saved per month (§8.1) — the "is my money growing?" hero line (§6.4). */
export function savingsSeries(
  accounts: Account[],
  transactions: Transaction[],
  months: string[],
  currentMonth: string,
): SeriesPoint[] {
  return months.map((m) => point(m, totalSavedAsOf(accounts, transactions, m), currentMonth));
}

/** E(t) per month (§8.1) — the spend-by-month bars (§6.4). */
export function expenseSeries(
  accounts: Account[],
  transactions: Transaction[],
  months: string[],
  currentMonth: string,
): SeriesPoint[] {
  return months.map((m) => point(m, expenses(accounts, transactions, m), currentMonth));
}

/** free_cash_flow(t) per month (§8.1) — the Net tab; may be negative (§6.4). */
export function netSeries(
  accounts: Account[],
  transactions: Transaction[],
  months: string[],
  currentMonth: string,
): SeriesPoint[] {
  return months.map((m) => point(m, freeCashFlow(accounts, transactions, m), currentMonth));
}

/** rolling_avg = mean(last `window` periods). §8.7 — empty input → null (never NaN). */
export function rollingAvg(values: number[], window = 3): number | null {
  if (values.length === 0) return null;
  const last = values.slice(-window);
  return last.reduce((sum, v) => sum + v, 0) / last.length;
}

/** Trailing rolling average at each point (§8.7) — the dashed comparison fallback. */
export function rollingAvgSeries(points: SeriesPoint[], window = 3): Array<number | null> {
  const values = points.map((p) => p.value);
  return points.map((_, i) => rollingAvg(values.slice(0, i + 1), window));
}

/** Earliest month key present in the data, or null when there are no transactions. */
function earliestMonth(transactions: Transaction[]): string | null {
  let earliest: string | null = null;
  for (const t of transactions) {
    const m = t.date.slice(0, 7);
    if (earliest === null || m < earliest) earliest = m;
  }
  return earliest;
}

/**
 * Dashed comparison for the savings line (math-doc §5): the same month a year earlier
 * once ≥13 months of history exist, otherwise a trailing rolling average (§8.7). With a
 * short window (the app ships a 6-month view) this is the rolling-average path; the
 * year-ago branch activates on its own as history accumulates.
 */
export function savingsComparison(
  accounts: Account[],
  transactions: Transaction[],
  months: string[],
  currentMonth: string,
): Array<number | null> {
  const rolling = rollingAvgSeries(savingsSeries(accounts, transactions, months, currentMonth));
  const earliest = earliestMonth(transactions);
  const hasYear = earliest !== null && monthIndex(currentMonth) - monthIndex(earliest) >= 12;
  if (!hasYear) return rolling;
  return months.map((m) => totalSavedAsOf(accounts, transactions, shiftMonth(m, -12)));
}

export interface AccountSeries {
  account: Account;
  points: SeriesPoint[];
}

export function accountBalanceAsOf(
  account: Account,
  transactions: Transaction[],
  month: string,
): number {
  return accountBalance(account, transactions.filter((t) => t.date.slice(0, 7) <= month));
}

export function accountSeries(
  account: Account,
  transactions: Transaction[],
  months: string[],
  currentMonth: string,
): SeriesPoint[] {
  return months.map((m) => point(m, accountBalanceAsOf(account, transactions, m), currentMonth));
}

export function accountGrowthSeries(
  accounts: Account[],
  transactions: Transaction[],
  months: string[],
  currentMonth: string,
): AccountSeries[] {
  return accounts
    .filter((a) => !a.archived && isSavingsAccount(a))
    .map((account) => ({ account, points: accountSeries(account, transactions, months, currentMonth) }));
}
