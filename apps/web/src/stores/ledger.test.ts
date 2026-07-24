import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createSqlJsDriver } from '../db/drivers/sqljsDriver';
import type { SqlDriver } from '../db/driver';
import { seed } from '../db/seed';
import { createAccountsRepo } from '../db/repositories/accountsRepo';
import { createGoalsRepo } from '../db/repositories/goalsRepo';
import { createTransactionsRepo } from '../db/repositories/transactionsRepo';
import { cashFlow, totalBalance, sNet } from '../domain/stats';
import type { Goal } from '../db/repositories/types';
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
