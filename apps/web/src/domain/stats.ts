// Domain core — §8.1 balances & cash flow. PURE functions only.
// Formulas are copied verbatim from README §8.1; the transaction taxonomy is §7.2.
// No imports from ui/ or db/ side effects — only the shared row types.
import type { Account, Transaction } from '../db/repositories/types';

// §6.3 / §8.1 / Statistics Math §46: savings-flagged accounts are these three types.
// {cash, credit_card} are "regular". Contributions/withdrawals (§7.2) hinge on this split.
export const SAVINGS_ACCOUNT_TYPES: ReadonlyArray<Account['type']> = ['bank', 'ewallet', 'investment'];

export function isSavingsAccount(account: Account): boolean {
  return SAVINGS_ACCOUNT_TYPES.includes(account.type);
}

/** Month key 'YYYY-MM' from an ISO 'YYYY-MM-DD' date. */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

/**
 * balance(a) = starting_balance(a) + Σ inflows(a) − Σ outflows(a).   §8.1
 * Inflows/outflows per §7.2:
 *   income  → +account_id
 *   expense → −account_id
 *   transfer→ −account_id (source), +to_account_id (destination)
 */
export function accountBalance(account: Account, transactions: Transaction[]): number {
  let balance = account.starting_balance;
  for (const t of transactions) {
    if (t.kind === 'income' && t.account_id === account.id) {
      balance += t.amount;
    } else if (t.kind === 'expense' && t.account_id === account.id) {
      balance -= t.amount;
    } else if (t.kind === 'transfer') {
      if (t.account_id === account.id) balance -= t.amount;
      if (t.to_account_id === account.id) balance += t.amount;
    }
  }
  return balance;
}

/** total_balance = Σ balance(a) over active accounts. §8.1 (archived excluded — §8 notation). */
export function totalBalance(accounts: Account[], transactions: Transaction[]): number {
  return accounts
    .filter((a) => !a.archived)
    .reduce((sum, a) => sum + accountBalance(a, transactions), 0);
}

/** total_saved = Σ balance(a) over active savings-flagged accounts. §8.1 */
export function totalSaved(accounts: Account[], transactions: Transaction[]): number {
  return accounts
    .filter((a) => !a.archived && isSavingsAccount(a))
    .reduce((sum, a) => sum + accountBalance(a, transactions), 0);
}

/** IDs of non-archived accounts — the set every §8.1 sum is scoped to. */
function activeAccountIds(accounts: Account[]): Set<string> {
  return new Set(accounts.filter((a) => !a.archived).map((a) => a.id));
}

/** I(t) = Σ income in month t on active accounts. */
export function income(accounts: Account[], transactions: Transaction[], month: string): number {
  const active = activeAccountIds(accounts);
  return transactions
    .filter((t) => t.kind === 'income' && monthOf(t.date) === month && active.has(t.account_id))
    .reduce((sum, t) => sum + t.amount, 0);
}

/** E(t) = Σ expense in month t on active accounts. */
export function expenses(accounts: Account[], transactions: Transaction[], month: string): number {
  const active = activeAccountIds(accounts);
  return transactions
    .filter((t) => t.kind === 'expense' && monthOf(t.date) === month && active.has(t.account_id))
    .reduce((sum, t) => sum + t.amount, 0);
}

/** cash_flow(t) = I(t) − E(t). §8.1 */
export function cashFlow(accounts: Account[], transactions: Transaction[], month: string): number {
  return income(accounts, transactions, month) - expenses(accounts, transactions, month);
}

/**
 * S_net(t) = contributions(t) − withdrawals(t). §8.1 / §7.2
 *   regular → savings  = contribution (+)
 *   savings → regular  = withdrawal   (−)
 *   regular ↔ regular / savings ↔ savings = counts in nothing
 * Only active accounts on both legs (archived excluded — §8 notation).
 */
export function sNet(accounts: Account[], transactions: Transaction[], month: string): number {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  let net = 0;
  for (const t of transactions) {
    if (t.kind !== 'transfer' || monthOf(t.date) !== month) continue;
    const from = byId.get(t.account_id);
    const to = t.to_account_id ? byId.get(t.to_account_id) : undefined;
    if (!from || !to || from.archived || to.archived) continue;
    const fromSavings = isSavingsAccount(from);
    const toSavings = isSavingsAccount(to);
    if (!fromSavings && toSavings) net += t.amount; // contribution
    else if (fromSavings && !toSavings) net -= t.amount; // withdrawal
  }
  return net;
}

/**
 * mom_change(x,t) = (x(t) − x(t−1)) / |x(t−1)| × 100. §8.7
 * Denominator 0 → null so callers render "—", never NaN/Infinity. Named for months but
 * period-agnostic — the budget home compares 7-day windows with it.
 */
export function momChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** free_cash_flow(t) = I(t) − E(t) − S_net(t). §8.1 */
export function freeCashFlow(accounts: Account[], transactions: Transaction[], month: string): number {
  return cashFlow(accounts, transactions, month) - sNet(accounts, transactions, month);
}
