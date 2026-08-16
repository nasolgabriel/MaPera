import type { SqlDriver } from './driver';
import { createAccountsRepo } from './repositories/accountsRepo';
import { createBudgetsRepo } from './repositories/budgetsRepo';
import { createCategoriesRepo } from './repositories/categoriesRepo';
import { createGoalsRepo } from './repositories/goalsRepo';
import { createInvestmentValuesRepo } from './repositories/investmentValuesRepo';
import { createRecurringRepo } from './repositories/recurringRepo';
import { createSavedItemsRepo } from './repositories/savedItemsRepo';
import { createSplitPresetsRepo } from './repositories/splitPresetsRepo';
import { createTransactionsRepo } from './repositories/transactionsRepo';
import type { RecurringTemplate } from '../domain/dues';
import type { SplitBucket } from '../domain/split';
import type { Transaction } from './repositories/types';

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
  await seedSavedItems(db);
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

/**
 * Dev-only recurring rows (B6): one auto-transfer + three asks-first dues + one annual.
 * Reproduces the wireframe B2 dues scene — July dues = ₱2,998 (549 + 149 + 2,300), the
 * Gadget loan reads "14 of 24" (24 total − 10 remaining), and Google One (annual, Aug)
 * makes next month project to ₱3,977 with a "+₱979 — Google One annual lands in August" note.
 *
 * NOT called from seed(): every domain/repo/store test asserts against the §8.1 totals, and
 * the auto-transfer (auto_post) would post an extra transfer on/after the 30th. App path only,
 * exactly like seedSavings/seedDailySpend. The subscriptions/loan debit BPI and are UNCAPPED
 * (category_id null), so logging one never touches the documented budget donut numbers.
 */
export async function seedRecurring(db: SqlDriver): Promise<void> {
  const tmpl = (t: RecurringTemplate): string => JSON.stringify(t);
  const base = { to_account_id: null, category_id: null, total_payments: null, interval_months: null } as const;

  await createRecurringRepo(db).create({
    id: 'rec-auto-maya',
    template: tmpl({ ...base, amount: 200000, kind: 'transfer', account_id: 'acc-cash', to_account_id: 'acc-maya', note: 'Auto-save' }),
    kind: 'transfer', frequency: 'monthly', next_due: '2026-07-30', auto_post: true, remaining_payments: null,
  });
  await createRecurringRepo(db).create({
    id: 'rec-netflix',
    template: tmpl({ ...base, amount: 54900, kind: 'expense', account_id: 'acc-bank', note: 'Netflix' }),
    kind: 'subscription', frequency: 'monthly', next_due: '2026-07-15', auto_post: false, remaining_payments: null,
  });
  await createRecurringRepo(db).create({
    id: 'rec-spotify',
    template: tmpl({ ...base, amount: 14900, kind: 'expense', account_id: 'acc-bank', note: 'Spotify' }),
    kind: 'subscription', frequency: 'monthly', next_due: '2026-07-20', auto_post: false, remaining_payments: null,
  });
  await createRecurringRepo(db).create({
    id: 'rec-loan',
    template: tmpl({ ...base, amount: 230000, kind: 'expense', account_id: 'acc-bank', note: 'Gadget loan', total_payments: 24 }),
    kind: 'loan', frequency: 'monthly', next_due: '2026-07-30', auto_post: false, remaining_payments: 10,
  });
  await createRecurringRepo(db).create({
    id: 'rec-google',
    template: tmpl({ ...base, amount: 97900, kind: 'expense', account_id: 'acc-bank', note: 'Google One', interval_months: 12 }),
    kind: 'bill', frequency: 'custom', next_due: '2026-08-10', auto_post: false, remaining_payments: null,
  });
}

/**
 * Dev-only monthly history (B7): income + a savings contribution + a couple of expenses for
 * 2026-02 … 2026-06, so the §6.4 trend charts (6-month window) have real month-over-month
 * shape instead of one lone July column. Contributions rise across the months, so the savings
 * line grows and the savings-rate trend reads as improving.
 *
 * NOT called from seed(): every domain/repo/store test asserts against the §8.1 July totals,
 * and these rows would shift total_saved / S_net for the earlier months. App path only, exactly
 * like seedDailySpend/seedSavings/seedRecurring. Rows touch only the base-seed accounts
 * (acc-cash regular → acc-bank savings + acc-cash/acc-bank expenses), so they don't depend on
 * the seedSavings accounts and never land in July (the documented donut/dues month is untouched).
 */
export async function seedHistory(db: SqlDriver): Promise<void> {
  const transactions = createTransactionsRepo(db);
  const months: Array<{ m: string; save: number; food: number; transport: number }> = [
    { m: '2026-02', save: 150000, food: 700000, transport: 500000 },
    { m: '2026-03', save: 200000, food: 820000, transport: 560000 },
    { m: '2026-04', save: 180000, food: 640000, transport: 470000 },
    { m: '2026-05', save: 250000, food: 900000, transport: 700000 },
    { m: '2026-06', save: 300000, food: 720000, transport: 540000 },
  ];
  for (const { m, save, food, transport } of months) {
    const rows: Array<[string, number, Transaction['kind'], string, string | null, string | null, string]> = [
      [`txn-h-${m}-inc`, 2000000, 'income', 'acc-bank', null, 'cat-salary', `${m}-01`],
      [`txn-h-${m}-sav`, save, 'transfer', 'acc-cash', 'acc-bank', null, `${m}-05`],
      [`txn-h-${m}-food`, food, 'expense', 'acc-bank', null, 'cat-food', `${m}-10`],
      [`txn-h-${m}-trn`, transport, 'expense', 'acc-cash', null, 'cat-transport', `${m}-12`],
    ];
    for (const [id, amount, kind, account_id, to_account_id, category_id, date] of rows) {
      await transactions.create({
        id, amount, kind, account_id, to_account_id, category_id, date, note: null,
        discount_rule_id: null, recurring_id: null, saved_item_id: null,
      });
    }
  }
}

/**
 * Dev-only investment value history (B8): three monthly market-value snapshots for the
 * seeded MP2 account (from seedSavings) so the §6.3 investment row shows real returns and a
 * per-month growth figure. MP2 opens at ₱12,000 (starting_balance, its cost basis) with no
 * transfers, so: returns = 13,200 − 12,000 = +₱1,200 (+10%), and period_growth(July) =
 * 13,200 − 12,900 − 0 = +₱300 real gain.
 *
 * NOT called from seed(): value snapshots live in their own table (untouched by §8 money math),
 * but this is app-path-only for the same consistency reason as seedSavings/seedRecurring — it
 * depends on seedSavings' acc-mp2 and only shapes dev data. Guarded on acc-mp2 existing +
 * no snapshots yet, exactly like the other top-ups.
 */
export async function seedInvestments(db: SqlDriver): Promise<void> {
  const accounts = createAccountsRepo(db);
  if ((await accounts.getById('acc-mp2')) === null) return; // needs seedSavings' MP2 account

  const repo = createInvestmentValuesRepo(db);
  if ((await repo.list()).length > 0) return;

  const snapshots: Array<[string, string, number]> = [
    ['iv-mp2-05', '2026-05', 1230000],
    ['iv-mp2-06', '2026-06', 1290000],
    ['iv-mp2-07', '2026-07', 1320000],
  ];
  for (const [id, month, value] of snapshots) {
    await repo.create({ id, account_id: 'acc-mp2', month, value });
  }
}

/**
 * Dev-only credit card (B9): the wireframe D3 scene, exactly. RCBC Flex — ₱30,000 limit,
 * statement on the 15th, due on the 5th, 1 pt per ₱25 (points_rate is CENTAVOS per point).
 *
 * The rows reproduce every figure on that wireframe:
 *   June  ₱4,890 charged on the 10th → the June statement (snapshot on the 15th)
 *   June  ₱1,200 charged on the 24th → lands on the NEXT statement, not June's
 *   July  ₱4,200 charged            → card_spend(July): 21% of the ₱20,000 seed income,
 *                                     168 points at 1 pt / ₱25
 *   July  ₱4,890 paid on the 5th    → paid_in_full ✓ (invariant 8: a transfer, not an expense)
 *   → owed = 4,890 + 1,200 + 4,200 − 4,890 = ₱5,400 = 18% of the ₱30,000 limit. All green.
 *
 * The bill payment comes from acc-cash (regular → regular) ON PURPOSE: paying from BPI would
 * be a savings→regular transfer, i.e. a ₱4,890 WITHDRAWAL in §7.2 terms, which would drag the
 * seeded July S_net negative and break the documented C1 hero (10% / Silver). The card's own
 * charges are UNCAPPED (cat-shopping), so the documented donut numbers survive — the same
 * reason seedDailySpend uses that category.
 *
 * NOT called from seed(): every domain/repo/store test asserts against the §8.1 July totals,
 * and these rows move E(July). App path only, exactly like seedDailySpend/seedSavings/
 * seedRecurring/seedHistory. Guarded on the account not existing yet.
 */
export async function seedCreditCard(db: SqlDriver): Promise<void> {
  const accounts = createAccountsRepo(db);
  if ((await accounts.getById('acc-rcbc')) !== null) return;
  await accounts.create({
    id: 'acc-rcbc', name: 'RCBC Flex', type: 'credit_card', starting_balance: 0, essence_color: '#B3282D',
    archived: false, credit_limit: 3000000, statement_day: 15, due_day: 5, points_rate: 2500,
  });

  const categories = createCategoriesRepo(db);
  if ((await categories.getById('cat-shopping')) === null) {
    await categories.create({ id: 'cat-shopping', name: 'Shopping', icon: 'bag', kind: 'expense', sort_order: 2 });
  }

  const transactions = createTransactionsRepo(db);
  const charges: Array<[string, number, string, string]> = [
    ['txn-card-jun-1', 489000, '2026-06-10', 'Card · groceries + fuel'],
    ['txn-card-jun-2', 120000, '2026-06-24', 'Card · pharmacy'],
    ['txn-card-jul-1', 260000, '2026-07-03', 'Card · plane ticket'],
    ['txn-card-jul-2', 160000, '2026-07-12', 'Card · groceries'],
  ];
  for (const [id, amount, date, note] of charges) {
    await transactions.create({
      id, amount, kind: 'expense', account_id: 'acc-rcbc', to_account_id: null,
      category_id: 'cat-shopping', date, note,
      discount_rule_id: null, recurring_id: null, saved_item_id: null,
    });
  }
  // Bill payment: a TRANSFER into the card (invariant 8 — changes neither E nor cash_flow).
  await transactions.create({
    id: 'txn-card-pay', amount: 489000, kind: 'transfer', account_id: 'acc-cash', to_account_id: 'acc-rcbc',
    category_id: null, date: '2026-07-05', note: 'June statement',
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
  });
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

export async function seedSavedItems(db: SqlDriver): Promise<void> {
  const items = createSavedItemsRepo(db);
  await items.create({
    id: 'si-sardines', name: 'Ligo Sardines', description: '155g easy-open',
    usual_price: 2600, last_price: 2600, category_id: 'cat-food', kind: 'expense',
    use_count: 23, last_used_at: '2026-07-12',
  });
  await items.create({
    id: 'si-pandesal', name: 'Ligaya Bakery pandesal', description: null,
    usual_price: 4000, last_price: null, category_id: 'cat-food', kind: 'expense',
    use_count: 9, last_used_at: '2026-07-13',
  });
  await items.create({
    id: 'si-jeepney', name: 'Jeepney fare', description: 'Cubao to Katipunan',
    usual_price: 1300, last_price: 1300, category_id: 'cat-transport', kind: 'expense',
    use_count: 31, last_used_at: '2026-07-14',
  });
}
