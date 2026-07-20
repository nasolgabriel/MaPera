// Domain — §8.4 budgets. PURE functions only, no imports from ui/db.
import type { Account, Budget, Transaction } from '../db/repositories/types';

/** Month key 'YYYY-MM' from an ISO 'YYYY-MM-DD' date. */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** spent(c,t) = Σ expenses in category c during t, active accounts only. §8.4 */
export function categorySpent(
  accounts: Account[],
  transactions: Transaction[],
  categoryId: string,
  month: string,
): number {
  const active = new Set(accounts.filter((a) => !a.archived).map((a) => a.id));
  return transactions
    .filter(
      (t) =>
        t.kind === 'expense' &&
        t.category_id === categoryId &&
        monthOf(t.date) === month &&
        active.has(t.account_id),
    )
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * budget consumed = Σ spent(c,t) / Σ cap(c,t) over month-t budgets (§6 hub ring).
 * Raw fraction, may exceed 1 — clamp at display. Σ cap = 0 → null (§8.7 guard).
 */
export function budgetConsumed(
  accounts: Account[],
  transactions: Transaction[],
  budgets: Budget[],
  month: string,
): number | null {
  const cap = totalCap(budgets, month);
  if (cap === 0) return null;
  return budgetedSpent(accounts, transactions, budgets, month) / cap;
}

/** Σ cap(c,t) over month-t budgets. */
export function totalCap(budgets: Budget[], month: string): number {
  return budgets.filter((b) => b.month === month).reduce((sum, b) => sum + b.cap_amount, 0);
}

/** Σ spent(c,t) over the categories that have a month-t cap — the "Σ spent" of §8.4. */
function budgetedSpent(
  accounts: Account[],
  transactions: Transaction[],
  budgets: Budget[],
  month: string,
): number {
  return budgets
    .filter((b) => b.month === month)
    .reduce((sum, b) => sum + categorySpent(accounts, transactions, b.category_id, month), 0);
}

/** budget_used(c,t) = spent(c,t) / cap(c,t) × 100. §8.4 — cap 0/absent → null (§8.7 guard). */
export function budgetUsed(
  accounts: Account[],
  transactions: Transaction[],
  budgets: Budget[],
  categoryId: string,
  month: string,
): number | null {
  const cap = budgets
    .filter((b) => b.month === month && b.category_id === categoryId)
    .reduce((sum, b) => sum + b.cap_amount, 0);
  if (cap === 0) return null;
  return (categorySpent(accounts, transactions, categoryId, month) / cap) * 100;
}

/** budget_remaining(t) = Σ cap − Σ spent (donut center). §8.4 — negative when over. */
export function budgetRemaining(
  accounts: Account[],
  transactions: Transaction[],
  budgets: Budget[],
  month: string,
): number {
  return totalCap(budgets, month) - budgetedSpent(accounts, transactions, budgets, month);
}

/** daily_safe_spend(t) = budget_remaining(t) / days_left(t). §8.4 — days_left ≤ 0 → null (§8.7). */
export function dailySafeSpend(
  accounts: Account[],
  transactions: Transaction[],
  budgets: Budget[],
  month: string,
  daysLeft: number,
): number | null {
  if (daysLeft <= 0) return null;
  return budgetRemaining(accounts, transactions, budgets, month) / daysLeft;
}

/** vs_budget(t) = (Σ spent − Σ cap) / Σ cap × 100. §8.4 — Σ cap 0 → null (§8.7 guard). */
export function vsBudget(
  accounts: Account[],
  transactions: Transaction[],
  budgets: Budget[],
  month: string,
): number | null {
  const cap = totalCap(budgets, month);
  if (cap === 0) return null;
  return ((budgetedSpent(accounts, transactions, budgets, month) - cap) / cap) * 100;
}

export interface CategorySpend {
  category_id: string | null; // null = uncategorized
  amount: number;
}

/**
 * Month-t expense spend grouped by category (donut slices), sorted desc.
 * Invariant 3: Σ amounts (incl. the null/uncategorized bucket) ≡ E(t).
 */
export function spentByCategory(
  accounts: Account[],
  transactions: Transaction[],
  month: string,
): CategorySpend[] {
  const active = new Set(accounts.filter((a) => !a.archived).map((a) => a.id));
  const sums = new Map<string | null, number>();
  for (const t of transactions) {
    if (t.kind !== 'expense' || monthOf(t.date) !== month || !active.has(t.account_id)) continue;
    sums.set(t.category_id, (sums.get(t.category_id) ?? 0) + t.amount);
  }
  return [...sums.entries()]
    .map(([category_id, amount]) => ({ category_id, amount }))
    .sort((a, b) => b.amount - a.amount);
}
