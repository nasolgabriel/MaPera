import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createSqlJsDriver } from '../db/drivers/sqljsDriver';
import type { SqlDriver } from '../db/driver';
import { seed } from '../db/seed';
import { createAccountsRepo } from '../db/repositories/accountsRepo';
import { createTransactionsRepo } from '../db/repositories/transactionsRepo';
import { cashFlow, totalBalance, sNet } from '../domain/stats';

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
