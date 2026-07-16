// Ledger store — wires the transaction/account/category/budget repos to reactive state.
// No money math here (that's domain/).
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getDb } from '../db';
import { createAccountsRepo } from '../db/repositories/accountsRepo';
import { createBudgetsRepo } from '../db/repositories/budgetsRepo';
import { createCategoriesRepo } from '../db/repositories/categoriesRepo';
import { createTransactionsRepo } from '../db/repositories/transactionsRepo';
import { budgetConsumed } from '../domain/budgets';
import type { SqlDriver } from '../db/driver';
import type { Account, Budget, Category, Transaction } from '../db/repositories/types';

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

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export const useLedgerStore = defineStore('ledger', () => {
  const accounts = ref<Account[]>([]);
  const categories = ref<Category[]>([]);
  const transactions = ref<Transaction[]>([]);
  const budgets = ref<Budget[]>([]);
  const month = ref(currentMonth()); // §6.1 month switcher moves this
  const loaded = ref(false);

  const recent = computed(() => transactions.value.slice(0, RECENTS_LIMIT));

  /** §6 hub ring: budget consumed, clamped to [0,1]; null = no caps set. */
  const hubGauge = computed(() => {
    const fraction = budgetConsumed(accounts.value, transactions.value, budgets.value, month.value);
    return fraction === null ? null : Math.min(fraction, 1);
  });

  async function load(): Promise<void> {
    const db = await getDb();
    accounts.value = await createAccountsRepo(db).list();
    categories.value = await createCategoriesRepo(db).list();
    budgets.value = await createBudgetsRepo(db).listByMonth(month.value);
    await refreshTransactions(db);
    loaded.value = true;
  }

  async function refreshTransactions(db: SqlDriver): Promise<void> {
    transactions.value = await createTransactionsRepo(db).list();
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
    await refreshTransactions(db);
  }

  return { accounts, categories, transactions, budgets, month, recent, hubGauge, loaded, load, addTransaction };
});
