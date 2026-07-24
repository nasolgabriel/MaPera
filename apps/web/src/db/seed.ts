import type { SqlDriver } from './driver';
import { createAccountsRepo } from './repositories/accountsRepo';
import { createBudgetsRepo } from './repositories/budgetsRepo';
import { createCategoriesRepo } from './repositories/categoriesRepo';
import { createGoalsRepo } from './repositories/goalsRepo';
import { createSplitPresetsRepo } from './repositories/splitPresetsRepo';
import { createTransactionsRepo } from './repositories/transactionsRepo';
import type { SplitBucket } from '../domain/split';

export async function seed(db: SqlDriver): Promise<void> {
  const accounts = createAccountsRepo(db);
  const categories = createCategoriesRepo(db);
  const transactions = createTransactionsRepo(db);

  await accounts.create({
    id: 'acc-cash', name: 'Cash', type: 'cash', starting_balance: 0, essence_color: '#1E3A6E',
    archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
  });
  await accounts.create({
    id: 'acc-bank', name: 'BPI', type: 'bank', starting_balance: 0, essence_color: '#0D7A3F',
    archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
  });

  await categories.create({ id: 'cat-salary', name: 'Salary', icon: 'briefcase', kind: 'income', sort_order: 0 });
  await categories.create({ id: 'cat-food', name: 'Food', icon: 'utensils', kind: 'expense', sort_order: 0 });
  await categories.create({ id: 'cat-transport', name: 'Transport', icon: 'bus', kind: 'expense', sort_order: 1 });

  await transactions.create({
    id: 'txn-income-1', amount: 2000000, kind: 'income', account_id: 'acc-bank', to_account_id: null,
    category_id: 'cat-salary', date: '2026-07-01', note: 'July salary',
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
  });
  await transactions.create({
    id: 'txn-expense-1', amount: 900000, kind: 'expense', account_id: 'acc-bank', to_account_id: null,
    category_id: 'cat-food', date: '2026-07-05', note: 'Groceries',
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
  });
  await transactions.create({
    id: 'txn-expense-2', amount: 450000, kind: 'expense', account_id: 'acc-cash', to_account_id: null,
    category_id: 'cat-transport', date: '2026-07-06', note: 'Jeepney + bus fares',
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
  });
  // I=20,000.00, E=13,500.00 → cash_flow = +6,500.00 (650000 centavos)

  await seedBudgets(db);
  await seedSplitPresets(db);
}

// Σ cap = ₱15,000 vs seed spend ₱13,500 → hub gauge 90%. Exported separately so
// db/index.ts can top up databases seeded before budgets existed.
export async function seedBudgets(db: SqlDriver): Promise<void> {
  const budgets = createBudgetsRepo(db);
  await budgets.create({ id: 'bud-food', category_id: 'cat-food', month: '2026-07', cap_amount: 1000000 });
  await budgets.create({ id: 'bud-transport', category_id: 'cat-transport', month: '2026-07', cap_amount: 500000 });
}

/**
 * Dev-only spread: small day-to-day expenses across 2026-07-08 … 2026-07-21 so the
 * A1b heat strip and the A1/A1c 7-day graph have a shape to draw (the worked-example
 * rows above are two big lumps on Jul 5/6, leaving the last two weeks empty).
 *
 * They land in a NEW UNCAPPED category on purpose: `budgetConsumed`/`budgetRemaining`
 * only count categories that have a cap, so the documented dev numbers survive — hub
 * gauge still 0.9, donut center still ₱1,500 remaining of ₱15,000 — while the calendar
 * and graph get real per-day totals. Jul 16 carries two rows (₱530 total) so it clears
 * the ₱15,000/31 ≈ ₱484 per-day cap line and renders the saffron "over cap" state.
 *
 * NOT called from seed(): every domain/repo/store test asserts against the §8.1 totals
 * (cash_flow 650000, hub gauge 0.9). Only db/index.ts (the app path) adds these.
 */
export async function seedDailySpend(db: SqlDriver): Promise<void> {
  const categories = createCategoriesRepo(db);
  if ((await categories.getById('cat-shopping')) === null) {
    await categories.create({ id: 'cat-shopping', name: 'Shopping', icon: 'bag', kind: 'expense', sort_order: 2 });
  }

  const transactions = createTransactionsRepo(db);
  const rows: Array<[string, number, string, string, string]> = [
    ['txn-daily-01', 12000, 'acc-cash', '2026-07-08', 'Load'],
    ['txn-daily-02', 26000, 'acc-cash', '2026-07-09', 'Ligo Sardines'],
    ['txn-daily-03', 18500, 'acc-bank', '2026-07-11', 'Soap + shampoo'],
    ['txn-daily-04', 9000, 'acc-cash', '2026-07-13', 'Notebook'],
    ['txn-daily-05', 31000, 'acc-bank', '2026-07-14', 'Slippers'],
    ['txn-daily-06', 38000, 'acc-bank', '2026-07-16', 'Birthday gift'],
    ['txn-daily-07', 15000, 'acc-cash', '2026-07-16', 'Wrapping + card'],
    ['txn-daily-08', 14000, 'acc-cash', '2026-07-17', 'Phone case'],
    ['txn-daily-09', 22000, 'acc-bank', '2026-07-19', 'Palengke basket'],
    ['txn-daily-10', 7500, 'acc-cash', '2026-07-20', 'Batteries'],
    ['txn-daily-11', 16500, 'acc-cash', '2026-07-21', 'Socks'],
  ];
  for (const [id, amount, account_id, date, note] of rows) {
    await transactions.create({
      id, amount, kind: 'expense', account_id, to_account_id: null,
      category_id: 'cat-shopping', date, note,
      discount_rule_id: null, recurring_id: null, saved_item_id: null,
    });
  }
}

/**
 * Dev-only savings data (B5): two extra savings-flagged accounts + one goal, plus a small
 * regular→savings contribution so the C1 hero shows a live savings rate instead of 0%.
 *
 * NOT called from seed(): every domain/repo/store test asserts against the §8.1 totals
 * (2 accounts, cash_flow 650000, hub gauge 0.9). Only db/index.ts (the app path) adds these,
 * exactly like seedDailySpend. The goal's saved_amount is an independent progress counter
 * (bumped by "add to goal", per the §6.3 decision), not derived from an account balance.
 */
export async function seedSavings(db: SqlDriver): Promise<void> {
  const accounts = createAccountsRepo(db);
  if ((await accounts.getById('acc-maya')) === null) {
    await accounts.create({
      id: 'acc-maya', name: 'Maya', type: 'ewallet', starting_balance: 620000, essence_color: '#E8641B',
      archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
    });
  }
  if ((await accounts.getById('acc-mp2')) === null) {
    await accounts.create({
      id: 'acc-mp2', name: 'MP2 Pag-IBIG', type: 'investment', starting_balance: 1200000, essence_color: '#7A3FD0',
      archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
    });
  }

  // A regular→savings contribution (cash → Maya) so S_net(July) > 0 → the hero rate is live.
  const transactions = createTransactionsRepo(db);
  if ((await transactions.getById('txn-save-1')) === null) {
    await transactions.create({
      id: 'txn-save-1', amount: 200000, kind: 'transfer', account_id: 'acc-cash', to_account_id: 'acc-maya',
      category_id: null, date: '2026-07-04', note: 'Move to savings',
      discount_rule_id: null, recurring_id: null, saved_item_id: null,
    });
  }

  const goals = createGoalsRepo(db);
  if ((await goals.getById('goal-laptop')) === null) {
    // target ₱30,000, saved ₱11,400 → 38% ring (matches the C1 wireframe).
    await goals.create({
      id: 'goal-laptop', name: 'Laptop fund', target_amount: 3000000,
      deadline: null, account_id: 'acc-bank', saved_amount: 1140000,
    });
  }
}

// One starter preset (§7.3: 50/30/20 is a starter, never a limit). Applying it to the
// seed salary allocates 1,000,000 + 500,000 + 200,000 centavos, ₱3,000 left free.
// Exported separately so db/index.ts can top up pre-B4 dev DBs.
export async function seedSplitPresets(db: SqlDriver): Promise<void> {
  const buckets: SplitBucket[] = [
    { target: { type: 'budget', category_id: 'cat-food' }, mode: 'percent', value: 5000 },
    { target: { type: 'budget', category_id: 'cat-transport' }, mode: 'percent', value: 2500 },
    { target: { type: 'account', account_id: 'acc-bank' }, mode: 'fixed', value: 200000 },
  ];
  await createSplitPresetsRepo(db).create({
    id: 'preset-salary',
    name: 'Salary',
    buckets: JSON.stringify(buckets),
  });
}
