import { describe, it, expect } from 'vitest';
import {
  addDays,
  averagePerDay,
  dailyCapAverage,
  daysInMonth,
  isoWeekdayIndex,
  lastSevenDays,
  leadingBlanks,
  monthGrid,
  spendByDay,
  spendByDayInRange,
  sumSpend,
} from './calendar';
import { expenses } from './stats';
import type { Account, Transaction } from '../db/repositories/types';

const MONTH = '2026-07';

function account(id: string, overrides: Partial<Account> = {}): Account {
  return {
    id, name: id, type: 'cash', starting_balance: 0, essence_color: '#1E3A6E',
    archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
    ...overrides,
  };
}

function expense(id: string, amount: number, date: string, accountId = 'a1'): Transaction {
  return {
    id, amount, kind: 'expense', account_id: accountId, to_account_id: null,
    category_id: 'cat-food', date, note: null,
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
  };
}

const accounts = [account('a1')];

describe('month geometry', () => {
  it('counts days, leap-aware', () => {
    expect(daysInMonth('2026-07')).toBe(31);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2024-02')).toBe(29); // leap
    expect(daysInMonth('2026-04')).toBe(30);
  });

  it('indexes weekdays Monday-first (§3 ISO weeks)', () => {
    expect(isoWeekdayIndex('2026-07-20')).toBe(0); // Monday
    expect(isoWeekdayIndex('2026-07-22')).toBe(2); // Wednesday
    expect(isoWeekdayIndex('2026-07-26')).toBe(6); // Sunday
  });

  it('pads the grid with leading blanks from the 1st weekday', () => {
    expect(leadingBlanks('2026-07')).toBe(2); // Jul 1 2026 = Wednesday
    expect(leadingBlanks('2026-06')).toBe(0); // Jun 1 2026 = Monday
    expect(leadingBlanks('2026-11')).toBe(6); // Nov 1 2026 = Sunday
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-07-22', -6)).toBe('2026-07-16');
    expect(addDays('2026-07-03', -7)).toBe('2026-06-26');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // leap
  });
});

describe('spendByDay', () => {
  it('reconciles with E(t) — invariant 3, per day instead of per category', () => {
    const txns = [
      expense('t1', 12000, '2026-07-08'),
      expense('t2', 26000, '2026-07-08'),
      expense('t3', 31000, '2026-07-14'),
      expense('t4', 99999, '2026-06-30'), // other month
      { ...expense('t5', 50000, '2026-07-09'), kind: 'income' as const },
      { ...expense('t6', 70000, '2026-07-10'), kind: 'transfer' as const }, // §7.2: not spend
    ];
    const byDay = spendByDay(accounts, txns, MONTH);
    expect(byDay.get('2026-07-08')).toBe(38000);
    expect(byDay.get('2026-07-14')).toBe(31000);
    expect(byDay.has('2026-07-10')).toBe(false);
    const total = [...byDay.values()].reduce((sum, v) => sum + v, 0);
    expect(total).toBe(expenses(accounts, txns, MONTH));
  });

  it('excludes archived accounts (§8 notation)', () => {
    const withArchived = [account('a1'), account('a2', { archived: true })];
    const txns = [expense('t1', 10000, '2026-07-08'), expense('t2', 90000, '2026-07-08', 'a2')];
    expect(spendByDay(withArchived, txns, MONTH).get('2026-07-08')).toBe(10000);
  });

  it('spans months in range mode — the graph window crosses month boundaries', () => {
    const txns = [expense('t1', 10000, '2026-06-29'), expense('t2', 20000, '2026-07-02')];
    const byDay = spendByDayInRange(accounts, txns, '2026-06-26', '2026-07-02');
    expect(byDay.get('2026-06-29')).toBe(10000);
    expect(byDay.get('2026-07-02')).toBe(20000);
    expect(spendByDayInRange(accounts, txns, '2026-06-26', '2026-07-01').has('2026-07-02')).toBe(false);
  });
});

describe('dailyCapAverage', () => {
  it('spreads Σ cap over the month', () => {
    expect(dailyCapAverage(1500000, '2026-07')).toBeCloseTo(1500000 / 31);
  });

  it('returns null when no caps are set (§8.7 guard — never divide by 0)', () => {
    expect(dailyCapAverage(0, '2026-07')).toBeNull();
  });
});

describe('monthGrid', () => {
  const spend = new Map([
    ['2026-07-01', 20000], // light vs a 484-ish day cap
    ['2026-07-16', 53000], // over cap
    ['2026-07-20', 30000], // heavy (≥ half the day cap)
  ]);
  const dayCap = dailyCapAverage(1500000, MONTH); // ≈ 48,387 centavos

  it('lays out 2 leading blanks + 31 days padded to whole weeks', () => {
    const cells = monthGrid(MONTH, '2026-07-22', spend, dayCap);
    expect(cells).toHaveLength(35); // 5 rows
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 2).every((c) => c.date === null)).toBe(true);
    expect(cells[2]).toMatchObject({ day: 1, date: '2026-07-01' }); // day 1 under 'W'
    expect(cells[32]).toMatchObject({ day: 31 });
    expect(cells[33]?.date).toBeNull();
  });

  it('levels each day against the per-day cap', () => {
    const cells = monthGrid(MONTH, '2026-07-22', spend, dayCap);
    const cellFor = (day: number) => cells.find((c) => c.day === day)!;
    expect(cellFor(1).level).toBe('light');
    expect(cellFor(16).level).toBe('over');
    expect(cellFor(20).level).toBe('heavy');
    expect(cellFor(2).level).toBe('none');
  });

  it('with no caps nothing is over — heavy/light split on the month mean', () => {
    const cells = monthGrid(MONTH, '2026-07-22', spend, null); // mean = 103,000/31 ≈ 3,322
    const cellFor = (day: number) => cells.find((c) => c.day === day)!;
    expect(cells.some((c) => c.level === 'over')).toBe(false);
    expect(cellFor(16).level).toBe('heavy');
    expect(cellFor(1).level).toBe('heavy'); // 20,000 is still above the mean
    expect(cellFor(2).level).toBe('none');
  });

  it('flags today and future days', () => {
    const cells = monthGrid(MONTH, '2026-07-22', spend, dayCap);
    expect(cells.find((c) => c.day === 22)?.isToday).toBe(true);
    expect(cells.find((c) => c.day === 21)?.isFuture).toBe(false);
    expect(cells.find((c) => c.day === 23)?.isFuture).toBe(true);
    expect(cells.filter((c) => c.isToday)).toHaveLength(1);
  });

  it('browsing another month has no today cell', () => {
    expect(monthGrid('2026-06', '2026-07-22', new Map(), null).some((c) => c.isToday)).toBe(false);
  });
});

describe('lastSevenDays', () => {
  const spend = new Map([
    ['2026-07-16', 53000],
    ['2026-07-22', 12000],
    ['2026-07-09', 99000], // outside the window
  ]);

  it('returns 7 zero-filled days, oldest first, ending on the given day', () => {
    const days = lastSevenDays(spend, '2026-07-22');
    expect(days).toHaveLength(7);
    expect(days[0]?.date).toBe('2026-07-16');
    expect(days[6]?.date).toBe('2026-07-22');
    expect(days[0]?.spend).toBe(53000);
    expect(days[1]?.spend).toBe(0); // no rows that day
    expect(sumSpend(days)).toBe(65000); // the Jul 9 row is outside the window
  });

  it('carries ISO weekday indexes and crosses a month boundary', () => {
    const days = lastSevenDays(new Map(), '2026-07-03');
    expect(days[0]?.date).toBe('2026-06-27');
    expect(days.map((d) => d.weekdayIndex)).toEqual([5, 6, 0, 1, 2, 3, 4]);
  });
});

describe('averagePerDay', () => {
  it('averages the window', () => {
    expect(averagePerDay(lastSevenDays(new Map([['2026-07-22', 70000]]), '2026-07-22'))).toBe(10000);
  });

  it('empty window → null, never NaN (§8.7)', () => {
    expect(averagePerDay([])).toBeNull();
  });
});
