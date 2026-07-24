// Domain — month grid + per-day spend for the budget home calendar banner (A1b)
// and the 7-day spend graph (A1/A1c). PURE functions only, no imports from ui/db.
// Weeks are ISO (Monday start) per README §3 — the same weeks streaks use.
import type { Account, Transaction } from '../db/repositories/types';

/** Days in 'YYYY-MM'. Day 0 of the next month = last day of this one (leap-safe). */
export function daysInMonth(month: string): number {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
}

/** ISO weekday index of a 'YYYY-MM-DD' date: Monday = 0 … Sunday = 6 (§3). */
export function isoWeekdayIndex(date: string): number {
  const d = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return (d.getDay() + 6) % 7; // JS Sunday = 0 → ISO Sunday = 6
}

/** Blank cells before day 1 in a Monday-start grid (Jul 2026 starts Wednesday → 2). */
export function leadingBlanks(month: string): number {
  return isoWeekdayIndex(`${month}-01`);
}

/** Shift an ISO date by whole days, staying in ISO 'YYYY-MM-DD' (crosses months/years). */
export function addDays(date: string, delta: number): string {
  const d = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Expense spend per ISO date within `month`, active accounts only.
 * Invariant 3 holds per month: Σ values ≡ E(t) (stats.expenses).
 */
export function spendByDay(
  accounts: Account[],
  transactions: Transaction[],
  month: string,
): Map<string, number> {
  return sumExpensesByDate(accounts, transactions, (date) => date.slice(0, 7) === month);
}

/**
 * Same, over an inclusive ISO date range — the graph window spans month boundaries,
 * so it can't use the month-scoped map above.
 */
export function spendByDayInRange(
  accounts: Account[],
  transactions: Transaction[],
  startISO: string,
  endISO: string,
): Map<string, number> {
  return sumExpensesByDate(accounts, transactions, (date) => date >= startISO && date <= endISO);
}

function sumExpensesByDate(
  accounts: Account[],
  transactions: Transaction[],
  inWindow: (date: string) => boolean,
): Map<string, number> {
  const active = new Set(accounts.filter((a) => !a.archived).map((a) => a.id));
  const sums = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== 'expense' || !inWindow(t.date) || !active.has(t.account_id)) continue;
    sums.set(t.date, (sums.get(t.date) ?? 0) + t.amount);
  }
  return sums;
}

/** Σ cap spread evenly over the month — the "over cap" line of a single day. Σ cap 0 → null (§8.7 guard). */
export function dailyCapAverage(totalCap: number, month: string): number | null {
  if (totalCap <= 0) return null;
  return totalCap / daysInMonth(month);
}

export type DayLevel = 'none' | 'light' | 'heavy' | 'over';

export interface MonthDayCell {
  /** null on the leading/trailing blanks that pad the grid to whole weeks. */
  date: string | null;
  day: number | null;
  spend: number;
  level: DayLevel;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * Heat level of one day's spend (A1b legend: navy heavy · pale light · saffron over cap).
 * With caps the scale is cap-relative; without caps nothing can be "over", so the
 * month's own mean spend/day splits heavy from light.
 */
function levelOf(spend: number, dayCap: number | null, meanSpend: number): DayLevel {
  if (spend <= 0) return 'none';
  if (dayCap !== null) {
    if (spend > dayCap) return 'over';
    return spend >= dayCap / 2 ? 'heavy' : 'light';
  }
  return meanSpend > 0 && spend >= meanSpend ? 'heavy' : 'light';
}

/**
 * The A1b calendar grid: Monday-start, padded with blanks to whole 7-cell rows
 * (Jul 2026 → 2 leading blanks + 31 days + 2 trailing = 35 cells, 5 rows).
 */
export function monthGrid(
  month: string,
  todayISO: string,
  spend: Map<string, number>,
  dayCap: number | null,
): MonthDayCell[] {
  const total = daysInMonth(month);
  const spent = [...spend.values()].reduce((sum, v) => sum + v, 0);
  const meanSpend = spent / total;

  const blank: MonthDayCell = { date: null, day: null, spend: 0, level: 'none', isToday: false, isFuture: false };
  const cells: MonthDayCell[] = Array.from({ length: leadingBlanks(month) }, () => ({ ...blank }));

  for (let day = 1; day <= total; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const amount = spend.get(date) ?? 0;
    cells.push({
      date,
      day,
      spend: amount,
      level: levelOf(amount, dayCap, meanSpend),
      isToday: date === todayISO,
      isFuture: date > todayISO,
    });
  }

  while (cells.length % 7 !== 0) cells.push({ ...blank });
  return cells;
}

export interface DaySpend {
  date: string;
  /** Monday = 0 … Sunday = 6 (§3). */
  weekdayIndex: number;
  spend: number;
}

/**
 * The 7 days ending on `endISO` (oldest first), zero-filled — the A1/A1c graph window.
 * `spend` may span more than one month, so callers merge maps before passing them in.
 */
export function lastSevenDays(spend: Map<string, number>, endISO: string): DaySpend[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(endISO, i - 6);
    return { date, weekdayIndex: isoWeekdayIndex(date), spend: spend.get(date) ?? 0 };
  });
}

export function sumSpend(days: DaySpend[]): number {
  return days.reduce((sum, d) => sum + d.spend, 0);
}

/** Mean spend per day over the window; empty window → null (§8.7: never divide by 0). */
export function averagePerDay(days: DaySpend[]): number | null {
  if (days.length === 0) return null;
  return sumSpend(days) / days.length;
}
