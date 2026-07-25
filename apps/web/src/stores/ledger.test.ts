import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createSqlJsDriver } from '../db/drivers/sqljsDriver';
import type { SqlDriver } from '../db/driver';
import { seed } from '../db/seed';
import { createAccountsRepo } from '../db/repositories/accountsRepo';
import { createGoalsRepo } from '../db/repositories/goalsRepo';
import { createInvestmentValuesRepo } from '../db/repositories/investmentValuesRepo';
import { createRecurringRepo } from '../db/repositories/recurringRepo';
import { createTransactionsRepo } from '../db/repositories/transactionsRepo';
import { cashFlow, expenses, totalBalance, sNet } from '../domain/stats';
import type { Goal, Recurring } from '../db/repositories/types';
import type { RecurringTemplate } from '../domain/dues';
import { parsePresetBuckets } from '../domain/split';

// Point the store's getDb() at a fresh in-memory driver per test.
const { dbRef } = vi.hoisted(() => ({ dbRef: { current: null as SqlDriver | null } }));
vi.mock('../db', () => ({ getDb: async () => dbRef.current }));

import { useLedgerStore } from './ledger';

const MONTH = '2026-07';

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
