// Ledger store — wires the transaction/account/category repos to reactive state.
// No money math here (that's domain/); this only reads/writes rows and holds them.
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getDb } from '../db';
import { createAccountsRepo } from '../db/repositories/accountsRepo';
import { createCategoriesRepo } from '../db/repositories/categoriesRepo';
import { createTransactionsRepo } from '../db/repositories/transactionsRepo';
import type { SqlDriver } from '../db/driver';
import type { Account, Category, Transaction } from '../db/repositories/types';

/** Fields the log sheet supplies; the store fills id + the B10/B6/B11 link columns. */
export interface NewTransaction {
  amount: number; // integer centavos
  kind: Transaction['kind'];
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  date: string; // ISO YYYY-MM-DD
  note: string | null;
}

const RECENTS_LIMIT = 5; // §6.1 recents = last 5 transactions

export const useLedgerStore = defineStore('ledger', () => {
  const accounts = ref<Account[]>([]);
  const categories = ref<Category[]>([]);
  const recent = ref<Transaction[]>([]);
  const loaded = ref(false);

  async function load(): Promise<void> {
    const db = await getDb();
    accounts.value = await createAccountsRepo(db).list();
    categories.value = await createCategoriesRepo(db).list();
    await refreshRecent(db);
    loaded.value = true;
  }

  async function refreshRecent(db: SqlDriver): Promise<void> {
    const all = await createTransactionsRepo(db).list();
    recent.value = all.slice(0, RECENTS_LIMIT);
  }

  async function addTransaction(input: NewTransaction): Promise<void> {
    const db = await getDb();
    await createTransactionsRepo(db).create({
      id: crypto.randomUUID(),
      discount_rule_id: null,
      recurring_id: null,
      saved_item_id: null,
      ...input,
    });
    await refreshRecent(db);
  }

  return { accounts, categories, recent, loaded, load, addTransaction };
});
