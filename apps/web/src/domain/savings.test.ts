import { describe, it, expect } from 'vitest';
import type { Account, Goal, Transaction } from '../db/repositories/types';
import {
  avgContribution,
  goalFraction,
  goalToGo,
  projectedGoalMonth,
  savingsLevel,
  savingsRate,
} from './savings';

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

function goal(p: Partial<Goal> & Pick<Goal, 'target_amount' | 'saved_amount'>): Goal {
  return { id: 'g', name: 'g', deadline: null, account_id: 'bank', ...p };
}

describe('savingsRate (§8.2, invariants 5 & 9)', () => {
  it('computes S_net/I × 100 for a normal month', () => {
    const r = savingsRate(300000, 2000000)!; // 15% of income
    expect(r.pct).toBe(15);
    expect(r.capped).toBe(false);
    expect(r.level).toBe('Gold');
  });

  it('renders "—" (null) when income is zero — invariant 5', () => {
    expect(savingsRate(200000, 0)).toBeNull();
  });

  it('caps display at 100 with a flag when the raw rate exceeds it — invariant 9', () => {
    const r = savingsRate(3000000, 2000000)!; // 150% raw
    expect(r.pct).toBe(100);
    expect(r.capped).toBe(true);
    expect(r.level).toBe('Gold');
  });

  it('lets negative rates (net withdrawal) pass through uncapped', () => {
    const r = savingsRate(-100000, 2000000)!; // −5%
    expect(r.pct).toBe(-5);
    expect(r.capped).toBe(false);
    expect(r.level).toBe('Bronze');
  });
});

describe('savingsLevel boundaries (§7.4)', () => {
  it('Bronze below 5%', () => {
    expect(savingsLevel(4.99)).toBe('Bronze');
    expect(savingsLevel(0)).toBe('Bronze');
  });
  it('Silver from 5% up to (not incl.) 15%', () => {
    expect(savingsLevel(5)).toBe('Silver');
    expect(savingsLevel(14.99)).toBe('Silver');
  });
  it('Gold at 15% and above', () => {
    expect(savingsLevel(15)).toBe('Gold');
    expect(savingsLevel(40)).toBe('Gold');
  });
});

describe('avgContribution (§8.2)', () => {
  const accounts = [acc('cash', 'cash'), acc('bank', 'bank')];
  // May: I=10,000, contribution 2,000 (cash→bank). June: I=10,000, contribution 4,000.
  // July: I=0 (no income) but a 6,000 contribution — must be SKIPPED (I=0 month).
  const txns = [
    txn({ id: 'iM', amount: 1000000, kind: 'income', account_id: 'bank', date: '2026-05-01' }),
    txn({ id: 'cM', amount: 200000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-05-10' }),
    txn({ id: 'iJ', amount: 1000000, kind: 'income', account_id: 'bank', date: '2026-06-01' }),
    txn({ id: 'cJ', amount: 400000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-06-10' }),
    txn({ id: 'cJul', amount: 600000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-07-10' }),
  ];

  it('averages S_net over the last 3 months, skipping I=0 months', () => {
    // July skipped (I=0); mean of May 2,000 and June 4,000 = 3,000 = 300000 centavos.
    expect(avgContribution(accounts, txns, '2026-07')).toBe(300000);
  });

  it('returns null when no month in the window has income', () => {
    expect(avgContribution(accounts, txns, '2027-01')).toBeNull();
  });
});

describe('goal helpers + projection (§8.2)', () => {
  it('goalToGo is target − saved, never negative', () => {
    expect(goalToGo(goal({ target_amount: 3000000, saved_amount: 1130000 }))).toBe(1870000);
    expect(goalToGo(goal({ target_amount: 1000000, saved_amount: 1200000 }))).toBe(0);
  });

  it('goalFraction clamps 0..1 and guards a zero target', () => {
    expect(goalFraction(goal({ target_amount: 3000000, saved_amount: 1140000 }))).toBeCloseTo(0.38);
    expect(goalFraction(goal({ target_amount: 1000000, saved_amount: 5000000 }))).toBe(1);
    expect(goalFraction(goal({ target_amount: 0, saved_amount: 100 }))).toBe(0);
  });

  it('projects today + ceil(remaining / avg) months', () => {
    // remaining 18,700; avg 4,000/mo → ceil(4.675) = 5 months from July → Dec 2026.
    const g = goal({ target_amount: 3000000, saved_amount: 1130000 });
    expect(projectedGoalMonth(g, 400000, '2026-07-24')).toBe('2026-12');
  });

  it('returns null when the goal is already reached or has no positive average', () => {
    const reached = goal({ target_amount: 1000000, saved_amount: 1000000 });
    expect(projectedGoalMonth(reached, 400000, '2026-07-24')).toBeNull();
    const g = goal({ target_amount: 3000000, saved_amount: 1130000 });
    expect(projectedGoalMonth(g, null, '2026-07-24')).toBeNull();
    expect(projectedGoalMonth(g, 0, '2026-07-24')).toBeNull();
    expect(projectedGoalMonth(g, -100000, '2026-07-24')).toBeNull();
  });
});
