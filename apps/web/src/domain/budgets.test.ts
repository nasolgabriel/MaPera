import { describe, it, expect } from 'vitest';
import { budgetConsumed, categorySpent } from './budgets';
import type { Account, Budget, Transaction } from '../db/repositories/types';

const MONTH = '2026-07';

function account(id: string, overrides: Partial<Account> = {}): Account {
  return {
    id, name: id, type: 'cash', starting_balance: 0, essence_color: '#1E3A6E',
    archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
    ...overrides,
  };
}

function expense(id: string, amount: number, categoryId: string | null, date: string, accountId = 'a1'): Transaction {
  return {
    id, amount, kind: 'expense', account_id: accountId, to_account_id: null,
    category_id: categoryId, date, note: null,
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
  };
}

function budget(id: string, categoryId: string, cap: number, month = MONTH): Budget {
  return { id, category_id: categoryId, month, cap_amount: cap };
}

const accounts = [account('a1')];

describe('categorySpent — spent(c,t) §8.4', () => {
  it('sums only expenses of that category in that month', () => {
    const txns = [
      expense('t1', 900000, 'cat-food', '2026-07-05'),
      expense('t2', 50000, 'cat-food', '2026-06-30'), // wrong month
      expense('t3', 450000, 'cat-transport', '2026-07-06'), // wrong category
    ];
    expect(categorySpent(accounts, txns, 'cat-food', MONTH)).toBe(900000);
  });

  it('excludes archived accounts (§8 notation)', () => {
    const accs = [account('a1'), account('a2', { archived: true })];
    const txns = [
      expense('t1', 100000, 'cat-food', '2026-07-05', 'a1'),
      expense('t2', 999999, 'cat-food', '2026-07-05', 'a2'),
    ];
    expect(categorySpent(accs, txns, 'cat-food', MONTH)).toBe(100000);
  });
});

describe('budgetConsumed — hub ring gauge (§6 / §8.4)', () => {
  it('is Σ spent / Σ cap over the month budgets (seed case = 0.9)', () => {
    const txns = [
      expense('t1', 900000, 'cat-food', '2026-07-05'),
      expense('t2', 450000, 'cat-transport', '2026-07-06'),
    ];
    const budgets = [budget('b1', 'cat-food', 1000000), budget('b2', 'cat-transport', 500000)];
    expect(budgetConsumed(accounts, txns, budgets, MONTH)).toBe(0.9);
  });

  it('ignores spend in categories without a cap (uncategorized never inflates the gauge)', () => {
    const txns = [
      expense('t1', 200000, 'cat-food', '2026-07-05'),
      expense('t2', 999999, 'cat-fun', '2026-07-05'), // no cap
      expense('t3', 999999, null, '2026-07-05'), // uncategorized
    ];
    const budgets = [budget('b1', 'cat-food', 1000000)];
    expect(budgetConsumed(accounts, txns, budgets, MONTH)).toBe(0.2);
  });

  it('ignores budgets of other months', () => {
    const txns = [expense('t1', 100000, 'cat-food', '2026-07-05')];
    const budgets = [budget('b1', 'cat-food', 1000000), budget('b2', 'cat-food', 100, '2026-06')];
    expect(budgetConsumed(accounts, txns, budgets, MONTH)).toBe(0.1);
  });

  it('can exceed 1 when over budget (clamped only at display)', () => {
    const txns = [expense('t1', 1200000, 'cat-food', '2026-07-05')];
    const budgets = [budget('b1', 'cat-food', 1000000)];
    expect(budgetConsumed(accounts, txns, budgets, MONTH)).toBe(1.2);
  });

  it('Σ cap = 0 → null, never NaN/Infinity (§8.7 guard)', () => {
    expect(budgetConsumed(accounts, [], [], MONTH)).toBeNull();
  });
});
