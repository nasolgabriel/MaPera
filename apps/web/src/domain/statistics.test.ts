import { describe, it, expect } from 'vitest';
import type { Account, Transaction } from '../db/repositories/types';
import {
  monthKeys,
  totalSavedAsOf,
  savingsSeries,
  expenseSeries,
  netSeries,
  rollingAvg,
  rollingAvgSeries,
  savingsComparison,
} from './statistics';

function acc(id: string, type: Account['type'], starting = 0, archived = false): Account {
  return {
    id, name: id, type, starting_balance: starting, essence_color: '#1E3A6E',
    archived, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
  };
}

function txn(p: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'kind' | 'account_id' | 'date'>): Transaction {
  return {
    to_account_id: null, category_id: null, note: null,
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
    ...p,
  };
}

describe('monthKeys — §6.4 window', () => {
  it('returns `count` months ending at the current month, oldest first', () => {
    expect(monthKeys('2026-07', 6)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
  });

  it('crosses the year boundary', () => {
    expect(monthKeys('2026-01', 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('totalSavedAsOf — cumulative savings balance (§8.1)', () => {
  const accounts = [acc('cash', 'cash', 0), acc('bank', 'bank', 100000)];
  const txns = [
    txn({ id: 't1', amount: 200000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-03-05' }),
    txn({ id: 't2', amount: 300000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-05-05' }),
  ];

  it('counts only transactions dated in the month or earlier', () => {
    expect(totalSavedAsOf(accounts, txns, '2026-02')).toBe(100000); // starting balance only
    expect(totalSavedAsOf(accounts, txns, '2026-03')).toBe(300000); // + first contribution
    expect(totalSavedAsOf(accounts, txns, '2026-05')).toBe(600000); // + second
    expect(totalSavedAsOf(accounts, txns, '2026-09')).toBe(600000); // nothing later
  });

  it('re-buckets a backdated contribution into the right month (invariant 6)', () => {
    const back = [...txns, txn({ id: 't3', amount: 50000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-04-20' })];
    expect(totalSavedAsOf(accounts, back, '2026-03')).toBe(300000); // April entry not yet counted
    expect(totalSavedAsOf(accounts, back, '2026-04')).toBe(350000); // now counted
  });
});

describe('series builders flag the live month partial (§8.7)', () => {
  const accounts = [acc('cash', 'cash', 0), acc('bank', 'bank', 0)];
  const months = monthKeys('2026-07', 6);
  const txns = [
    txn({ id: 'i', amount: 2000000, kind: 'income', account_id: 'bank', date: '2026-06-01' }),
    txn({ id: 'e', amount: 500000, kind: 'expense', account_id: 'bank', date: '2026-06-05' }),
    txn({ id: 's', amount: 300000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-06-06' }),
    txn({ id: 'i2', amount: 1000000, kind: 'income', account_id: 'bank', date: '2026-07-01' }),
  ];

  it('savingsSeries is cumulative and marks only July partial', () => {
    const s = savingsSeries(accounts, txns, months, '2026-07');
    expect(s.map((p) => p.partial)).toEqual([false, false, false, false, false, true]);
    expect(s.find((p) => p.month === '2026-06')!.value).toBe(1800000); // 2,000,000 − 500,000 + 300,000
    expect(s.find((p) => p.month === '2026-07')!.value).toBe(2800000); // + July income
  });

  it('expenseSeries is E(t) per month', () => {
    const e = expenseSeries(accounts, txns, months, '2026-07');
    expect(e.find((p) => p.month === '2026-06')!.value).toBe(500000);
    expect(e.find((p) => p.month === '2026-05')!.value).toBe(0);
  });

  it('netSeries is free_cash_flow(t) per month and may be negative', () => {
    const n = netSeries(accounts, txns, months, '2026-07');
    // June: I 2,000,000 − E 500,000 − S_net 300,000 = 1,200,000
    expect(n.find((p) => p.month === '2026-06')!.value).toBe(1200000);
  });
});

describe('rollingAvg — §8.7', () => {
  it('is the mean of the last `window` periods', () => {
    expect(rollingAvg([10, 20, 30], 3)).toBe(20);
    expect(rollingAvg([10, 20, 30, 40], 3)).toBe(30); // last 3 only
  });

  it('averages fewer than `window` when the series is short, and guards empty', () => {
    expect(rollingAvg([50], 3)).toBe(50);
    expect(rollingAvg([], 3)).toBeNull();
  });
});

describe('savingsComparison — dashed line (math-doc §5)', () => {
  const accounts = [acc('cash', 'cash', 0), acc('bank', 'bank', 0)];

  it('uses a trailing rolling average when under 13 months of history', () => {
    const months = monthKeys('2026-07', 6);
    const txns = [
      txn({ id: 's3', amount: 300000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-05-05' }),
      txn({ id: 's6', amount: 600000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-06-05' }),
    ];
    const cmp = savingsComparison(accounts, txns, months, '2026-07');
    const roll = rollingAvgSeries(savingsSeries(accounts, txns, months, '2026-07'));
    expect(cmp).toEqual(roll); // rolling-average path
  });

  it('switches to the same month a year earlier once ≥13 months exist', () => {
    // A contribution 13 months before the current month makes the year-ago sample available.
    const months = monthKeys('2026-07', 6);
    const txns = [
      txn({ id: 'old', amount: 100000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2025-06-05' }),
      txn({ id: 'new', amount: 400000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-05-05' }),
    ];
    const cmp = savingsComparison(accounts, txns, months, '2026-07');
    // The 2026-06 point compares against 2025-06 = 100,000 saved a year earlier.
    const idxJun = months.indexOf('2026-06');
    expect(cmp[idxJun]).toBe(100000);
    // The 2026-02 point's year-ago (2025-02) predates any data → 0 saved then.
    expect(cmp[0]).toBe(0);
  });
});
