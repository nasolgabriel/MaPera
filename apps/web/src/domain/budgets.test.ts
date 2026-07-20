import { describe, it, expect } from 'vitest';
import {
  budgetConsumed,
  budgetRemaining,
  budgetUsed,
  categorySpent,
  dailySafeSpend,
  spentByCategory,
  totalCap,
  vsBudget,
} from './budgets';
import { expenses } from './stats';
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

// Seed-shaped fixture: caps ₱15,000, budgeted spend ₱13,500.
const seedTxns = [
  expense('t1', 900000, 'cat-food', '2026-07-05'),
  expense('t2', 450000, 'cat-transport', '2026-07-06'),
];
const seedBudgets = [budget('b1', 'cat-food', 1000000), budget('b2', 'cat-transport', 500000)];

describe('totalCap — Σ cap (§8.4)', () => {
  it('sums caps of the month only', () => {
    const budgets = [...seedBudgets, budget('b3', 'cat-food', 999999, '2026-06')];
    expect(totalCap(budgets, MONTH)).toBe(1500000);
  });
});

describe('budgetUsed — budget_used(c,t) §8.4', () => {
  it('spent / cap × 100 (seed food = 90%)', () => {
    expect(budgetUsed(accounts, seedTxns, seedBudgets, 'cat-food', MONTH)).toBe(90);
  });

  it('no cap for the category → null, never NaN (§8.7 guard)', () => {
    expect(budgetUsed(accounts, seedTxns, seedBudgets, 'cat-fun', MONTH)).toBeNull();
  });
});

describe('budgetRemaining — donut center (§8.4)', () => {
  it('Σ cap − Σ spent (seed = ₱1,500 left)', () => {
    expect(budgetRemaining(accounts, seedTxns, seedBudgets, MONTH)).toBe(150000);
  });

  it('goes negative when over cap', () => {
    const txns = [expense('t1', 1700000, 'cat-food', '2026-07-05')];
    const budgets = [budget('b1', 'cat-food', 1000000)];
    expect(budgetRemaining(accounts, txns, budgets, MONTH)).toBe(-700000);
  });

  it('uncapped-category spend does not reduce remaining (matches budgetConsumed scope)', () => {
    const txns = [...seedTxns, expense('t9', 999999, 'cat-fun', '2026-07-07')];
    expect(budgetRemaining(accounts, txns, seedBudgets, MONTH)).toBe(150000);
  });
});

describe('dailySafeSpend — daily_safe_spend(t) §8.4', () => {
  it('budget_remaining / days_left (seed, 15 days left = ₱100/day)', () => {
    expect(dailySafeSpend(accounts, seedTxns, seedBudgets, MONTH, 15)).toBe(10000);
  });

  it('days_left ≤ 0 → null (§8.7 guard)', () => {
    expect(dailySafeSpend(accounts, seedTxns, seedBudgets, MONTH, 0)).toBeNull();
  });
});

describe('vsBudget — vs_budget(t) §8.4', () => {
  it('(Σ spent − Σ cap) / Σ cap × 100 (seed = −10%)', () => {
    expect(vsBudget(accounts, seedTxns, seedBudgets, MONTH)).toBe(-10);
  });

  it('Σ cap = 0 → null (§8.7 guard)', () => {
    expect(vsBudget(accounts, seedTxns, [], MONTH)).toBeNull();
  });
});

describe('spentByCategory — donut slices + invariant 3', () => {
  const accs = [account('a1'), account('a2', { archived: true })];
  const txns = [
    expense('t1', 900000, 'cat-food', '2026-07-05'),
    expense('t2', 450000, 'cat-transport', '2026-07-06'),
    expense('t3', 18000, null, '2026-07-08'), // uncategorized
    expense('t4', 50000, 'cat-food', '2026-06-30'), // other month
    expense('t5', 77777, 'cat-food', '2026-07-09', 'a2'), // archived account
    { ...expense('t6', 500000, 'cat-salary', '2026-07-01'), kind: 'income' as const },
    { ...expense('t7', 200000, null, '2026-07-02'), kind: 'transfer' as const, to_account_id: 'a2' },
  ];

  it('invariant 3: Σ category spends + uncategorized ≡ E(t)', () => {
    const slices = spentByCategory(accs, txns, MONTH);
    const total = slices.reduce((sum, s) => sum + s.amount, 0);
    expect(total).toBe(expenses(accs, txns, MONTH));
    expect(total).toBe(1368000);
  });

  it('groups by category with a null bucket for uncategorized, sorted desc', () => {
    expect(spentByCategory(accs, txns, MONTH)).toEqual([
      { category_id: 'cat-food', amount: 900000 },
      { category_id: 'cat-transport', amount: 450000 },
      { category_id: null, amount: 18000 },
    ]);
  });

  it('empty month → empty slice list (fresh-install zero state)', () => {
    expect(spentByCategory(accs, txns, '2026-01')).toEqual([]);
  });
});
