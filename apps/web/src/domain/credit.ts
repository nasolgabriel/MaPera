// Domain — §8.6 credit-card health + points. PURE functions only, no imports from ui/db.
// Formulas are copied verbatim from README §8.6; §7.8 is the three-check rule (utilization
// ≤ 30% · card spend ≤ 30% of income · statement paid in full) and §7.2 is why a bill payment
// is a TRANSFER, never an expense — that is invariant 8 (a payment changes neither E nor
// cash_flow), and it falls out of the taxonomy rather than needing a special case here.
//
// DEFINITIONS the README leaves open. These are definitions, NOT re-derivations of §8.6:
//  · owed — §8.6 divides by credit_limit but never says where `owed` comes from. A card is a
//    "regular" account (§8.1) whose balance goes NEGATIVE as it is used (expense → −account,
//    bill payment → +to_account), so owed = −balance(card). An overpaid card has owed < 0;
//    the sign is kept rather than clamped so the UI can say "in credit" instead of lying.
//  · statement_balance(t) — the amount owed as of the card's statement_day in month t
//    (wireframe D3: "statement snapshots on the 15th"). No statement_day → the month's last
//    day. paid_in_full(t) compares month t's payments against THIS figure for t−1.
//  · payments(t) — Σ transfers INTO the card during month t. An expense can never be a
//    payment, which is exactly what keeps invariant 8 true.
//  · points_rate — pesos-per-point stored in CENTAVOS, like every other amount (§3);
//    the wireframe's "1 pt / ₱25" is points_rate = 2500.
//  · interest — the schema carries no interest rate, so the "rewards are wiped out" warning
//    (§7.8) uses ONE named constant taken from wireframe D3 (3.5%/month) to size the charge.
//    Deliberately NOT ported from the wireframe: its "≈ 7 months of points" line — converting
//    points to pesos needs a redemption value that no field carries, and inventing one would
//    put a fabricated number on screen.
import type { Account, Transaction } from '../db/repositories/types';
import { daysInMonth } from './calendar';
import { accountBalance, income } from './stats';

/** §7.8 healthy thresholds. Both are "≤ this % is fine". */
export const UTILIZATION_LIMIT = 30;
export const INCOME_SHARE_LIMIT = 30;

/** Monthly interest used to size the §7.8 "interest wipes out rewards" warning (wireframe D3). */
export const MONTHLY_INTEREST_RATE = 0.035;

/** Per-check verdict: green, red, or "not enough data to judge" (§8.7 — never fake a number). */
export type CheckState = 'ok' | 'bad' | 'unknown';

export interface CardHealth {
  account: Account;
  /** −balance(card); negative when the card is overpaid (see DEFINITIONS). */
  owed: number;
  creditLimit: number | null;
  /** utilization = owed / credit_limit × 100; no limit set → null. */
  utilization: number | null;
  /** card_spend(t) = Σ expenses charged to the card in month t. */
  cardSpend: number;
  /** income_share(t) = card_spend(t) / I(t) × 100; I(t) = 0 → null (§8.7). */
  incomeShare: number | null;
  /** payments(t) = Σ transfers into the card in month t. */
  payments: number;
  /** statement_balance(t−1) — what month t's payments had to clear. */
  previousStatement: number;
  /** 'YYYY-MM' of that statement, for the UI label ("June statement paid in full"). */
  previousMonth: string;
  paidInFull: boolean;
  /** points(t) = floor(card_spend(t) / points_rate); no rate → null. */
  points: number | null;
  pointsRate: number | null;
  /** Estimated interest charged when the statement was NOT cleared; null when it was. */
  estimatedInterest: number | null;
  checks: { utilization: CheckState; incomeShare: CheckState; paidInFull: CheckState };
  /** §7.8: all three green → "card healthy" badge. An unknown check is not a green one. */
  healthy: boolean;
}

/** Month key 'YYYY-MM' from an ISO 'YYYY-MM-DD' date. */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** §7.8: any RED check tints the card + its account row. An unknown check is not a red one —
 *  a card with no limit set is unmeasured, not unhealthy. */
export function hasFailingCheck(health: CardHealth): boolean {
  return Object.values(health.checks).some((state) => state === 'bad');
}

/** The calendar month before `month` ('YYYY-MM'), year-boundary safe. */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y!, m! - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** owed = −balance(card) (§8.1 balance, sign flipped — see DEFINITIONS). */
export function amountOwed(account: Account, transactions: Transaction[]): number {
  return -accountBalance(account, transactions);
}

/**
 * utilization = owed / credit_limit × 100.   §8.6   (healthy ≤ 30)
 * No limit / limit 0 → null (§8.7: denominator 0 → "—", never NaN/Infinity).
 */
export function utilization(owed: number, creditLimit: number | null): number | null {
  if (creditLimit === null || creditLimit === 0) return null;
  return (owed / creditLimit) * 100;
}

/** card_spend(t) = Σ expenses charged to this card in month t. Transfers are never spend. */
export function cardSpend(account: Account, transactions: Transaction[], month: string): number {
  return transactions
    .filter((t) => t.kind === 'expense' && t.account_id === account.id && monthOf(t.date) === month)
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * income_share(t) = card_spend(t) / I(t) × 100.   §8.6   (warn > 30)
 * I(t) = 0 → null (§8.7 zero-guard, same rule as savings_rate — invariant 5).
 */
export function incomeShare(spend: number, monthIncome: number): number | null {
  if (monthIncome === 0) return null;
  return (spend / monthIncome) * 100;
}

/** The card's statement day in `month`, clamped to the month's length ('YYYY-MM-DD'). */
function statementDate(account: Account, month: string): string {
  const last = daysInMonth(month);
  const day = account.statement_day === null ? last : Math.min(account.statement_day, last);
  return `${month}-${String(day).padStart(2, '0')}`;
}

/**
 * statement_balance(t) — owed on the card as of month t's statement day (see DEFINITIONS).
 * Everything dated on or before that day counts; later charges land on the NEXT statement.
 */
export function statementBalance(account: Account, transactions: Transaction[], month: string): number {
  const cutoff = statementDate(account, month);
  return amountOwed(account, transactions.filter((t) => t.date <= cutoff));
}

/** payments(t) = Σ transfers into the card in month t (§7.2 — a payment is never an expense). */
export function cardPayments(account: Account, transactions: Transaction[], month: string): number {
  return transactions
    .filter((t) => t.kind === 'transfer' && t.to_account_id === account.id && monthOf(t.date) === month)
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * paid_in_full(t) = payments(t) ≥ statement_balance(t−1).   §8.6
 * A statement of 0 or less (nothing was owed) is vacuously paid.
 */
export function paidInFull(account: Account, transactions: Transaction[], month: string): boolean {
  const owedLastStatement = statementBalance(account, transactions, previousMonth(month));
  if (owedLastStatement <= 0) return true;
  return cardPayments(account, transactions, month) >= owedLastStatement;
}

/**
 * points(t) = floor(card_spend(t) / peso_per_point).   §8.6
 * No rate / rate ≤ 0 → null (the card earns no points, so don't show a 0 that looks earned).
 */
export function points(spend: number, pointsRate: number | null): number | null {
  if (pointsRate === null || pointsRate <= 0) return null;
  return Math.floor(spend / pointsRate);
}

/**
 * Interest the unpaid balance is expected to attract this month (§7.8 rewards warning).
 * Nothing owed → 0; the rate is MONTHLY_INTEREST_RATE (see DEFINITIONS).
 */
export function estimatedInterest(owed: number, rate = MONTHLY_INTEREST_RATE): number {
  if (owed <= 0) return 0;
  return Math.round(owed * rate);
}

/**
 * The whole §7.8 card panel for one card in month t: every §8.6 figure plus the three
 * check verdicts and the overall healthy flag. Callers (store → UI) do no math (§4).
 */
export function cardHealth(
  account: Account,
  accounts: Account[],
  transactions: Transaction[],
  month: string,
): CardHealth {
  const owed = amountOwed(account, transactions);
  const util = utilization(owed, account.credit_limit);
  const spend = cardSpend(account, transactions, month);
  const share = incomeShare(spend, income(accounts, transactions, month));
  const prev = previousMonth(month);
  const previousStatement = statementBalance(account, transactions, prev);
  const cleared = paidInFull(account, transactions, month);

  const checks = {
    utilization: util === null ? 'unknown' : util <= UTILIZATION_LIMIT ? 'ok' : 'bad',
    incomeShare: share === null ? 'unknown' : share <= INCOME_SHARE_LIMIT ? 'ok' : 'bad',
    paidInFull: cleared ? 'ok' : 'bad',
  } satisfies CardHealth['checks'];

  return {
    account,
    owed,
    creditLimit: account.credit_limit,
    utilization: util,
    cardSpend: spend,
    incomeShare: share,
    payments: cardPayments(account, transactions, month),
    previousStatement,
    previousMonth: prev,
    paidInFull: cleared,
    points: points(spend, account.points_rate),
    pointsRate: account.points_rate,
    estimatedInterest: cleared ? null : estimatedInterest(owed),
    checks,
    healthy: checks.utilization === 'ok' && checks.incomeShare === 'ok' && checks.paidInFull === 'ok',
  };
}
