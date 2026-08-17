// Ledger store — wires the transaction/account/category/budget repos to reactive state.
// No money math here (that's domain/).
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { getDb } from '../db';
import { createAccountsRepo } from '../db/repositories/accountsRepo';
import { createBudgetsRepo } from '../db/repositories/budgetsRepo';
import { createCategoriesRepo } from '../db/repositories/categoriesRepo';
import { createDiscountLogsRepo } from '../db/repositories/discountLogsRepo';
import { createGoalsRepo } from '../db/repositories/goalsRepo';
import { createInvestmentValuesRepo } from '../db/repositories/investmentValuesRepo';
import { createRecurringRepo } from '../db/repositories/recurringRepo';
import { createSavedItemsRepo } from '../db/repositories/savedItemsRepo';
import { createSplitPresetsRepo } from '../db/repositories/splitPresetsRepo';
import { createTransactionsRepo } from '../db/repositories/transactionsRepo';
import {
  budgetConsumed, budgetRemaining, budgetUsed, categorySpent, dailySafeSpend, spentByCategory, totalCap, vsBudget,
} from '../domain/budgets';
import {
  expenseSeries, monthKeys, netSeries, savingsComparison, savingsSeries,
} from '../domain/statistics';
import type { SeriesPoint } from '../domain/statistics';
import {
  dueNextMonth, dueThisMonth, duesTotal as sumDueRows, nextDueAfter, parseRecurringTemplate,
  stillDue as sumUnpaid,
} from '../domain/dues';
import {
  addDays, averagePerDay, dailyCapAverage, daysInMonth, lastSevenDays, monthGrid, spendByDay,
  spendByDayInRange, sumSpend,
} from '../domain/calendar';
import {
  avgContribution, projectedGoalMonth, savingsRate,
} from '../domain/savings';
import {
  investmentReturns, periodGrowth, returnPct,
} from '../domain/investments';
import { cardHealth } from '../domain/credit';
import { touchSavedItem } from '../domain/savedItems';
import { discountSaved } from '../domain/discounts';
import type { DiscountRule, DiscountRuleSet } from '../domain/discounts';
import discountRulesFile from '../data/discountRules.json';
import { allocateSplit, daysLeftInMonth } from '../domain/split';
import {
  accountBalance, income, isSavingsAccount, momChange, sNet, totalSaved,
} from '../domain/stats';
import type { SqlDriver } from '../db/driver';
import type { Account, Budget, Category, DiscountLog, Goal, InvestmentValue, Recurring, SavedItem, SplitPreset, Transaction } from '../db/repositories/types';
import type { RecurringTemplate } from '../domain/dues';
import type { SplitBucket } from '../domain/split';

/** Fields the log sheet supplies; the store fills id + the B11 link column.
 *  recurring_id is optional so the B6 engine + logDue can link a posted due; default null. */
export interface NewTransaction {
  amount: number; // integer centavos
  kind: Transaction['kind'];
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  date: string; // ISO YYYY-MM-DD
  note: string | null;
  recurring_id?: string | null;
  saved_item_id?: string | null;
  discount_rule_id?: string | null;
}

/** True once a loan has no scheduled payments left (§8.5). */
function loanExhausted(r: Recurring): boolean {
  return r.kind === 'loan' && r.remaining_payments !== null && r.remaining_payments <= 0;
}

/** Advance a recurring one cycle: roll next_due (day-clamped) and count a loan down by one. */
function advanceRecurring(r: Recurring, tmpl: RecurringTemplate): Recurring {
  return {
    ...r,
    next_due: nextDueAfter(r.next_due, r.frequency, tmpl.interval_months),
    remaining_payments:
      r.kind === 'loan' && r.remaining_payments !== null
        ? Math.max(0, r.remaining_payments - 1)
        : r.remaining_payments,
  };
}

const RECENTS_LIMIT = 5; // §6.1 recents = last 5 transactions
const STATS_WINDOW = 6; // §6.4 trend charts show a rolling 6-month window

/** mom_change of the last two COMPLETED months (§8.7 excludes the partial live month). */
function completedChange(points: SeriesPoint[]): number | null {
  const done = points.filter((p) => !p.partial).map((p) => p.value);
  if (done.length < 2) return null;
  return momChange(done[done.length - 1]!, done[done.length - 2]!);
}

/** 'YYYY-MM' key `delta` months from `month` (delta may be negative). */
function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Local calendar day as ISO 'YYYY-MM-DD' (toISOString would shift by the UTC offset). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const useLedgerStore = defineStore('ledger', () => {
  const accounts = ref<Account[]>([]);
  const categories = ref<Category[]>([]);
  const transactions = ref<Transaction[]>([]);
  const budgets = ref<Budget[]>([]);
  const presets = ref<SplitPreset[]>([]);
  const goals = ref<Goal[]>([]);
  const recurring = ref<Recurring[]>([]); // §7.3/§7.5 auto-transfers + dues
  const investmentValues = ref<InvestmentValue[]>([]); // §7.7 logged market-value snapshots
  const savedItems = ref<SavedItem[]>([]);
  const discountLogs = ref<DiscountLog[]>([]);
  const discountRules: DiscountRule[] = (discountRulesFile as DiscountRuleSet).rules;
  const discountRulesVersion = (discountRulesFile as DiscountRuleSet).version;
  const today = ref(todayISO());
  const liveMonth = computed(() => today.value.slice(0, 7));
  const month = ref(liveMonth.value); // §6.1 month switcher moves this
  const loaded = ref(false);

  watch(liveMonth, (now, was) => {
    if (month.value === was) void setMonth(now);
  });

  function refreshToday(): void {
    today.value = todayISO();
  }

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
  const daysLeft = computed(() => daysLeftInMonth(today.value, month.value));
  /** daily_safe_spend(t) (§8.4) — only meaningful for the real current month, else null. */
  const safeSpendToday = computed(() =>
    month.value === liveMonth.value
      ? dailySafeSpend(accounts.value, transactions.value, budgets.value, month.value, daysLeft.value)
      : null,
  );

  // ── A1b month banner + A1/A1c spend graph (all geometry/levels from domain/calendar) ──

  /** Spend per ISO date inside the visible month (calendar heat strip). */
  const daySpends = computed(() => spendByDay(accounts.value, transactions.value, month.value));
  /** Σ cap spread over the month — the per-day "over cap" line; null when no caps (§8.7). */
  const dayCap = computed(() => dailyCapAverage(capTotal.value, month.value));
  /** Monday-start grid cells for the visible month, padded to whole weeks. */
  const monthCells = computed(() => monthGrid(month.value, today.value, daySpends.value, dayCap.value));

  /** Graph window ends today in the live month, else on the visible month's last day. */
  const weekEnd = computed(() =>
    month.value === liveMonth.value
      ? today.value
      : `${month.value}-${String(daysInMonth(month.value)).padStart(2, '0')}`,
  );
  /** Spend map covering both compared weeks (crosses month boundaries — hence the range query). */
  const twoWeekSpends = computed(() =>
    spendByDayInRange(accounts.value, transactions.value, addDays(weekEnd.value, -13), weekEnd.value),
  );
  /** The 7 days ending at weekEnd, oldest first, zero-filled. */
  const weekDays = computed(() => lastSevenDays(twoWeekSpends.value, weekEnd.value));
  /** The 7 days before those — the comparison window. */
  const previousWeekDays = computed(() => lastSevenDays(twoWeekSpends.value, addDays(weekEnd.value, -7)));
  const weekTotal = computed(() => sumSpend(weekDays.value));
  const previousWeekTotal = computed(() => sumSpend(previousWeekDays.value));
  /** mom_change over 7-day windows (§8.7) — previous week 0 → null, render "—". */
  const weekChange = computed(() => momChange(weekTotal.value, previousWeekTotal.value));
  const weekAverage = computed(() => averagePerDay(weekDays.value));

  // ── B5 Savings (§6.3 / §8.2) — all money math via domain/savings + domain/stats ──

  /** Active savings-flagged accounts (§8.1) with their balances, for the C1 rows. */
  const savingsAccountsView = computed(() =>
    accounts.value
      .filter((a) => !a.archived && isSavingsAccount(a))
      .map((a) => ({ account: a, balance: accountBalances.value.get(a.id) ?? 0 })),
  );
  /** total_saved (§8.1) — the saffron hero figure. */
  const totalSavedAmount = computed(() => totalSaved(accounts.value, transactions.value));
  /** savings_rate for the real current month (§8.2); null → "—" (invariant 5). Hero uses
   *  the live month regardless of the Budget-home month switcher — the savings screen has none. */
  const savingsRateInfo = computed(() =>
    savingsRate(
      sNet(accounts.value, transactions.value, liveMonth.value),
      income(accounts.value, transactions.value, liveMonth.value),
    ),
  );
  /** avg_contribution over the last 3 income months (§8.2) — feeds every goal projection. */
  const goalAvgContribution = computed(() =>
    avgContribution(accounts.value, transactions.value, liveMonth.value),
  );
  /** projected finish month ('YYYY-MM' | null) per goal (§8.2). */
  const goalProjections = computed(
    () =>
      new Map(
        goals.value.map((g) => [g.id, projectedGoalMonth(g, goalAvgContribution.value, today.value)]),
      ),
  );

  // ── B8 Investments (§6.3 rows / §7.7 / §8.3) — all return math via domain/investments ──

  /** Active investment accounts with §8.3 figures. balance = book/cost value (§8.1, feeds the
   *  total_saved hero); marketValue is the latest logged snapshot (§7.7), null until one exists.
   *  period_growth compares the latest snapshot's month against the calendar month before it,
   *  netting out that month's contributions so a deposit is never counted as gain (invariant 10). */
  const investmentsView = computed(() =>
    accounts.value
      .filter((a) => !a.archived && a.type === 'investment')
      .map((a) => {
        const snaps = investmentValues.value.filter((v) => v.account_id === a.id);
        const latest = snaps.reduce<InvestmentValue | null>(
          (best, v) => (best === null || v.month > best.month ? v : best),
          null,
        );
        const marketValue = latest?.value ?? null;
        const prev = latest ? snaps.find((v) => v.month === shiftMonthKey(latest.month, -1)) ?? null : null;
        return {
          account: a,
          balance: accountBalances.value.get(a.id) ?? 0,
          marketValue,
          valueMonth: latest?.month ?? null,
          returns: investmentReturns(a, transactions.value, marketValue),
          returnPct: returnPct(a, transactions.value, marketValue),
          periodGrowth: latest
            ? periodGrowth(a, transactions.value, marketValue, prev?.value ?? null, latest.month)
            : null,
        };
      }),
  );

  // ── B9 Credit card (§7.8 / §8.6) — all health math via domain/credit ──

  /** Active credit cards with their §8.6 figures + the three §7.8 check verdicts, for the
   *  visible month (income_share and paid_in_full are both month-scoped). */
  const creditCardsView = computed(() =>
    accounts.value
      .filter((a) => !a.archived && a.type === 'credit_card')
      .map((a) => cardHealth(a, accounts.value, transactions.value, month.value)),
  );
  /** Same rows keyed by account id — the Budget-home chip reads its card's verdict from here. */
  const cardHealthByAccount = computed(() => new Map(creditCardsView.value.map((c) => [c.account.id, c])));

  // ── B6 Recurring + dues (§7.5 / §8.5) — all money math via domain/dues ──

  /** Dues scheduled in the visible month (§8.5), paid flag from linked transactions. */
  const duesRows = computed(() => dueThisMonth(recurring.value, transactions.value, month.value));
  /** due_this_month total — the stable card figure (never touches E until a due is logged). */
  const duesTotal = computed(() => sumDueRows(duesRows.value));
  /** still_due (§8.5) — Σ of the unpaid rows. */
  const duesStillDue = computed(() => sumUnpaid(duesRows.value));
  /** due_next_month projection + one-line diff note (§8.5). */
  const duesNextMonth = computed(() => dueNextMonth(recurring.value, month.value));
  /** ISO due dates in the visible month — lights the MonthBanner saffron dots. */
  const dueDates = computed(() =>
    duesRows.value.map((r) => `${month.value}-${String(r.dueDay).padStart(2, '0')}`),
  );
  /** Auto-transfer badge per destination savings account (§6.3): {amount, dueDay}. */
  const autoTransferByAccount = computed(() => {
    const map = new Map<string, { amount: number; dueDay: number }>();
    for (const r of recurring.value) {
      if (r.kind !== 'transfer' || !r.auto_post) continue;
      const tmpl = parseRecurringTemplate(r.template);
      if (tmpl === null || tmpl.to_account_id === null) continue;
      map.set(tmpl.to_account_id, { amount: tmpl.amount, dueDay: Number(r.next_due.slice(8, 10)) });
    }
    return map;
  });

  // ── B7 Statistics (§6.4 / §8.7) — every series re-derived from raw txns via domain/statistics ──

  /** The rolling 6-month window ending at the live month (§6.4). */
  const statsMonths = computed(() => monthKeys(liveMonth.value, STATS_WINDOW));
  /** Cumulative total_saved per month — the Savings-tab hero line (§6.4). */
  const savingsTrend = computed(() =>
    savingsSeries(accounts.value, transactions.value, statsMonths.value, liveMonth.value),
  );
  /** Dashed comparison for the savings line (rolling avg, or year-ago once 13+ months — math-doc §5). */
  const savingsTrendComparison = computed(() =>
    savingsComparison(accounts.value, transactions.value, statsMonths.value, liveMonth.value),
  );
  /** E(t) per month — spend-by-month bars (§6.4). */
  const expenseTrend = computed(() =>
    expenseSeries(accounts.value, transactions.value, statsMonths.value, liveMonth.value),
  );
  /** free_cash_flow(t) per month — the Net tab (§6.4), may be negative. */
  const netTrend = computed(() =>
    netSeries(accounts.value, transactions.value, statsMonths.value, liveMonth.value),
  );
  /** Chart headline changes — completed months only (partial live month excluded, §8.7). */
  const savingsTrendChange = computed(() => completedChange(savingsTrend.value));
  const expenseTrendChange = computed(() => completedChange(expenseTrend.value));
  const netTrendChange = computed(() => completedChange(netTrend.value));

  /** savings_rate last month (§8.2) — the rate card's ▲/▼-vs-last-month baseline (§7.4). */
  const savingsRatePrev = computed(() => {
    const prev = monthKeys(liveMonth.value, 2)[0]!;
    return savingsRate(
      sNet(accounts.value, transactions.value, prev),
      income(accounts.value, transactions.value, prev),
    );
  });
  /** Rate change vs last month (§7.4) — null when either month has no rate (invariant 5). */
  const savingsRateDelta = computed(() => {
    const cur = savingsRateInfo.value;
    const prev = savingsRatePrev.value;
    if (cur === null || prev === null) return null;
    return momChange(cur.pct, prev.pct);
  });
  /** vs_budget(t) for the loaded month (§8.4) — the spend-vs-budget card; null with no caps. */
  const spendVsBudget = computed(() => vsBudget(accounts.value, transactions.value, budgets.value, month.value));

  async function load(): Promise<void> {
    const db = await getDb();
    accounts.value = await createAccountsRepo(db).list();
    categories.value = await createCategoriesRepo(db).list();
    budgets.value = await createBudgetsRepo(db).listByMonth(month.value);
    presets.value = await createSplitPresetsRepo(db).list();
    goals.value = await createGoalsRepo(db).list();
    recurring.value = await createRecurringRepo(db).list();
    investmentValues.value = await createInvestmentValuesRepo(db).list();
    savedItems.value = await createSavedItemsRepo(db).list();
    discountLogs.value = await createDiscountLogsRepo(db).list();
    await refreshTransactions(db);
    await runRecurring(); // §7.3 catch-up: post any auto-transfers/dues that came due while away
    loaded.value = true;
  }

  async function refreshTransactions(db: SqlDriver): Promise<void> {
    transactions.value = await createTransactionsRepo(db).list();
  }

  async function addTransaction(input: NewTransaction): Promise<Transaction> {
    const db = await getDb();
    const { recurring_id = null, saved_item_id = null, discount_rule_id = null, ...fields } = input;
    const txn: Transaction = {
      id: crypto.randomUUID(),
      discount_rule_id,
      recurring_id, // §7.5: set by the recurring engine + logDue, else null
      saved_item_id,
      ...fields,
    };
    await createTransactionsRepo(db).create(txn);
    await refreshTransactions(db);
    if (saved_item_id !== null) await recordSavedItemUse(saved_item_id, txn.amount, txn.date);
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

  /** §6.3 "+ add" on a goal: move real money into the goal's linked savings account and
   *  bump its saved_amount. The transfer counts as an S contribution (§7.2) when the source
   *  is a regular account; a source == linked account is skipped as a self-transfer (invariant 1
   *  no-op) but the progress still advances. */
  async function addToGoal(goalId: string, sourceAccountId: string, amountCentavos: number): Promise<void> {
    const goal = goals.value.find((g) => g.id === goalId);
    if (!goal || goal.account_id === null || amountCentavos <= 0) return;
    if (sourceAccountId !== goal.account_id) {
      await addTransaction({
        amount: amountCentavos,
        kind: 'transfer',
        account_id: sourceAccountId,
        to_account_id: goal.account_id,
        category_id: null,
        date: today.value,
        note: `Goal: ${goal.name}`,
      });
    }
    const db = await getDb();
    const repo = createGoalsRepo(db);
    await repo.update({ ...goal, saved_amount: goal.saved_amount + amountCentavos });
    goals.value = await repo.list();
  }

  /** §6.3 goal editor: create (id absent) or update (id present). */
  async function saveGoal(goal: Goal): Promise<void> {
    const db = await getDb();
    const repo = createGoalsRepo(db);
    if (await repo.getById(goal.id)) await repo.update(goal);
    else await repo.create(goal);
    goals.value = await repo.list();
  }

  async function deleteGoal(id: string): Promise<void> {
    const db = await getDb();
    const repo = createGoalsRepo(db);
    await repo.remove(id);
    goals.value = await repo.list();
  }

  /** §7.7 "log current value": record an investment account's market value for a month.
   *  One snapshot per account per month — a re-log for the same month overwrites (no dupes).
   *  Money entry only; the returns/growth math lives in domain/investments (invariantsView). */
  async function logInvestmentValue(
    accountId: string,
    valueCentavos: number,
    valueMonth = liveMonth.value,
  ): Promise<void> {
    const db = await getDb();
    const repo = createInvestmentValuesRepo(db);
    const existing = (await repo.list()).find(
      (v) => v.account_id === accountId && v.month === valueMonth,
    );
    if (existing) {
      await repo.update({ ...existing, value: valueCentavos });
    } else {
      await repo.create({ id: crypto.randomUUID(), account_id: accountId, month: valueMonth, value: valueCentavos });
    }
    investmentValues.value = await repo.list();
  }

  const discountSavedThisYear = computed(() =>
    discountSaved(discountLogs.value, transactions.value, today.value.slice(0, 4)),
  );

  async function logDiscountedFare(input: {
    ruleId: string;
    baseCentavos: number;
    discountedCentavos: number;
    accountId: string;
    categoryId: string | null;
    date?: string;
    note?: string | null;
  }): Promise<Transaction> {
    const txn = await addTransaction({
      amount: input.discountedCentavos,
      kind: 'expense',
      account_id: input.accountId,
      to_account_id: null,
      category_id: input.categoryId,
      date: input.date ?? today.value,
      note: input.note ?? null,
      discount_rule_id: input.ruleId,
    });
    const db = await getDb();
    const repo = createDiscountLogsRepo(db);
    await repo.create({
      id: crypto.randomUUID(),
      transaction_id: txn.id,
      base_amount: input.baseCentavos,
    });
    discountLogs.value = await repo.list();
    return txn;
  }

  async function saveSavedItem(item: SavedItem): Promise<void> {
    const db = await getDb();
    const repo = createSavedItemsRepo(db);
    if (await repo.getById(item.id)) {
      await repo.update(item);
    } else {
      await repo.create(item);
    }
    savedItems.value = await repo.list();
  }

  async function deleteSavedItem(id: string): Promise<void> {
    const db = await getDb();
    const repo = createSavedItemsRepo(db);
    await repo.remove(id);
    savedItems.value = await repo.list();
  }

  async function recordSavedItemUse(id: string, priceCentavos: number, atISO: string): Promise<void> {
    const db = await getDb();
    const repo = createSavedItemsRepo(db);
    const item = await repo.getById(id);
    if (item === null) return;
    await repo.update(touchSavedItem(item, priceCentavos, atISO));
    savedItems.value = await repo.list();
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

  /** Post a recurring's linked transaction (amount/fields from its template). The recurring_id
   *  link is what lets the dues card mark it paid (§7.5) without double-counting into E. */
  async function postRecurring(r: Recurring, tmpl: RecurringTemplate): Promise<void> {
    await addTransaction({
      amount: tmpl.amount,
      kind: tmpl.kind,
      account_id: tmpl.account_id,
      to_account_id: tmpl.to_account_id,
      category_id: tmpl.category_id,
      date: r.next_due,
      note: tmpl.note,
      recurring_id: r.id,
    });
  }

  /** §7.3 recurring engine — runs on app-open (from load). Posts every auto_post recurring
   *  whose next_due has arrived, catching up ALL missed cycles, rolling the schedule forward
   *  and counting loans down. auto_post=false rows are left as dues for the user to "Log it".
   *  `asOf` is injectable for tests; production uses the store's calendar day. */
  async function runRecurring(asOf = today.value): Promise<void> {
    const db = await getDb();
    const repo = createRecurringRepo(db);
    let posted = false;
    for (const r of await repo.list()) {
      if (!r.auto_post) continue;
      const tmpl = parseRecurringTemplate(r.template);
      if (tmpl === null) continue;
      let current = r;
      while (current.next_due <= asOf && !loanExhausted(current)) {
        await postRecurring(current, tmpl);
        posted = true;
        current = advanceRecurring(current, tmpl);
        await repo.update(current);
      }
    }
    recurring.value = await repo.list();
    if (posted) await refreshTransactions(db);
  }

  /** §7.5 "Log it": post an asks-first due's linked transaction now + advance its schedule.
   *  The amount comes from the template — this is the only thing that makes a due hit E. */
  async function logDue(recurringId: string): Promise<void> {
    const db = await getDb();
    const repo = createRecurringRepo(db);
    const r = await repo.getById(recurringId);
    if (r === null) return;
    const tmpl = parseRecurringTemplate(r.template);
    if (tmpl === null) return;
    await postRecurring(r, tmpl);
    await repo.update(advanceRecurring(r, tmpl));
    recurring.value = await repo.list();
  }

  return {
    accounts, categories, transactions, budgets, presets, goals, recurring, investmentValues, savedItems, discountLogs, discountRules, discountRulesVersion, month, today, liveMonth, recent, hubGauge, loaded,
    accountBalances, spendSlices, capTotal, remainingBudget,
    capsByCategory, spentByCappedCategory, usedByCategory, daysLeft, safeSpendToday,
    daySpends, dayCap, monthCells, weekDays, weekTotal, previousWeekTotal, weekChange, weekAverage,
    savingsAccountsView, totalSavedAmount, savingsRateInfo, goalAvgContribution, goalProjections,
    investmentsView, creditCardsView, cardHealthByAccount,
    duesRows, duesTotal, duesStillDue, duesNextMonth, dueDates, autoTransferByAccount,
    statsMonths, savingsTrend, savingsTrendComparison, expenseTrend, netTrend,
    savingsTrendChange, expenseTrendChange, netTrendChange, savingsRateDelta, spendVsBudget,
    discountSavedThisYear,
    load, refreshToday, addTransaction, updateTransaction, deleteTransaction, setMonth,
    setCap, applySplit, savePreset, deletePreset,
    addToGoal, saveGoal, deleteGoal, logInvestmentValue, runRecurring, logDue,
    saveSavedItem, deleteSavedItem, recordSavedItemUse, logDiscountedFare,
  };
});
