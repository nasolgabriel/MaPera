// Ledger store — wires the transaction/account/category/budget repos to reactive state.
// No money math here (that's domain/).
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getDb } from '../db';
import { createAccountsRepo } from '../db/repositories/accountsRepo';
import { createBudgetsRepo } from '../db/repositories/budgetsRepo';
import { createCategoriesRepo } from '../db/repositories/categoriesRepo';
import { createSplitPresetsRepo } from '../db/repositories/splitPresetsRepo';
import { createTransactionsRepo } from '../db/repositories/transactionsRepo';
import {
  budgetConsumed, budgetRemaining, budgetUsed, categorySpent, dailySafeSpend, spentByCategory, totalCap,
} from '../domain/budgets';
import { allocateSplit, daysLeftInMonth } from '../domain/split';
import { accountBalance } from '../domain/stats';
import type { SqlDriver } from '../db/driver';
import type { Account, Budget, Category, SplitPreset, Transaction } from '../db/repositories/types';
import type { SplitBucket } from '../domain/split';

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
  const presets = ref<SplitPreset[]>([]);
  const month = ref(currentMonth()); // §6.1 month switcher moves this
  const loaded = ref(false);

  const recent = computed(() => transactions.value.slice(0, RECENTS_LIMIT));

  /** §6 hub ring: budget consumed, clamped to [0,1]; null = no caps set. */
  const hubGauge = computed(() => {
    const fraction = budgetConsumed(accounts.value, transactions.value, budgets.value, month.value);
    return fraction === null ? null : Math.min(fraction, 1);
  });

  /** balance(a) per active account, keyed by id (§8.1). */
  const accountBalances = computed(
    () => new Map(accounts.value.map((a) => [a.id, accountBalance(a, transactions.value)])),
  );
  /** Donut slices: month spend by category desc, null bucket = uncategorized (invariant 3). */
  const spendSlices = computed(() => spentByCategory(accounts.value, transactions.value, month.value));
  /** Σ cap of the visible month (donut "of ₱X"). */
  const capTotal = computed(() => totalCap(budgets.value, month.value));
  /** budget_remaining(t) — donut center (§8.4). */
  const remainingBudget = computed(() =>
    budgetRemaining(accounts.value, transactions.value, budgets.value, month.value),
  );
  /** cap(c,t) per category for the visible month (caps editor rows). */
  const capsByCategory = computed(
    () => new Map(budgets.value.filter((b) => b.month === month.value).map((b) => [b.category_id, b.cap_amount])),
  );
  /** spent(c,t) per capped category (BudgetBar numerators, §8.4). */
  const spentByCappedCategory = computed(
    () =>
      new Map(
        [...capsByCategory.value.keys()].map((id) => [
          id,
          categorySpent(accounts.value, transactions.value, id, month.value),
        ]),
      ),
  );
  /** budget_used(c,t) % per capped category — null-guarded in domain (§8.7). */
  const usedByCategory = computed(
    () =>
      new Map(
        [...capsByCategory.value.keys()].map((id) => [
          id,
          budgetUsed(accounts.value, transactions.value, budgets.value, id, month.value),
        ]),
      ),
  );
  /** Days left in the visible month incl. today; 0 when the month is over. */
  const daysLeft = computed(() => daysLeftInMonth(new Date().toISOString().slice(0, 10), month.value));
  /** daily_safe_spend(t) (§8.4) — only meaningful for the real current month, else null. */
  const safeSpendToday = computed(() =>
    month.value === currentMonth()
      ? dailySafeSpend(accounts.value, transactions.value, budgets.value, month.value, daysLeft.value)
      : null,
  );

  async function load(): Promise<void> {
    const db = await getDb();
    accounts.value = await createAccountsRepo(db).list();
    categories.value = await createCategoriesRepo(db).list();
    budgets.value = await createBudgetsRepo(db).listByMonth(month.value);
    presets.value = await createSplitPresetsRepo(db).list();
    await refreshTransactions(db);
    loaded.value = true;
  }

  async function refreshTransactions(db: SqlDriver): Promise<void> {
    transactions.value = await createTransactionsRepo(db).list();
  }

  async function addTransaction(input: NewTransaction): Promise<Transaction> {
    const db = await getDb();
    const txn: Transaction = {
      id: crypto.randomUUID(),
      discount_rule_id: null,
      recurring_id: null,
      saved_item_id: null,
      ...input,
    };
    await createTransactionsRepo(db).create(txn);
    await refreshTransactions(db);
    return txn;
  }

  /** §6.1 recents tap-to-edit. Full row in, so link columns (§7.1) survive the update. */
  async function updateTransaction(txn: Transaction): Promise<void> {
    const db = await getDb();
    await createTransactionsRepo(db).update(txn);
    await refreshTransactions(db);
  }

  /** §6.1 recents swipe-left delete. Derived stats recompute reactively (invariant 4). */
  async function deleteTransaction(id: string): Promise<void> {
    const db = await getDb();
    await createTransactionsRepo(db).remove(id);
    await refreshTransactions(db);
  }

  /** §6.1 month switcher: moves the visible month and reloads its caps. */
  async function setMonth(next: string): Promise<void> {
    month.value = next;
    const db = await getDb();
    budgets.value = await createBudgetsRepo(db).listByMonth(next);
  }

  /** Caps editor: upsert a category's cap for `capMonth`; cap ≤ 0 removes the row
   *  (no zero-cap rows — keeps the §8.7 "no caps set" null-guards meaningful). */
  async function setCap(categoryId: string, capCentavos: number, capMonth = month.value): Promise<void> {
    const db = await getDb();
    const repo = createBudgetsRepo(db);
    const existing = (await repo.listByMonth(capMonth)).find((b) => b.category_id === categoryId);
    if (capCentavos <= 0) {
      if (existing) await repo.remove(existing.id);
    } else if (existing) {
      await repo.update({ ...existing, cap_amount: capCentavos });
    } else {
      await repo.create({ id: crypto.randomUUID(), category_id: categoryId, month: capMonth, cap_amount: capCentavos });
    }
    if (capMonth === month.value) budgets.value = await repo.listByMonth(capMonth);
  }

  /** §7.3 payday split. Amounts come from domain allocateSplit — no math here.
   *  Budget buckets set that category's cap for the income's month; account buckets
   *  create a transfer income-account → target (counts as S per §7.2 when savings-flagged). */
  async function applySplit(income: Transaction, buckets: SplitBucket[]): Promise<void> {
    const result = allocateSplit(income.amount, buckets);
    if (result.overAllocated) return; // UI disables Apply; never allocate more than the income
    const incomeMonth = income.date.slice(0, 7);
    for (const { bucket, amount } of result.allocations) {
      if (bucket.target.type === 'budget') {
        await setCap(bucket.target.category_id, amount, incomeMonth);
      } else if (amount > 0 && bucket.target.account_id !== income.account_id) {
        // Skip self-transfers: income already sits in that account (invariant 1 would
        // make the row a no-op anyway).
        await addTransaction({
          amount,
          kind: 'transfer',
          account_id: income.account_id,
          to_account_id: bucket.target.account_id,
          category_id: null,
          date: income.date,
          note: null,
        });
      }
    }
  }

  /** §7.3 named presets. Buckets stored as JSON-as-text (parse with parsePresetBuckets). */
  async function savePreset(name: string, buckets: SplitBucket[]): Promise<void> {
    const db = await getDb();
    const repo = createSplitPresetsRepo(db);
    await repo.create({ id: crypto.randomUUID(), name, buckets: JSON.stringify(buckets) });
    presets.value = await repo.list();
  }

  async function deletePreset(id: string): Promise<void> {
    const db = await getDb();
    const repo = createSplitPresetsRepo(db);
    await repo.remove(id);
    presets.value = await repo.list();
  }

  return {
    accounts, categories, transactions, budgets, presets, month, recent, hubGauge, loaded,
    accountBalances, spendSlices, capTotal, remainingBudget,
    capsByCategory, spentByCappedCategory, usedByCategory, daysLeft, safeSpendToday,
    load, addTransaction, updateTransaction, deleteTransaction, setMonth,
    setCap, applySplit, savePreset, deletePreset,
  };
});
