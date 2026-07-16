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
  const monthBudgets = budgets.filter((b) => b.month === month);
  const totalCap = monthBudgets.reduce((sum, b) => sum + b.cap_amount, 0);
  if (totalCap === 0) return null;
  const totalSpent = monthBudgets.reduce(
    (sum, b) => sum + categorySpent(accounts, transactions, b.category_id, month),
    0,
  );
  return totalSpent / totalCap;
}
