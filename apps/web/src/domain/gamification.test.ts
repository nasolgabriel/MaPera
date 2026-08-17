import { describe, it, expect } from 'vitest';
import type { Account, Budget, Sweep, Transaction } from '../db/repositories/types';
import {
  isoWeekEnd,
  isoWeekKey,
  isoWeekStart,
  MILESTONE_STEPS,
  milestones,
  sNetByWeek,
  streak,
  streakBars,
  sweepOffer,
  sweptWeekKeys,
  visibleMilestones,
} from './gamification';

const TODAY = '2026-07-14'; // Tuesday of 2026-W29

const cash: Account = {
  id: 'acc-cash', name: 'Cash', type: 'cash', starting_balance: 0, essence_color: '#1E3A6E',
  archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
};
const bank: Account = { ...cash, id: 'acc-bank', name: 'BPI', type: 'bank', essence_color: '#0D7A3F' };
const maya: Account = { ...cash, id: 'acc-maya', name: 'Maya', type: 'ewallet', essence_color: '#E8641B' };
const accounts = [cash, bank, maya];

function txn(over: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'date'>): Transaction {
  return {
    kind: 'transfer', account_id: 'acc-cash', to_account_id: 'acc-bank', category_id: null,
    note: null, discount_rule_id: null, recurring_id: null, saved_item_id: null, ...over,
  };
}

/** regular → savings: an S contribution (§7.2). */
function save(id: string, amount: number, date: string): Transaction {
  return txn({ id, amount, date });
}

/** savings → regular: an S withdrawal (§7.2). */
function withdraw(id: string, amount: number, date: string): Transaction {
  return txn({ id, amount, date, account_id: 'acc-bank', to_account_id: 'acc-cash' });
}

function spend(id: string, amount: number, date: string, category_id: string): Transaction {
  return txn({ id, amount, date, kind: 'expense', to_account_id: null, category_id });
}

describe('ISO weeks (§3 — Monday start, the same weeks the calendar uses)', () => {
  it('starts weeks on Monday and ends them on Sunday', () => {
    expect(isoWeekStart('2026-07-13')).toBe('2026-07-13'); // Monday
    expect(isoWeekStart('2026-07-14')).toBe('2026-07-13'); // Tuesday
    expect(isoWeekStart('2026-07-19')).toBe('2026-07-13'); // Sunday belongs to the same week
    expect(isoWeekEnd('2026-07-14')).toBe('2026-07-19');
    expect(isoWeekStart('2026-07-20')).toBe('2026-07-20'); // next Monday
  });

  it('numbers weeks by the ISO week-numbering year, not the calendar year', () => {
    expect(isoWeekKey('2026-07-14')).toBe('2026-W29');
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01'); // Thursday → week 1 of 2026
    expect(isoWeekKey('2025-12-29')).toBe('2026-W01'); // Monday of that same week
    expect(isoWeekKey('2026-12-31')).toBe('2026-W53'); // 2026 is a 53-week year
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53'); // Friday still in 2026-W53
    expect(isoWeekKey('2027-01-04')).toBe('2027-W01');
    expect(isoWeekKey('2021-01-01')).toBe('2020-W53'); // rolls back a year
  });
});

describe('sNetByWeek (§7.2 taxonomy, bucketed by ISO week)', () => {
  it('nets contributions against withdrawals inside the same week', () => {
    const weeks = sNetByWeek(accounts, [
      save('t1', 200000, '2026-07-13'),
      save('t2', 50000, '2026-07-19'),
      withdraw('t3', 30000, '2026-07-15'),
      save('t4', 100000, '2026-07-06'),
    ]);
    expect(weeks.get('2026-W29')).toBe(220000);
    expect(weeks.get('2026-W28')).toBe(100000);
  });

  it('ignores expenses, income, and regular↔regular transfers', () => {
    const weeks = sNetByWeek(accounts, [
      spend('t1', 90000, '2026-07-14', 'cat-food'),
      txn({ id: 't2', amount: 50000, date: '2026-07-14', kind: 'income', to_account_id: null }),
      txn({ id: 't3', amount: 50000, date: '2026-07-14', account_id: 'acc-cash', to_account_id: 'acc-cash' }),
    ]);
    expect(weeks.size).toBe(0);
  });

  it('counts savings↔savings transfers in nothing', () => {
    const weeks = sNetByWeek(accounts, [
      txn({ id: 't1', amount: 50000, date: '2026-07-14', account_id: 'acc-bank', to_account_id: 'acc-maya' }),
    ]);
    expect(weeks.size).toBe(0);
  });
});

describe('streak (§7.4 — weekly, savings-centered)', () => {
  it('counts an ISO week iff S_net(week) > 0', () => {
    const info = streak(accounts, [save('t1', 100000, '2026-07-14')], TODAY);
    expect(info.weeks).toBe(1);
    expect(info.history.map((w) => w.week)).toEqual(['2026-W29']);
    expect(info.history[0]!.current).toBe(true);
  });

  it('survives days with no log at all — only the week matters', () => {
    // One contribution per week for four weeks; every other day is unlogged.
    const info = streak(
      accounts,
      [
        save('t1', 100000, '2026-06-22'), // W26
        save('t2', 100000, '2026-06-30'), // W27
        save('t3', 100000, '2026-07-09'), // W28
        save('t4', 100000, '2026-07-14'), // W29 (today)
      ],
      TODAY,
    );
    expect(info.weeks).toBe(4);
    expect(info.history.map((w) => w.week)).toEqual(['2026-W26', '2026-W27', '2026-W28', '2026-W29']);
  });

  it('breaks on a week without saving', () => {
    const info = streak(
      accounts,
      [
        save('t1', 100000, '2026-06-22'), // W26
        save('t2', 100000, '2026-06-30'), // W27
        // W28 — nothing saved
        save('t4', 100000, '2026-07-14'), // W29
      ],
      TODAY,
    );
    expect(info.weeks).toBe(1);
    expect(info.history.map((w) => w.week)).toEqual(['2026-W29']);
  });

  it('does not break on the in-progress current week', () => {
    const info = streak(
      accounts,
      [
        save('t1', 100000, '2026-06-22'), // W26
        save('t2', 100000, '2026-06-30'), // W27
        save('t3', 100000, '2026-07-09'), // W28
        // W29 still running, nothing saved yet
      ],
      TODAY,
    );
    expect(info.weeks).toBe(3);
    expect(info.history.map((w) => w.week)).toEqual(['2026-W26', '2026-W27', '2026-W28']);
  });

  it('does not count a week a withdrawal cancelled out', () => {
    const info = streak(
      accounts,
      [
        save('t1', 100000, '2026-07-06'), // W28
        save('t2', 100000, '2026-07-14'), // W29
        withdraw('t3', 100000, '2026-07-15'), // W29 nets back to 0
      ],
      TODAY,
    );
    expect(info.weeks).toBe(1);
    expect(info.history.map((w) => w.week)).toEqual(['2026-W28']);
  });

  it('breaks when a CLOSED week nets to zero', () => {
    const info = streak(
      accounts,
      [
        save('t1', 100000, '2026-06-30'), // W27
        save('t2', 100000, '2026-07-06'), // W28
        withdraw('t3', 100000, '2026-07-08'), // W28 nets back to 0 — the break
      ],
      TODAY,
    );
    expect(info.weeks).toBe(0);
    expect(info.history).toEqual([]);
  });

  it('counts a swept week double (§7.4 under-budget sweep)', () => {
    const txns = [save('t1', 100000, '2026-07-09'), save('t2', 120000, '2026-07-14')];
    const swept = new Set(['2026-W29']);
    const info = streak(accounts, txns, TODAY, swept);
    expect(info.weeks).toBe(3); // W28 = 1, W29 swept = 2
    expect(info.history).toHaveLength(2);
    expect(info.history[1]!.swept).toBe(true);
  });

  it('is zero with no savings at all', () => {
    expect(streak(accounts, [], TODAY)).toEqual({ weeks: 0, history: [] });
  });

  it('never rewards logging — expenses alone leave the streak at zero', () => {
    const info = streak(accounts, [spend('t1', 90000, '2026-07-14', 'cat-food')], TODAY);
    expect(info.weeks).toBe(0);
  });

  it('streakBars shows only the last N weeks', () => {
    const txns = Array.from({ length: 12 }, (_, i) => save(`t${i}`, 50000, weekOffset(i)));
    const info = streak(accounts, txns, TODAY);
    expect(info.weeks).toBe(12);
    expect(streakBars(info)).toHaveLength(8);
    expect(streakBars(info, 3).map((w) => w.week)).toEqual(['2026-W27', '2026-W28', '2026-W29']);
  });
});

/** Tuesday, `back` weeks before TODAY. */
function weekOffset(back: number): string {
  const d = new Date('2026-07-14T00:00:00');
  d.setDate(d.getDate() - back * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('sweptWeekKeys', () => {
  it('resolves each sweep to the ISO week its transaction landed in', () => {
    const txns = [save('t-sweep', 120000, '2026-07-14')];
    const sweeps: Sweep[] = [{ id: 's1', month: '2026-06', transaction_id: 't-sweep' }];
    expect([...sweptWeekKeys(sweeps, txns)]).toEqual(['2026-W29']);
  });

  it('skips a sweep whose transaction was deleted', () => {
    const sweeps: Sweep[] = [{ id: 's1', month: '2026-06', transaction_id: 'gone' }];
    expect(sweptWeekKeys(sweeps, []).size).toBe(0);
  });
});

describe('milestones (§7.4 — growth milestones with time-to-reach)', () => {
  const history = [
    save('m1', 400000, '2026-02-05'),
    save('m2', 400000, '2026-03-05'),
    save('m3', 400000, '2026-04-05'),
  ];

  it('ladders ₱10k · ₱50k · ₱100k · ₱250k · ₱500k · ₱1M', () => {
    expect(MILESTONE_STEPS).toEqual([1000000, 5000000, 10000000, 25000000, 50000000, 100000000]);
  });

  it('marks a crossed milestone with the months it took', () => {
    const rows = milestones(accounts, history, '2026-05');
    expect(rows[0]).toMatchObject({
      amount: 1000000, reached: true, reachedMonth: '2026-04', monthsTaken: 2, toGo: null, next: false,
    });
  });

  it('gives the next milestone a ₱-to-go and leaves the rest locked', () => {
    const rows = milestones(accounts, history, '2026-05');
    expect(rows[1]).toMatchObject({ amount: 5000000, reached: false, next: true, toGo: 3800000 });
    expect(rows[2]).toMatchObject({ amount: 10000000, reached: false, next: false, toGo: null });
  });

  it('measures each milestone from the previous one, not from the start', () => {
    const rows = milestones(
      accounts,
      [...history, save('m4', 4000000, '2026-06-05')], // crosses ₱50k in June
      '2026-06',
    );
    expect(rows[0]).toMatchObject({ reachedMonth: '2026-04', monthsTaken: 2 }); // Feb → Apr
    expect(rows[1]).toMatchObject({ reachedMonth: '2026-06', monthsTaken: 2 }); // Apr → Jun
  });

  it('shows the reached ones, the next, and one locked (wireframe C3)', () => {
    const rows = visibleMilestones(milestones(accounts, history, '2026-05'));
    expect(rows.map((r) => r.amount)).toEqual([1000000, 5000000, 10000000]);
  });

  it('with no history the first milestone is next and the full step is to go', () => {
    const rows = milestones(accounts, [], '2026-07');
    expect(rows[0]).toMatchObject({ reached: false, next: true, toGo: 1000000, monthsTaken: null });
  });
});

describe('sweepOffer (§7.4 under-budget sweep)', () => {
  const caps: Budget[] = [{ id: 'b1', category_id: 'cat-food', month: '2026-06', cap_amount: 1000000 }];
  const under = [spend('s1', 880000, '2026-06-10', 'cat-food')];

  it('offers last month’s leftover once the month has closed', () => {
    expect(sweepOffer(accounts, under, caps, TODAY)).toEqual({ month: '2026-06', leftover: 120000 });
  });

  it('offers nothing when the month ended over budget', () => {
    const over = [spend('s1', 1100000, '2026-06-10', 'cat-food')];
    expect(sweepOffer(accounts, over, caps, TODAY)).toBeNull();
  });

  it('offers nothing when that month had no caps at all', () => {
    expect(sweepOffer(accounts, under, [], TODAY)).toBeNull();
  });

  it('offers nothing once the month has been swept', () => {
    expect(sweepOffer(accounts, under, caps, TODAY, new Set(['2026-06']))).toBeNull();
  });
});
