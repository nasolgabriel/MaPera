import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createSqlJsDriver } from '../db/drivers/sqljsDriver';
import type { SqlDriver } from '../db/driver';
import { seed } from '../db/seed';
import { createAccountsRepo } from '../db/repositories/accountsRepo';
import { createGoalsRepo } from '../db/repositories/goalsRepo';
import { createInvestmentValuesRepo } from '../db/repositories/investmentValuesRepo';
import { createRecurringRepo } from '../db/repositories/recurringRepo';
import { createSavedItemsRepo } from '../db/repositories/savedItemsRepo';
import { createDiscountLogsRepo } from '../db/repositories/discountLogsRepo';
import { createBudgetsRepo } from '../db/repositories/budgetsRepo';
import { createSweepsRepo } from '../db/repositories/sweepsRepo';
import { createTransactionsRepo } from '../db/repositories/transactionsRepo';
import { cashFlow, expenses, totalBalance, sNet } from '../domain/stats';
import type { Goal, Recurring } from '../db/repositories/types';
import type { RecurringTemplate } from '../domain/dues';
import { parsePresetBuckets } from '../domain/split';
import { pinSeedClock } from '../test/seedClock';

// Point the store's getDb() at a fresh in-memory driver per test.
const { dbRef } = vi.hoisted(() => ({ dbRef: { current: null as SqlDriver | null } }));
vi.mock('../db', () => ({ getDb: async () => dbRef.current }));

import { useLedgerStore } from './ledger';

const MONTH = '2026-07';

pinSeedClock();

async function snapshot() {
  const accounts = await createAccountsRepo(dbRef.current!).list();
  const txns = await createTransactionsRepo(dbRef.current!).list();
  return { accounts, txns };
}

beforeEach(async () => {
  setActivePinia(createPinia());
  dbRef.current = await createSqlJsDriver();
  await seed(dbRef.current); // §8.1 worked example: 2 accounts, 3 categories, 3 txns
});

describe('ledger store (B1)', () => {
  it('load() pulls accounts, categories, and last-5 recents', async () => {
    const store = useLedgerStore();
    await store.load();
    expect(store.accounts).toHaveLength(2);
    expect(store.categories).toHaveLength(3);
    expect(store.recent).toHaveLength(3);
    expect(store.loaded).toBe(true);
  });

  it('logs an expense and refreshes recents (2-click save path)', async () => {
    const store = useLedgerStore();
    await store.load();
    await store.addTransaction({
      amount: 12050, kind: 'expense', account_id: 'acc-cash',
      to_account_id: null, category_id: 'cat-food', date: '2026-07-10', note: 'Lunch',
    });
    const all = await createTransactionsRepo(dbRef.current!).list();
    expect(all).toHaveLength(4);
    expect(store.recent[0]).toMatchObject({ amount: 12050, note: 'Lunch' });
  });

  it('invariant 2 still holds after logging (cash_flow ≡ Δtotal_balance)', async () => {
    const store = useLedgerStore();
    await store.load();
    await store.addTransaction({
      amount: 30000, kind: 'expense', account_id: 'acc-bank',
      to_account_id: null, category_id: 'cat-food', date: '2026-07-11', note: null,
    });
    const { accounts, txns } = await snapshot();
    // seed starting balances are 0, so Δtotal_balance = totalBalance(accounts, txns).
    expect(cashFlow(accounts, txns, MONTH)).toBe(totalBalance(accounts, txns));
  });

  it('hub gauge reflects seed budgets: ₱13,500 spent of ₱15,000 caps = 0.9 (B2 accept)', async () => {
    const store = useLedgerStore();
    store.month = MONTH; // pin — seed budgets live in 2026-07
    await store.load();
    expect(store.budgets).toHaveLength(2);
    expect(store.hubGauge).toBe(0.9);
  });

  it('hub gauge clamps at 1 when spend exceeds caps', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    await store.addTransaction({
      amount: 300000, kind: 'expense', account_id: 'acc-bank',
      to_account_id: null, category_id: 'cat-food', date: '2026-07-13', note: null,
    }); // food spend ₱12,000 > ₱10,000 cap → total 16,500/15,000
    expect(store.hubGauge).toBe(1);
  });

  it('deleteTransaction removes the row and derived state refreshes (invariant 4)', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    expect(store.hubGauge).toBe(0.9);
    await store.deleteTransaction('txn-expense-2'); // −₱4,500 transport spend
    const all = await createTransactionsRepo(dbRef.current!).list();
    expect(all).toHaveLength(2);
    expect(store.recent.find((t) => t.id === 'txn-expense-2')).toBeUndefined();
    expect(store.hubGauge).toBe(0.6); // 9,000 / 15,000 — gauge recomputed, no stale cache
  });

  it('updateTransaction persists edits and re-buckets a backdated month (invariant 6)', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    const txn = store.transactions.find((t) => t.id === 'txn-expense-1')!;
    await store.updateTransaction({ ...txn, amount: 500000, date: '2026-06-15' });
    const saved = await createTransactionsRepo(dbRef.current!).getById('txn-expense-1');
    expect(saved).toMatchObject({ amount: 500000, date: '2026-06-15' });
    // Food spend left July entirely → July gauge is transport only: 4,500 / 15,000.
    expect(store.hubGauge).toBe(0.3);
  });

  it('setMonth moves the visible month and reloads its caps', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    expect(store.budgets).toHaveLength(2);
    await store.setMonth('2026-08');
    expect(store.month).toBe('2026-08');
    expect(store.budgets).toHaveLength(0); // seed caps live in 2026-07 only
    expect(store.hubGauge).toBeNull();
  });

  it('setCap upserts a cap for the visible month and 0 removes it', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    await store.setCap('cat-food', 1200000); // update existing seed cap
    expect(store.capsByCategory.get('cat-food')).toBe(1200000);
    await store.setCap('cat-salary', 100000); // create (no seed cap for this category)
    expect(store.capsByCategory.get('cat-salary')).toBe(100000);
    await store.setCap('cat-food', 0); // clear → row removed, not a zero cap
    expect(store.capsByCategory.has('cat-food')).toBe(false);
    expect(store.budgets.filter((b) => b.category_id === 'cat-food')).toHaveLength(0);
  });

  // B4 accept: split of seed salary allocates exactly, in centavos.
  it('applySplit on the seed salary writes exact caps + one savings transfer', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    const buckets = parsePresetBuckets(store.presets[0]!.buckets)!;
    expect(buckets).toHaveLength(3);
    // Income lands on the REGULAR account so the ₱2,000 fixed bucket becomes a real
    // regular→savings transfer (acc-bank is savings-flagged).
    const income = await store.addTransaction({
      amount: 2000000, kind: 'income', account_id: 'acc-cash',
      to_account_id: null, category_id: 'cat-salary', date: '2026-07-15', note: 'Salary',
    });
    await store.setCap('cat-food', 111); // pre-set garbage cap: applySplit must overwrite it
    await store.applySplit(income, buckets);

    expect(store.capsByCategory.get('cat-food')).toBe(1000000); // 50% of 2,000,000 exactly
    expect(store.capsByCategory.get('cat-transport')).toBe(500000); // 25% exactly
    const transfer = store.transactions.find((t) => t.kind === 'transfer' && t.amount === 200000);
    expect(transfer).toMatchObject({ account_id: 'acc-cash', to_account_id: 'acc-bank', date: '2026-07-15' });

    const { accounts, txns } = await snapshot();
    expect(sNet(accounts, txns, MONTH)).toBe(200000); // fixed bucket = S contribution (§7.2)
    // Invariants 1+2: the split's transfer conserves total_balance ↔ cash_flow.
    expect(cashFlow(accounts, txns, MONTH)).toBe(totalBalance(accounts, txns));
  });

  it('applySplit skips self-transfers when income lands on the target account', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    const buckets = parsePresetBuckets(store.presets[0]!.buckets)!;
    const income = await store.addTransaction({
      amount: 2000000, kind: 'income', account_id: 'acc-bank', // = the preset's fixed target
      to_account_id: null, category_id: 'cat-salary', date: '2026-07-15', note: null,
    });
    await store.applySplit(income, buckets);
    expect(store.transactions.filter((t) => t.kind === 'transfer')).toHaveLength(0);
    expect(store.capsByCategory.get('cat-food')).toBe(1000000); // caps still applied
  });

  it('a "Saving" transfer counts in S_net, not in cash_flow', async () => {
    const store = useLedgerStore();
    await store.load();
    const before = cashFlow((await snapshot()).accounts, (await snapshot()).txns, MONTH);
    await store.addTransaction({
      amount: 200000, kind: 'transfer', account_id: 'acc-cash',
      to_account_id: 'acc-bank', category_id: null, date: '2026-07-12', note: null,
    });
    const { accounts, txns } = await snapshot();
    expect(sNet(accounts, txns, MONTH)).toBe(200000); // cash(regular) → bank(savings)
    expect(cashFlow(accounts, txns, MONTH)).toBe(before); // transfer doesn't touch cash flow
  });
});

describe('savings module (B5)', () => {
  function laptopGoal(over: Partial<Goal> = {}): Goal {
    // Linked to acc-bank (savings-flagged); source money comes from acc-cash (regular).
    return {
      id: 'goal-laptop', name: 'Laptop fund', target_amount: 3000000,
      deadline: null, account_id: 'acc-bank', saved_amount: 1130000, ...over,
    };
  }

  it('load() pulls goals', async () => {
    await createGoalsRepo(dbRef.current!).create(laptopGoal());
    const store = useLedgerStore();
    await store.load();
    expect(store.goals).toHaveLength(1);
    expect(store.goals[0]).toMatchObject({ id: 'goal-laptop', saved_amount: 1130000 });
  });

  it('addToGoal writes a regular→savings transfer, bumps saved_amount, keeps invariants 1 & 2', async () => {
    await createGoalsRepo(dbRef.current!).create(laptopGoal());
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();

    await store.addToGoal('goal-laptop', 'acc-cash', 500000); // ₱5,000 cash → BPI (linked)

    const goal = store.goals.find((g) => g.id === 'goal-laptop')!;
    expect(goal.saved_amount).toBe(1630000); // 1,130,000 + 500,000
    const transfer = store.transactions.find(
      (t) => t.kind === 'transfer' && t.amount === 500000 && t.to_account_id === 'acc-bank',
    );
    expect(transfer).toMatchObject({ account_id: 'acc-cash', note: 'Goal: Laptop fund' });

    const { accounts, txns } = await snapshot();
    expect(sNet(accounts, txns, MONTH)).toBe(500000); // cash(regular) → bank(savings) = contribution
    expect(cashFlow(accounts, txns, MONTH)).toBe(totalBalance(accounts, txns)); // invariants 1 + 2
  });

  it('addToGoal skips a self-transfer when the source is the linked account but still bumps progress', async () => {
    await createGoalsRepo(dbRef.current!).create(laptopGoal());
    const store = useLedgerStore();
    await store.load();
    const before = store.transactions.length;

    await store.addToGoal('goal-laptop', 'acc-bank', 200000); // source == linked

    expect(store.transactions).toHaveLength(before); // no transfer row
    expect(store.goals.find((g) => g.id === 'goal-laptop')!.saved_amount).toBe(1330000);
  });

  it('saveGoal creates then updates, and deleteGoal removes', async () => {
    const store = useLedgerStore();
    await store.load();
    expect(store.goals).toHaveLength(0);

    await store.saveGoal(laptopGoal());
    expect(store.goals).toHaveLength(1);

    await store.saveGoal(laptopGoal({ target_amount: 4000000 }));
    expect(store.goals).toHaveLength(1); // updated in place, not duplicated
    expect(store.goals[0]!.target_amount).toBe(4000000);

    await store.deleteGoal('goal-laptop');
    expect(store.goals).toHaveLength(0);
  });

  it('totalSavedAmount + savingsRateInfo wire domain/savings to the live current month', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    // Seed income (₱20,000) lands directly on acc-bank, not as a transfer → S_net(July)=0.
    expect(store.savingsRateInfo).toMatchObject({ pct: 0, capped: false, level: 'Bronze' });
    // total_saved = balance of the savings-flagged acc-bank (§8.1): +20,000 income − 9,000 food.
    expect(store.totalSavedAmount).toBe(1100000);

    // A regular→savings contribution moves the live-month rate off zero (invariant 4 recompute).
    await store.addTransaction({
      amount: 300000, kind: 'transfer', account_id: 'acc-cash',
      to_account_id: 'acc-bank', category_id: null, date: '2026-07-18', note: null,
    });
    expect(store.savingsRateInfo).toMatchObject({ pct: 15, level: 'Gold' }); // 3,000 / 20,000
  });
});

describe('recurring engine + dues (B6)', () => {
  function tmplJson(
    o: Partial<RecurringTemplate> & Pick<RecurringTemplate, 'amount' | 'kind' | 'account_id'>,
  ): string {
    return JSON.stringify({
      to_account_id: null, category_id: null, note: null, total_payments: null, interval_months: null, ...o,
    });
  }
  async function addRecurring(p: Partial<Recurring> & Pick<Recurring, 'id' | 'template'>): Promise<void> {
    await createRecurringRepo(dbRef.current!).create({
      kind: 'subscription', frequency: 'monthly', next_due: '2026-07-15', auto_post: false, remaining_payments: null, ...p,
    });
  }

  it('load pulls recurring; dues computeds derive the card figures + next-month projection', async () => {
    await addRecurring({ id: 'rec-netflix', template: tmplJson({ amount: 54900, kind: 'expense', account_id: 'acc-bank', note: 'Netflix' }), next_due: '2026-07-15' });
    await addRecurring({ id: 'rec-loan', template: tmplJson({ amount: 230000, kind: 'expense', account_id: 'acc-bank', note: 'Gadget loan', total_payments: 24 }), kind: 'loan', next_due: '2026-07-30', remaining_payments: 10 });
    await addRecurring({ id: 'rec-google', template: tmplJson({ amount: 97900, kind: 'expense', account_id: 'acc-bank', note: 'Google One', interval_months: 12 }), kind: 'bill', frequency: 'custom', next_due: '2026-08-10' });

    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();

    expect(store.recurring).toHaveLength(3);
    expect(store.duesTotal).toBe(284900); // 54,900 + 230,000 — Google One is August, not July
    expect(store.dueDates).toEqual(['2026-07-15', '2026-07-30']);
    const loanRow = store.duesRows.find((r) => r.id === 'rec-loan')!;
    expect(loanRow.loanTotal).toBe(24);
    expect(loanRow.loanRemaining).toBe(10); // 24 − 10 = "14 of 24"
    // Projection adds the annual, with a diff note (§8.5).
    expect(store.duesNextMonth.total).toBe(382800); // 284,900 + 97,900
    expect(store.duesNextMonth.reason).toBe('Google One lands in August');
  });

  it('runRecurring posts an auto_post due once, advances it, and skips asks-first + future dues', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load(); // rows added AFTER load, so load()'s own catch-up sees none
    await addRecurring({ id: 'rec-auto', template: tmplJson({ amount: 200000, kind: 'transfer', account_id: 'acc-cash', to_account_id: 'acc-bank' }), kind: 'transfer', next_due: '2026-07-05', auto_post: true });
    await addRecurring({ id: 'rec-netflix', template: tmplJson({ amount: 54900, kind: 'expense', account_id: 'acc-bank', note: 'Netflix' }), next_due: '2026-07-15', auto_post: false });
    await addRecurring({ id: 'rec-future', template: tmplJson({ amount: 9900, kind: 'expense', account_id: 'acc-bank' }), next_due: '2026-09-01', auto_post: true });

    await store.runRecurring('2026-07-20');

    const txns = await createTransactionsRepo(dbRef.current!).list();
    const posted = txns.filter((t) => t.recurring_id === 'rec-auto');
    expect(posted).toHaveLength(1); // one cycle only (next roll lands 2026-08-05, past today)
    expect(posted[0]).toMatchObject({ amount: 200000, kind: 'transfer', to_account_id: 'acc-bank', date: '2026-07-05' });
    expect(store.recurring.find((r) => r.id === 'rec-auto')!.next_due).toBe('2026-08-05');
    expect(txns.some((t) => t.recurring_id === 'rec-netflix')).toBe(false); // asks-first left alone
    expect(txns.some((t) => t.recurring_id === 'rec-future')).toBe(false); // not due yet
  });

  it('runRecurring catches up missed cycles and stops a loan at its term', async () => {
    const store = useLedgerStore();
    await store.load();
    await addRecurring({ id: 'rec-loan', template: tmplJson({ amount: 230000, kind: 'expense', account_id: 'acc-bank', note: 'Gadget loan', total_payments: 24 }), kind: 'loan', next_due: '2026-05-30', auto_post: true, remaining_payments: 2 });

    await store.runRecurring('2027-01-01'); // far future — dates would allow many, the term caps it

    const posted = (await createTransactionsRepo(dbRef.current!).list()).filter((t) => t.recurring_id === 'rec-loan');
    expect(posted).toHaveLength(2); // exactly remaining_payments, not one per elapsed month
    const loan = store.recurring.find((r) => r.id === 'rec-loan')!;
    expect(loan.remaining_payments).toBe(0);
    expect(loan.next_due).toBe('2026-07-30'); // 05-30 → 06-30 → 07-30
  });

  it('logDue posts an asks-first due exactly once (E += amount, no double-count) and marks it paid', async () => {
    await addRecurring({ id: 'rec-netflix', template: tmplJson({ amount: 54900, kind: 'expense', account_id: 'acc-bank', note: 'Netflix' }), next_due: '2026-07-15', auto_post: false });
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();

    const before = await snapshot();
    const eBefore = expenses(before.accounts, before.txns, MONTH);
    expect(store.duesRows.find((r) => r.id === 'rec-netflix')!.paid).toBe(false);
    expect(store.duesStillDue).toBe(54900);

    await store.logDue('rec-netflix');

    const after = await snapshot();
    const posted = after.txns.filter((t) => t.recurring_id === 'rec-netflix');
    expect(posted).toHaveLength(1); // the due hits E exactly once
    expect(posted[0]).toMatchObject({ amount: 54900, kind: 'expense', date: '2026-07-15' });
    expect(expenses(after.accounts, after.txns, MONTH)).toBe(eBefore + 54900); // no double-count
    expect(store.duesRows.find((r) => r.id === 'rec-netflix')!.paid).toBe(true); // linked txn → paid
    expect(store.duesStillDue).toBe(0);
    expect(store.recurring.find((r) => r.id === 'rec-netflix')!.next_due).toBe('2026-08-15'); // advanced
  });
});

describe('statistics trends (B7)', () => {
  // Like the dues/banner tests, the trend window ends at the live month, so these assume
  // "now" is the seed month (July 2026); seed data is July-only, so July is the current point.
  it('exposes a 6-month window with the live month flagged partial', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    expect(store.statsMonths).toHaveLength(6);
    const now = store.statsMonths[5]!;
    expect(now).toBe(MONTH);
    const last = store.savingsTrend[5]!;
    expect(last.month).toBe(MONTH);
    expect(last.partial).toBe(true); // drawn dashed, excluded from mom_change (§8.7)
    expect(store.savingsTrend.slice(0, 5).every((p) => !p.partial)).toBe(true);
  });

  it('expense + savings series recompute after add/delete (invariant 4 — no stale stats)', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    const nowExpense = () => store.expenseTrend[5]!.value;
    const nowSaved = () => store.savingsTrend[5]!.value;

    expect(nowExpense()).toBe(1350000); // July seed E = ₱13,500
    const savedBefore = nowSaved();

    await store.addTransaction({
      amount: 25000, kind: 'expense', account_id: 'acc-cash',
      to_account_id: null, category_id: 'cat-food', date: '2026-07-22', note: null,
    });
    expect(nowExpense()).toBe(1375000); // recomputed, not cached

    await store.deleteTransaction('txn-expense-2'); // −₱4,500 transport
    expect(nowExpense()).toBe(925000); // 1,375,000 − 450,000

    // A regular→savings contribution lifts the cumulative savings point (and only it).
    await store.addTransaction({
      amount: 300000, kind: 'transfer', account_id: 'acc-cash',
      to_account_id: 'acc-bank', category_id: null, date: '2026-07-23', note: null,
    });
    expect(nowSaved()).toBe(savedBefore + 300000);
  });

  it('wires the rate + spend-vs-budget cards from domain (§8.2 / §8.4)', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    // Seed: Σ spent 13,500 vs Σ cap 15,000 → −10% (under). No prior-month rate → delta null.
    expect(store.spendVsBudget).toBeCloseTo(-10);
    expect(store.savingsRateDelta).toBeNull();

    // Completed months are all empty in the seed-only fixture → headline change is "—".
    expect(store.expenseTrendChange).toBeNull();
  });

  it('netTrend is free_cash_flow per month and recomputes on edit (invariant 4)', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    // July seed: I 20,000 − E 13,500 − S_net 0 = ₱6,500.
    expect(store.netTrend[5]!.value).toBe(650000);

    const income = store.transactions.find((t) => t.id === 'txn-income-1')!;
    await store.updateTransaction({ ...income, amount: 2500000 });
    expect(store.netTrend[5]!.value).toBe(1150000); // 25,000 − 13,500
  });
});

describe('investments (B8)', () => {
  async function addInvestmentAccount(): Promise<void> {
    await createAccountsRepo(dbRef.current!).create({
      id: 'acc-mp2', name: 'MP2', type: 'investment', starting_balance: 1200000, essence_color: '#7A3FD0',
      archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
    });
  }

  it('load pulls values; investmentsView computes §8.3 returns + period growth', async () => {
    await addInvestmentAccount();
    const iv = createInvestmentValuesRepo(dbRef.current!);
    await iv.create({ id: 'iv-06', account_id: 'acc-mp2', month: '2026-06', value: 1290000 });
    await iv.create({ id: 'iv-07', account_id: 'acc-mp2', month: '2026-07', value: 1320000 });

    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();

    expect(store.investmentValues).toHaveLength(2);
    const view = store.investmentsView.find((i) => i.account.id === 'acc-mp2')!;
    expect(view.marketValue).toBe(1320000); // latest snapshot
    expect(view.returns).toBe(120000); // 1,320,000 − 1,200,000 basis (opening balance)
    expect(view.returnPct).toBeCloseTo(10); // 120,000 / 1,200,000
    expect(view.periodGrowth).toBe(30000); // 1,320,000 − 1,290,000 − 0 contributions
  });

  it('nets a deposit out of period growth — deposits ≠ gains (invariant 10)', async () => {
    await addInvestmentAccount();
    const iv = createInvestmentValuesRepo(dbRef.current!);
    await iv.create({ id: 'iv-06', account_id: 'acc-mp2', month: '2026-06', value: 1000000 });
    await iv.create({ id: 'iv-07', account_id: 'acc-mp2', month: '2026-07', value: 1520000 });

    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    await store.addTransaction({
      amount: 200000, kind: 'transfer', account_id: 'acc-cash',
      to_account_id: 'acc-mp2', category_id: null, date: '2026-07-06', note: null,
    });

    const view = store.investmentsView.find((i) => i.account.id === 'acc-mp2')!;
    // Raw value delta is 520,000, but 200,000 of it was fresh capital → real gain 320,000.
    expect(view.periodGrowth).toBe(320000);
    // The deposit joins the cost basis: 1,200,000 + 200,000 = 1,400,000.
    expect(view.returns).toBe(120000); // 1,520,000 − 1,400,000
  });

  it('logInvestmentValue upserts one snapshot per account per month', async () => {
    await addInvestmentAccount();
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    expect(store.investmentsView.find((i) => i.account.id === 'acc-mp2')!.marketValue).toBeNull();

    await store.logInvestmentValue('acc-mp2', 1300000, MONTH);
    expect(store.investmentValues).toHaveLength(1);
    expect(store.investmentsView.find((i) => i.account.id === 'acc-mp2')!.marketValue).toBe(1300000);

    await store.logInvestmentValue('acc-mp2', 1310000, MONTH); // same month → overwrite, no dupe
    expect(store.investmentValues).toHaveLength(1);
    expect(store.investmentsView.find((i) => i.account.id === 'acc-mp2')!.marketValue).toBe(1310000);
  });
});

describe('credit card (B9)', () => {
  /** The wireframe D3 card: ₱30,000 limit, statement on the 15th, 1 pt / ₱25. */
  async function addCard(): Promise<void> {
    await createAccountsRepo(dbRef.current!).create({
      id: 'acc-rcbc', name: 'RCBC Flex', type: 'credit_card', starting_balance: 0, essence_color: '#B3282D',
      archived: false, credit_limit: 3000000, statement_day: 15, due_day: 5, points_rate: 2500,
    });
  }

  /** June ₱4,890 (on the statement) + ₱1,200 (after it), July ₱4,200 charged. */
  async function addCharges(): Promise<void> {
    const txns = createTransactionsRepo(dbRef.current!);
    const rows: Array<[string, number, string]> = [
      ['txn-card-jun-1', 489000, '2026-06-10'],
      ['txn-card-jun-2', 120000, '2026-06-24'],
      ['txn-card-jul-1', 420000, '2026-07-08'],
    ];
    for (const [id, amount, date] of rows) {
      await txns.create({
        id, amount, kind: 'expense', account_id: 'acc-rcbc', to_account_id: null,
        category_id: null, date, note: null,
        discount_rule_id: null, recurring_id: null, saved_item_id: null,
      });
    }
  }

  it('creditCardsView computes the §8.6 figures and flags a healthy card', async () => {
    await addCard();
    await addCharges();
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    // Pay the June statement in full from cash (regular → regular, so S_net is untouched).
    await store.addTransaction({
      amount: 489000, kind: 'transfer', account_id: 'acc-cash',
      to_account_id: 'acc-rcbc', category_id: null, date: '2026-07-05', note: 'June statement',
    });

    const card = store.creditCardsView.find((c) => c.account.id === 'acc-rcbc')!;
    expect(card.owed).toBe(540000); // 4,890 + 1,200 + 4,200 − 4,890
    expect(card.utilization).toBeCloseTo(18); // of the ₱30,000 limit
    expect(card.cardSpend).toBe(420000); // July charges only — the payment is not spend
    expect(card.incomeShare).toBeCloseTo(21); // of the ₱20,000 seed income
    expect(card.points).toBe(168); // floor(4,200 / 25)
    expect(card.previousStatement).toBe(489000); // June 15 snapshot, not the 24th charge
    expect(card.paidInFull).toBe(true);
    expect(card.healthy).toBe(true);
    expect(store.cardHealthByAccount.get('acc-rcbc')!.owed).toBe(540000);
  });

  it('a card bill payment changes neither E nor cash_flow (invariant 8)', async () => {
    await addCard();
    await addCharges();
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();

    const before = await snapshot();
    const eBefore = expenses(before.accounts, before.txns, MONTH);
    const flowBefore = cashFlow(before.accounts, before.txns, MONTH);
    const owedBefore = store.creditCardsView.find((c) => c.account.id === 'acc-rcbc')!.owed;

    await store.addTransaction({
      amount: 489000, kind: 'transfer', account_id: 'acc-cash',
      to_account_id: 'acc-rcbc', category_id: null, date: '2026-07-05', note: 'June statement',
    });

    const after = await snapshot();
    expect(expenses(after.accounts, after.txns, MONTH)).toBe(eBefore);
    expect(cashFlow(after.accounts, after.txns, MONTH)).toBe(flowBefore);
    // …and the debt really moved: owed dropped by exactly the payment.
    expect(store.creditCardsView.find((c) => c.account.id === 'acc-rcbc')!.owed).toBe(owedBefore - 489000);
  });

  it('flags an unpaid statement red and recomputes after the payment lands (invariant 4)', async () => {
    await addCard();
    await addCharges();
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();

    let card = store.creditCardsView.find((c) => c.account.id === 'acc-rcbc')!;
    expect(card.paidInFull).toBe(false); // June's ₱4,890 statement is still outstanding
    expect(card.checks.paidInFull).toBe('bad');
    expect(card.healthy).toBe(false);
    expect(card.estimatedInterest).toBe(Math.round(card.owed * 0.035));

    await store.addTransaction({
      amount: 489000, kind: 'transfer', account_id: 'acc-cash',
      to_account_id: 'acc-rcbc', category_id: null, date: '2026-07-05', note: 'June statement',
    });

    card = store.creditCardsView.find((c) => c.account.id === 'acc-rcbc')!;
    expect(card.paidInFull).toBe(true);
    expect(card.healthy).toBe(true);
    expect(card.estimatedInterest).toBeNull();
  });
});

describe('budget home calendar + graph wiring (E2)', () => {
  it('monthCells lay out the visible month and recompute after add/delete (invariant 4)', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();

    expect(store.monthCells).toHaveLength(35); // 2 leading blanks + 31 days + 2 trailing
    const dayOf = (day: number) => store.monthCells.find((c) => c.day === day)!;
    expect(dayOf(5).spend).toBe(900000); // seed food expense
    expect(dayOf(6).spend).toBe(450000); // seed transport expense
    expect(dayOf(12).spend).toBe(0);

    await store.addTransaction({
      amount: 25000, kind: 'expense', account_id: 'acc-cash',
      to_account_id: null, category_id: 'cat-food', date: '2026-07-12', note: null,
    });
    expect(store.monthCells.find((c) => c.day === 12)?.spend).toBe(25000);

    await store.deleteTransaction('txn-expense-2');
    expect(store.monthCells.find((c) => c.day === 6)?.spend).toBe(0);
  });

  it('dayCap spreads Σ cap over the month and is null without caps (§8.7)', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    expect(store.dayCap).toBeCloseTo(1500000 / 31);

    await store.setMonth('2026-08'); // no caps seeded there
    expect(store.dayCap).toBeNull();
    expect(store.monthCells.some((c) => c.level === 'over')).toBe(false);
  });

  it('weekDays is a 7-day window and weekChange guards a zero previous week', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    expect(store.weekDays).toHaveLength(7);
    // Browsing a past month ends the window on that month's last day.
    await store.setMonth('2026-06');
    expect(store.weekDays[6]?.date).toBe('2026-06-30');
    expect(store.weekTotal).toBe(0);
    expect(store.previousWeekTotal).toBe(0);
    expect(store.weekChange).toBeNull(); // no division by zero
    expect(store.weekAverage).toBe(0);
  });
});

describe('reactive calendar day (month rollover)', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('re-derives the live month when the day advances, and carries the live view with it', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    expect(store.liveMonth).toBe(MONTH);
    expect(store.statsMonths[5]).toBe(MONTH);

    store.today = '2026-08-01';
    await settle();

    expect(store.liveMonth).toBe('2026-08');
    expect(store.statsMonths[5]).toBe('2026-08');
    expect(store.savingsTrend[5]!.partial).toBe(true);
    expect(store.month).toBe('2026-08');
    expect(store.budgets).toHaveLength(0);
  });

  it('refreshToday() picks up a real clock advance (the App wake path)', async () => {
    const store = useLedgerStore();
    store.month = MONTH;
    await store.load();
    expect(store.statsMonths[5]).toBe(MONTH);

    vi.setSystemTime(new Date('2026-08-01T09:00:00'));
    expect(store.statsMonths[5]).toBe(MONTH);

    store.refreshToday();
    await settle();

    expect(store.today).toBe('2026-08-01');
    expect(store.liveMonth).toBe('2026-08');
    expect(store.statsMonths[5]).toBe('2026-08');
  });

  it('leaves a deliberately-switched month alone across a rollover', async () => {
    const store = useLedgerStore();
    await store.load();
    await store.setMonth('2026-05');

    store.today = '2026-08-01';
    await settle();

    expect(store.liveMonth).toBe('2026-08');
    expect(store.month).toBe('2026-05');
  });
});

describe('saved items (B10 · §7.6)', () => {
  it('load() pulls the library, ranked by use_count then recency', async () => {
    const store = useLedgerStore();
    await store.load();
    expect(store.savedItems.map((i) => i.id)).toEqual(['si-jeepney', 'si-sardines', 'si-pandesal']);
  });

  it('a log that used an item bumps use_count, remembers the price paid, moves recency', async () => {
    const store = useLedgerStore();
    await store.load();
    await store.addTransaction({
      amount: 2800, kind: 'expense', account_id: 'acc-cash', to_account_id: null,
      category_id: 'cat-food', date: '2026-07-14', note: 'Ligo Sardines',
      saved_item_id: 'si-sardines',
    });

    const item = await createSavedItemsRepo(dbRef.current!).getById('si-sardines');
    expect(item).toMatchObject({ use_count: 24, last_price: 2800, last_used_at: '2026-07-14' });
    expect(item!.usual_price).toBe(2600);
    expect(store.recent[0]!.saved_item_id).toBe('si-sardines');
    expect(store.savedItems.find((i) => i.id === 'si-sardines')!.use_count).toBe(24);
  });

  it('leaves the library alone for a log that used no item', async () => {
    const store = useLedgerStore();
    await store.load();
    await store.addTransaction({
      amount: 2600, kind: 'expense', account_id: 'acc-cash', to_account_id: null,
      category_id: 'cat-food', date: '2026-07-14', note: 'Ligo Sardines',
    });
    const item = await createSavedItemsRepo(dbRef.current!).getById('si-sardines');
    expect(item).toMatchObject({ use_count: 23, last_price: 2600, last_used_at: '2026-07-12' });
    expect(store.recent[0]!.saved_item_id).toBeNull();
  });

  it('does not re-bump when an existing log is edited (a correction is not a new use)', async () => {
    const store = useLedgerStore();
    await store.load();
    const txn = await store.addTransaction({
      amount: 2800, kind: 'expense', account_id: 'acc-cash', to_account_id: null,
      category_id: 'cat-food', date: '2026-07-14', note: 'Ligo Sardines',
      saved_item_id: 'si-sardines',
    });
    await store.updateTransaction({ ...txn, amount: 3000 });

    const item = await createSavedItemsRepo(dbRef.current!).getById('si-sardines');
    expect(item!.use_count).toBe(24);
    expect(item!.last_price).toBe(2800);
    expect(store.recent[0]!.saved_item_id).toBe('si-sardines');
  });

  it('creates, edits and deletes a library item; an edit keeps its rank data', async () => {
    const store = useLedgerStore();
    await store.load();
    await store.saveSavedItem({
      id: 'si-new', name: 'Kopiko 3-in-1', description: null, usual_price: 900,
      last_price: null, category_id: 'cat-food', kind: 'expense', use_count: 0, last_used_at: null,
    });
    expect(store.savedItems).toHaveLength(4);

    await store.addTransaction({
      amount: 900, kind: 'expense', account_id: 'acc-cash', to_account_id: null,
      category_id: 'cat-food', date: '2026-07-14', note: 'Kopiko 3-in-1', saved_item_id: 'si-new',
    });
    const used = store.savedItems.find((i) => i.id === 'si-new')!;
    expect(used.use_count).toBe(1);

    await store.saveSavedItem({ ...used, name: 'Kopiko Brown' });
    const renamed = store.savedItems.find((i) => i.id === 'si-new')!;
    expect(renamed).toMatchObject({ name: 'Kopiko Brown', use_count: 1, last_price: 900 });

    await store.deleteSavedItem('si-new');
    expect(store.savedItems.map((i) => i.id)).not.toContain('si-new');
  });

  it('a log whose item has since been deleted still saves (the bump is a no-op)', async () => {
    const store = useLedgerStore();
    await store.load();
    await store.deleteSavedItem('si-sardines');
    const txn = await store.addTransaction({
      amount: 2600, kind: 'expense', account_id: 'acc-cash', to_account_id: null,
      category_id: 'cat-food', date: '2026-07-14', note: 'Ligo Sardines',
      saved_item_id: 'si-sardines',
    });
    expect(txn.id).toBeTruthy();
    expect((await createTransactionsRepo(dbRef.current!).list())).toHaveLength(4);
  });

  it('the library moves no money — E and cash_flow are untouched by a rename', async () => {
    const store = useLedgerStore();
    await store.load();
    const before = await snapshot();
    await store.saveSavedItem({
      ...store.savedItems.find((i) => i.id === 'si-sardines')!,
      name: 'Ligo Sardines (big)',
      usual_price: 9900,
    });
    const after = await snapshot();
    expect(expenses(after.accounts, after.txns, MONTH)).toBe(expenses(before.accounts, before.txns, MONTH));
    expect(cashFlow(after.accounts, after.txns, MONTH)).toBe(cashFlow(before.accounts, before.txns, MONTH));
  });
});

describe('discounts (B11 · §6.5 / §7.9)', () => {
  it('ships the bundled fare rules without a repo', async () => {
    const store = useLedgerStore();
    await store.load();
    expect(store.discountRulesVersion).toBe(1);
    expect(store.discountRules).toHaveLength(6);
    expect(store.discountLogs).toEqual([]);
    expect(store.discountSavedThisYear).toBe(0);
  });

  it('logs a discounted fare as an expense at the price actually paid', async () => {
    const store = useLedgerStore();
    await store.load();
    const before = await snapshot();

    const txn = await store.logDiscountedFare({
      ruleId: 'fare-jeepney-student',
      baseCentavos: 1500,
      discountedCentavos: 1200,
      accountId: 'acc-cash',
      categoryId: 'cat-transport',
      date: '2026-07-14',
      note: 'student fare',
    });

    expect(txn.amount).toBe(1200);
    expect(txn.kind).toBe('expense');
    expect(txn.discount_rule_id).toBe('fare-jeepney-student');

    const after = await snapshot();
    expect(expenses(after.accounts, after.txns, MONTH)).toBe(
      expenses(before.accounts, before.txns, MONTH) + 1200,
    );
    expect(cashFlow(after.accounts, after.txns, MONTH)).toBe(
      cashFlow(before.accounts, before.txns, MONTH) - 1200,
    );
  });

  it('records the base price so the yearly counter is exact, not reverse-engineered', async () => {
    const store = useLedgerStore();
    await store.load();
    await store.logDiscountedFare({
      ruleId: 'fare-jeepney-student', baseCentavos: 1500, discountedCentavos: 1200,
      accountId: 'acc-cash', categoryId: 'cat-transport', date: '2026-07-14', note: null,
    });
    await store.logDiscountedFare({
      ruleId: 'fare-bus-train-senior', baseCentavos: 1300, discountedCentavos: 1050,
      accountId: 'acc-cash', categoryId: 'cat-transport', date: '2026-07-15', note: null,
    });

    const logs = await createDiscountLogsRepo(dbRef.current!).list();
    expect(logs.map((l) => l.base_amount).sort()).toEqual([1300, 1500]);
    expect(store.discountSavedThisYear).toBe(550);
  });

  it('counts only the current year', async () => {
    const store = useLedgerStore();
    await store.load();
    await store.logDiscountedFare({
      ruleId: 'fare-jeepney-student', baseCentavos: 1500, discountedCentavos: 1200,
      accountId: 'acc-cash', categoryId: 'cat-transport', date: '2025-12-31', note: null,
    });
    expect(store.discountSavedThisYear).toBe(0);

    await store.logDiscountedFare({
      ruleId: 'fare-jeepney-student', baseCentavos: 1500, discountedCentavos: 1200,
      accountId: 'acc-cash', categoryId: 'cat-transport', date: '2026-01-02', note: null,
    });
    expect(store.discountSavedThisYear).toBe(300);
  });

  it('deleting the transaction drops it out of the counter (invariant 4)', async () => {
    const store = useLedgerStore();
    await store.load();
    const txn = await store.logDiscountedFare({
      ruleId: 'fare-jeepney-student', baseCentavos: 1500, discountedCentavos: 1200,
      accountId: 'acc-cash', categoryId: 'cat-transport', date: '2026-07-14', note: null,
    });
    expect(store.discountSavedThisYear).toBe(300);

    await store.deleteTransaction(txn.id);
    expect(store.discountSavedThisYear).toBe(0);
  });
});

describe('ledger store (B12 gamification)', () => {
  async function contribution(id: string, amount: number, date: string): Promise<void> {
    await createTransactionsRepo(dbRef.current!).create({
      id, amount, kind: 'transfer', account_id: 'acc-cash', to_account_id: 'acc-bank',
      category_id: null, date, note: null,
      discount_rule_id: null, recurring_id: null, saved_item_id: null,
    });
  }

  async function juneUnderBudget(): Promise<void> {
    await createBudgetsRepo(dbRef.current!).create({
      id: 'bud-food-jun', category_id: 'cat-food', month: '2026-06', cap_amount: 1000000,
    });
    await createTransactionsRepo(dbRef.current!).create({
      id: 'txn-jun-food', amount: 880000, kind: 'expense', account_id: 'acc-bank', to_account_id: null,
      category_id: 'cat-food', date: '2026-06-10', note: null,
      discount_rule_id: null, recurring_id: null, saved_item_id: null,
    });
  }

  it('counts a saving week per ISO week, not per log day', async () => {
    await contribution('c1', 100000, '2026-06-30'); // W27
    await contribution('c2', 50000, '2026-07-07'); // W28
    await contribution('c3', 50000, '2026-07-09'); // W28 again — same week, still one
    await contribution('c4', 50000, '2026-07-14'); // W29 (today)
    const store = useLedgerStore();
    await store.load();

    expect(store.savingStreak.weeks).toBe(3);
    expect(store.streakWeekBars.map((w) => w.week)).toEqual(['2026-W27', '2026-W28', '2026-W29']);
  });

  it('recomputes the streak when a transaction is deleted (invariant 4)', async () => {
    await contribution('c1', 100000, '2026-06-30'); // W27
    await contribution('c2', 50000, '2026-07-07'); // W28
    await contribution('c3', 50000, '2026-07-14'); // W29
    const store = useLedgerStore();
    await store.load();
    expect(store.savingStreak.weeks).toBe(3);

    await store.deleteTransaction('c2'); // W28 now has no saving — the streak breaks there
    expect(store.savingStreak.weeks).toBe(1);
  });

  it('offers last month’s leftover once the month has closed', async () => {
    await juneUnderBudget();
    const store = useLedgerStore();
    await store.load();
    expect(store.underBudgetSweep).toEqual({ month: '2026-06', leftover: 120000 });
  });

  it('sweeping moves the leftover into savings and counts the week double', async () => {
    await juneUnderBudget();
    await contribution('c1', 50000, '2026-07-07'); // W28
    const store = useLedgerStore();
    await store.load();
    expect(store.savingStreak.weeks).toBe(1);

    const before = await snapshot();
    await store.sweepUnderBudget('acc-cash', 'acc-bank');
    const after = await snapshot();

    expect(totalBalance(after.accounts, after.txns)).toBe(totalBalance(before.accounts, before.txns));
    expect(sNet(after.accounts, after.txns, MONTH)).toBe(sNet(before.accounts, before.txns, MONTH) + 120000);
    expect(store.savingStreak.weeks).toBe(3);
    expect(store.streakWeekBars[store.streakWeekBars.length - 1]).toMatchObject({ week: '2026-W29', swept: true });
  });

  it('offers a month only once', async () => {
    await juneUnderBudget();
    const store = useLedgerStore();
    await store.load();
    await store.sweepUnderBudget('acc-cash', 'acc-bank');

    expect(store.underBudgetSweep).toBeNull();
    expect(await createSweepsRepo(dbRef.current!).list()).toMatchObject([{ month: '2026-06' }]);

    const count = (await createTransactionsRepo(dbRef.current!).list()).length;
    await store.sweepUnderBudget('acc-cash', 'acc-bank');
    expect((await createTransactionsRepo(dbRef.current!).list()).length).toBe(count);
  });

  it('offers nothing when the closed month had no caps', async () => {
    const store = useLedgerStore();
    await store.load();
    expect(store.underBudgetSweep).toBeNull();
  });

  it('surfaces the next milestone with its ₱-to-go', async () => {
    const store = useLedgerStore();
    await store.load();
    expect(store.milestoneRows[0]).toMatchObject({ amount: 1000000, reached: true });
    expect(store.nextMilestone).toMatchObject({ amount: 5000000, toGo: 3900000 });
  });
});

describe('ledger store — concurrent load()', () => {
  async function overdueAutoTransfer(): Promise<void> {
    await createRecurringRepo(dbRef.current!).create({
      id: 'rec-auto', kind: 'transfer', frequency: 'monthly', next_due: '2026-07-01',
      auto_post: true, remaining_payments: null,
      template: JSON.stringify({
        amount: 200000, kind: 'transfer', account_id: 'acc-cash', to_account_id: 'acc-bank',
        category_id: null, note: 'Auto-save', total_payments: null, interval_months: null,
      }),
    });
  }

  it('posts a due auto-transfer exactly once when two components mount together', async () => {
    await overdueAutoTransfer();
    const store = useLedgerStore();
    await Promise.all([store.load(), store.load()]);

    const txns = await createTransactionsRepo(dbRef.current!).list();
    expect(txns.filter((t) => t.recurring_id === 'rec-auto')).toHaveLength(1);
  });

  it('keeps a loan schedule consistent under a double mount', async () => {
    await createRecurringRepo(dbRef.current!).create({
      id: 'rec-loan2', kind: 'loan', frequency: 'monthly', next_due: '2026-07-05',
      auto_post: true, remaining_payments: 10,
      template: JSON.stringify({
        amount: 230000, kind: 'expense', account_id: 'acc-bank', to_account_id: null,
        category_id: null, note: 'Gadget loan', total_payments: 24, interval_months: null,
      }),
    });
    const store = useLedgerStore();
    await Promise.all([store.load(), store.load(), store.load()]);

    const txns = await createTransactionsRepo(dbRef.current!).list();
    const paid = txns.filter((t) => t.recurring_id === 'rec-loan2');
    const row = await createRecurringRepo(dbRef.current!).getById('rec-loan2');
    expect(paid).toHaveLength(1);
    expect(row?.remaining_payments).toBe(9);
    expect(row?.next_due).toBe('2026-08-05');
  });

  it('still reloads on a later explicit call', async () => {
    const store = useLedgerStore();
    await store.load();
    await store.load();
    expect(store.loaded).toBe(true);
    expect(store.accounts).toHaveLength(2);
  });
});
