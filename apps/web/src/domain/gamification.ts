import type { Account, Budget, Sweep, Transaction } from '../db/repositories/types';
import { addDays, isoWeekdayIndex } from './calendar';
import { budgetRemaining } from './budgets';
import { accountsById, savingsFlow } from './stats';
import { totalSavedAsOf } from './statistics';

export const MILESTONE_STEPS: readonly number[] = [
  1000000, 5000000, 10000000, 25000000, 50000000, 100000000,
];

export const STREAK_HISTORY_WEEKS = 8;

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86400000);
}

function monthIndex(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return y! * 12 + (m! - 1);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function isoWeekStart(date: string): string {
  return addDays(date, -isoWeekdayIndex(date));
}

export function isoWeekEnd(date: string): string {
  return addDays(isoWeekStart(date), 6);
}

export function isoWeekKey(date: string): string {
  const thursday = addDays(isoWeekStart(date), 3);
  const year = thursday.slice(0, 4);
  const firstThursday = addDays(isoWeekStart(`${year}-01-04`), 3);
  const week = Math.floor(daysBetween(firstThursday, thursday) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function sNetByWeek(accounts: Account[], transactions: Transaction[]): Map<string, number> {
  const byId = accountsById(accounts);
  const weeks = new Map<string, number>();
  for (const t of transactions) {
    const flow = savingsFlow(byId, t);
    if (flow === 0) continue;
    const key = isoWeekKey(t.date);
    weeks.set(key, (weeks.get(key) ?? 0) + flow);
  }
  return weeks;
}

export interface StreakWeek {
  week: string;
  start: string;
  end: string;
  sNet: number;
  swept: boolean;
  current: boolean;
}

export interface StreakInfo {
  weeks: number;
  history: StreakWeek[];
}

export function sweptWeekKeys(sweeps: Sweep[], transactions: Transaction[]): Set<string> {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const keys = new Set<string>();
  for (const s of sweeps) {
    const txn = byId.get(s.transaction_id);
    if (txn !== undefined) keys.add(isoWeekKey(txn.date));
  }
  return keys;
}

export function streak(
  accounts: Account[],
  transactions: Transaction[],
  todayISO: string,
  sweptWeeks: ReadonlySet<string> = new Set(),
): StreakInfo {
  const perWeek = sNetByWeek(accounts, transactions);
  const currentKey = isoWeekKey(todayISO);
  const history: StreakWeek[] = [];
  let weeks = 0;
  let cursor = isoWeekStart(todayISO);

  for (;;) {
    const key = isoWeekKey(cursor);
    const net = perWeek.get(key) ?? 0;
    if (net <= 0) {
      if (key === currentKey) {
        cursor = addDays(cursor, -7);
        continue;
      }
      break;
    }
    const swept = sweptWeeks.has(key);
    history.push({
      week: key,
      start: cursor,
      end: addDays(cursor, 6),
      sNet: net,
      swept,
      current: key === currentKey,
    });
    weeks += swept ? 2 : 1;
    cursor = addDays(cursor, -7);
  }

  history.reverse();
  return { weeks, history };
}

export function streakBars(info: StreakInfo, count = STREAK_HISTORY_WEEKS): StreakWeek[] {
  return info.history.slice(-count);
}

export interface MilestoneRow {
  amount: number;
  reached: boolean;
  reachedMonth: string | null;
  monthsTaken: number | null;
  toGo: number | null;
  next: boolean;
}

function earliestMonth(transactions: Transaction[]): string | null {
  let earliest: string | null = null;
  for (const t of transactions) {
    const m = t.date.slice(0, 7);
    if (earliest === null || m < earliest) earliest = m;
  }
  return earliest;
}

export function milestones(
  accounts: Account[],
  transactions: Transaction[],
  currentMonth: string,
  steps: readonly number[] = MILESTONE_STEPS,
): MilestoneRow[] {
  const start = earliestMonth(transactions);
  const months: string[] = [];
  if (start !== null && start <= currentMonth) {
    for (let m = start; m <= currentMonth; m = shiftMonth(m, 1)) months.push(m);
  }
  const saved = months.map((m) => ({ month: m, total: totalSavedAsOf(accounts, transactions, m) }));
  const current = saved.length === 0 ? 0 : saved[saved.length - 1]!.total;

  let baseline = months[0] ?? null;
  let nextTaken = false;
  return steps.map((amount) => {
    const crossed = saved.find((s) => s.total >= amount) ?? null;
    if (crossed !== null) {
      const monthsTaken = baseline === null ? null : monthIndex(crossed.month) - monthIndex(baseline);
      baseline = crossed.month;
      return { amount, reached: true, reachedMonth: crossed.month, monthsTaken, toGo: null, next: false };
    }
    const next = !nextTaken;
    nextTaken = true;
    return {
      amount,
      reached: false,
      reachedMonth: null,
      monthsTaken: null,
      toGo: next ? amount - current : null,
      next,
    };
  });
}

export function visibleMilestones(rows: MilestoneRow[]): MilestoneRow[] {
  const nextAt = rows.findIndex((r) => r.next);
  if (nextAt === -1) return rows;
  return rows.slice(0, nextAt + 2);
}

export interface SweepOffer {
  month: string;
  leftover: number;
}

export function sweepOffer(
  accounts: Account[],
  transactions: Transaction[],
  budgets: Budget[],
  todayISO: string,
  sweptMonths: ReadonlySet<string> = new Set(),
): SweepOffer | null {
  const month = shiftMonth(todayISO.slice(0, 7), -1);
  if (sweptMonths.has(month)) return null;
  const leftover = budgetRemaining(accounts, transactions, budgets, month);
  if (leftover <= 0) return null;
  return { month, leftover };
}
