// Domain — §8.2 savings + goal projection. PURE functions only, no imports from ui/db.
// Formulas copied verbatim from README §8.2; savings-rate levels are §7.4.
import { income, sNet } from './stats';
import type { Account, Goal, Transaction } from '../db/repositories/types';

// §7.4 savings-rate levels, compared only to the user's own history.
export type SavingsLevel = 'Bronze' | 'Silver' | 'Gold';

/** Bronze <5 · Silver 5–15 · Gold ≥15 (% of income saved this month). §7.4 */
export function savingsLevel(pct: number): SavingsLevel {
  if (pct >= 15) return 'Gold';
  if (pct >= 5) return 'Silver';
  return 'Bronze';
}

export interface SavingsRate {
  /** Display %, capped at 100 (invariant 9). */
  pct: number;
  /** True when the raw rate exceeded 100 and was clamped (invariant 9 flag). */
  capped: boolean;
  /** Tier from the raw (uncapped) rate. */
  level: SavingsLevel;
}

/**
 * savings_rate(t) = S_net(t) / I(t) × 100.   §8.2
 * I(t)=0 → null so callers render "—" (invariant 5). Display capped at 100 with a
 * flag (invariant 9); negative rates (net withdrawal) pass through uncapped.
 */
export function savingsRate(sNetT: number, incomeT: number): SavingsRate | null {
  if (incomeT === 0) return null;
  const raw = (sNetT / incomeT) * 100;
  const capped = raw > 100;
  return { pct: capped ? 100 : raw, capped, level: savingsLevel(raw) };
}

/** 'YYYY-MM' key `delta` months from `month` (delta may be negative). */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * avg_contribution = mean(S_net over last 3 months, skipping I=0 months).   §8.2
 * "Last 3 months" = currentMonth and the two before it. A month with zero income is
 * skipped entirely (you can't have saved a share of nothing). No qualifying month → null.
 */
export function avgContribution(
  accounts: Account[],
  transactions: Transaction[],
  currentMonth: string,
): number | null {
  const contributions: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const month = shiftMonth(currentMonth, -i);
    if (income(accounts, transactions, month) === 0) continue; // skip I=0 month
    contributions.push(sNet(accounts, transactions, month));
  }
  if (contributions.length === 0) return null;
  return contributions.reduce((sum, c) => sum + c, 0) / contributions.length;
}

/** Remaining to reach a goal's target, never negative. */
export function goalToGo(goal: Goal): number {
  return Math.max(0, goal.target_amount - goal.saved_amount);
}

/** Progress fraction saved/target, clamped 0..1; target 0 → 0 (no divide-by-zero). */
export function goalFraction(goal: Goal): number {
  if (goal.target_amount <= 0) return 0;
  return Math.min(1, Math.max(0, goal.saved_amount / goal.target_amount));
}

/**
 * projected_goal = today + ceil(remaining / avg_contribution_per_month).   §8.2
 * Returns the 'YYYY-MM' the goal is projected to complete, or null when it can't be
 * projected: already reached (remaining ≤ 0) or no positive average contribution.
 */
export function projectedGoalMonth(
  goal: Goal,
  avgPerMonth: number | null,
  todayISO: string,
): string | null {
  const remaining = goalToGo(goal);
  if (remaining <= 0) return null; // already reached
  if (avgPerMonth === null || avgPerMonth <= 0) return null; // can't project
  const months = Math.ceil(remaining / avgPerMonth);
  return shiftMonth(todayISO.slice(0, 7), months);
}
