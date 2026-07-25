import { describe, it, expect } from 'vitest';
import type { Account, Transaction } from '../db/repositories/types';
import {
  investmentReturns,
  monthContributions,
  periodGrowth,
  returnPct,
  totalContributions,
  totalWithdrawals,
} from './investments';

function acc(id: string, type: Account['type'], starting = 0): Account {
  return {
    id, name: id, type, starting_balance: starting, essence_color: '#7A3FD0',
    archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
  };
}

function txn(p: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'kind' | 'account_id' | 'date'>): Transaction {
  return {
    to_account_id: null, category_id: null, note: null,
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
    ...p,
  };
}

const mp2 = acc('mp2', 'investment', 1200000); // opening cost basis ₱12,000
// July: a ₱2,000 contribution (cash → mp2) and a ₱500 withdrawal (mp2 → cash).
const july = [
  txn({ id: 'c1', amount: 200000, kind: 'transfer', account_id: 'cash', to_account_id: 'mp2', date: '2026-07-06' }),
  txn({ id: 'w1', amount: 50000, kind: 'transfer', account_id: 'mp2', to_account_id: 'cash', date: '2026-07-20' }),
];

describe('contribution / withdrawal basis (§8.3)', () => {
  it('counts the opening balance + transfers in as contributions', () => {
    // 1,200,000 opening + 200,000 in = 1,400,000
    expect(totalContributions(mp2, july)).toBe(1400000);
  });

  it('sums only transfers out of the account as withdrawals', () => {
    expect(totalWithdrawals(mp2, july)).toBe(50000);
  });

  it('an account with only an opening balance has that as its whole basis', () => {
    expect(totalContributions(mp2, [])).toBe(1200000);
    expect(totalWithdrawals(mp2, [])).toBe(0);
  });
});

describe('returns + return_pct (§8.3)', () => {
  it('returns = market_value − Σ contributions + Σ withdrawals', () => {
    // 1,520,000 − 1,400,000 + 50,000 = 170,000
    expect(investmentReturns(mp2, july, 1520000)).toBe(170000);
  });

  it('return_pct = returns / Σ contributions × 100', () => {
    expect(returnPct(mp2, july, 1520000)!).toBeCloseTo((170000 / 1400000) * 100);
  });

  it('renders "—" (null) before any value is logged', () => {
    expect(investmentReturns(mp2, july, null)).toBeNull();
    expect(returnPct(mp2, july, null)).toBeNull();
  });

  it('return_pct guards a zero cost basis (§8.7 denominator 0 → null)', () => {
    const empty = acc('empty', 'investment', 0);
    expect(returnPct(empty, [], 100000)).toBeNull();
    // …while returns is still well-defined (pure market value gain over nothing invested).
    expect(investmentReturns(empty, [], 100000)).toBe(100000);
  });
});

describe('monthContributions — net capital moved in month t', () => {
  it('nets deposits against withdrawals within the month', () => {
    // +200,000 in − 50,000 out = 150,000
    expect(monthContributions(mp2, july, '2026-07')).toBe(150000);
  });

  it('ignores other months', () => {
    expect(monthContributions(mp2, july, '2026-06')).toBe(0);
  });
});

describe('period_growth — deposits are NOT gains (invariant 10)', () => {
  it('subtracts the period contributions so a deposit never inflates growth', () => {
    // value went 1,000,000 → 1,300,000, but 150,000 of that was fresh capital (net).
    // Real gain = 300,000 − 150,000 = 150,000, NOT the raw 300,000 delta.
    expect(periodGrowth(mp2, july, 1300000, 1000000, '2026-07')).toBe(150000);
  });

  it('a pure deposit month with no real gain reads as zero growth', () => {
    // Value rose by exactly the net deposit → the account earned nothing.
    expect(periodGrowth(mp2, july, 1150000, 1000000, '2026-07')).toBe(0);
  });

  it('returns null when either snapshot is missing (can’t compute a real gain)', () => {
    expect(periodGrowth(mp2, july, 1300000, null, '2026-07')).toBeNull();
    expect(periodGrowth(mp2, july, null, 1000000, '2026-07')).toBeNull();
  });
});
