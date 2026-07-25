// Domain — §8.3 investment returns. PURE functions only, no imports from ui/db.
// Formulas are copied verbatim from README §8.3; §7.7 is the rule that DEPOSITS MUST NEVER
// LOOK LIKE GAINS (invariant 10) — that is what period_growth subtracts out.
//
// COST BASIS (Σ contributions): README §8.3 says "Σ contributions" without saying whether an
// account's opening balance counts. It must — an investment funded only by its
// starting_balance (like the seeded MP2) has no transfer rows, so if contributions were
// transfers-only the basis would be 0 and returns would read as the ENTIRE market value
// (garbage) and return_pct would divide by zero. So the opening balance IS the first
// contribution: Σ contributions = starting_balance + Σ transfers in. This is a definition,
// not a re-derivation of the formula.
import type { Account, Transaction } from '../db/repositories/types';

/** Month key 'YYYY-MM' from an ISO 'YYYY-MM-DD' date. */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

/**
 * Σ contributions into an investment account = its opening balance + every transfer in.
 * The cost basis for §8.3 returns/return_pct (see the COST BASIS note above).
 */
export function totalContributions(account: Account, transactions: Transaction[]): number {
  let sum = account.starting_balance;
  for (const t of transactions) {
    if (t.kind === 'transfer' && t.to_account_id === account.id) sum += t.amount;
  }
  return sum;
}

/** Σ withdrawals = every transfer whose source is this account. */
export function totalWithdrawals(account: Account, transactions: Transaction[]): number {
  let sum = 0;
  for (const t of transactions) {
    if (t.kind === 'transfer' && t.account_id === account.id) sum += t.amount;
  }
  return sum;
}

/**
 * returns = market_value − Σ contributions + Σ withdrawals.   §8.3
 * market_value is the latest logged snapshot; null (no value logged yet) → null so the UI
 * renders "—" instead of a fake gain.
 */
export function investmentReturns(
  account: Account,
  transactions: Transaction[],
  marketValue: number | null,
): number | null {
  if (marketValue === null) return null;
  return marketValue - totalContributions(account, transactions) + totalWithdrawals(account, transactions);
}

/**
 * return_pct = returns / Σ contributions × 100.   §8.3
 * Σ contributions 0 → null (§8.7: denominator 0 → "—", never NaN/Infinity). No value → null.
 */
export function returnPct(
  account: Account,
  transactions: Transaction[],
  marketValue: number | null,
): number | null {
  if (marketValue === null) return null;
  const basis = totalContributions(account, transactions);
  if (basis === 0) return null;
  const r = marketValue - basis + totalWithdrawals(account, transactions);
  return (r / basis) * 100;
}

/**
 * Net capital moved into the account during month t (transfers in − transfers out).
 * period_growth subtracts THIS so a deposit — or a withdrawal — in the period is never
 * mistaken for a gain or a loss (invariant 10).
 */
export function monthContributions(account: Account, transactions: Transaction[], month: string): number {
  let net = 0;
  for (const t of transactions) {
    if (t.kind !== 'transfer' || monthOf(t.date) !== month) continue;
    if (t.to_account_id === account.id) net += t.amount;
    if (t.account_id === account.id) net -= t.amount;
  }
  return net;
}

/**
 * period_growth(t) = value(t) − value(t−1) − contributions(t).   §8.3
 * The REAL gain for the period — the new money added in month t is netted out (invariant 10).
 * Either snapshot missing → null (can't compute a real gain without both endpoints).
 */
export function periodGrowth(
  account: Account,
  transactions: Transaction[],
  valueThisMonth: number | null,
  valuePrevMonth: number | null,
  month: string,
): number | null {
  if (valueThisMonth === null || valuePrevMonth === null) return null;
  return valueThisMonth - valuePrevMonth - monthContributions(account, transactions, month);
}
