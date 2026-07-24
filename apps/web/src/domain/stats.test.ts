import { describe, it, expect } from 'vitest';
import type { Account, Transaction } from '../db/repositories/types';
import {
  accountBalance,
  totalBalance,
  totalSaved,
  income,
  expenses,
  cashFlow,
  sNet,
  freeCashFlow,
  isSavingsAccount,
  momChange,
} from './stats';

function acc(id: string, type: Account['type'], starting = 0, archived = false): Account {
  return {
    id, name: id, type, starting_balance: starting, essence_color: '#1E3A6E',
    archived, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
  };
}

function txn(p: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'kind' | 'account_id' | 'date'>): Transaction {
  return {
    to_account_id: null, category_id: null, note: null,
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
    ...p,
  };
}

// The §8.1 worked example (mirrors db/seed.ts): I=₱20,000 / E=₱13,500 → cash_flow +₱6,500.
const seedBank = acc('bank', 'bank');
const seedCash = acc('cash', 'cash');
const seedAccounts = [seedBank, seedCash];
const seedTxns = [
  txn({ id: 'i1', amount: 2000000, kind: 'income', account_id: 'bank', date: '2026-07-01' }),
  txn({ id: 'e1', amount: 900000, kind: 'expense', account_id: 'bank', date: '2026-07-05' }),
  txn({ id: 'e2', amount: 450000, kind: 'expense', account_id: 'cash', date: '2026-07-06' }),
];

describe('savings-flagged classification (§6.3 / §8.1)', () => {
  it('flags bank, ewallet, investment; not cash or credit_card', () => {
    expect(isSavingsAccount(acc('a', 'bank'))).toBe(true);
    expect(isSavingsAccount(acc('a', 'ewallet'))).toBe(true);
    expect(isSavingsAccount(acc('a', 'investment'))).toBe(true);
    expect(isSavingsAccount(acc('a', 'cash'))).toBe(false);
    expect(isSavingsAccount(acc('a', 'credit_card'))).toBe(false);
  });
});

describe('balances & cash flow (§8.1)', () => {
  it('accountBalance = starting + inflows − outflows', () => {
    expect(accountBalance(seedBank, seedTxns)).toBe(2000000 - 900000); // bank
    expect(accountBalance(seedCash, seedTxns)).toBe(-450000); // cash
  });

  it('cash_flow of the worked example is +₱6,500.00 (650000 centavos)', () => {
    expect(income(seedAccounts, seedTxns, '2026-07')).toBe(2000000);
    expect(expenses(seedAccounts, seedTxns, '2026-07')).toBe(1350000);
    expect(cashFlow(seedAccounts, seedTxns, '2026-07')).toBe(650000);
  });

  it('total_saved counts only savings-flagged active accounts', () => {
    const accounts = [acc('bank', 'bank', 100000), acc('cash', 'cash', 50000), acc('inv', 'investment', 20000)];
    expect(totalBalance(accounts, [])).toBe(170000);
    expect(totalSaved(accounts, [])).toBe(120000); // bank + investment, not cash
  });

  it('archived accounts are excluded from all sums (§8 notation)', () => {
    const accounts = [acc('bank', 'bank', 100000), acc('old', 'bank', 999999, true)];
    expect(totalBalance(accounts, [])).toBe(100000);
    expect(totalSaved(accounts, [])).toBe(100000);
  });
});

describe('S_net & free_cash_flow (§8.1 / §7.2)', () => {
  const accounts = [acc('cash', 'cash', 1000000), acc('bank', 'bank'), acc('inv', 'investment')];

  it('regular→savings is a contribution (+); savings→regular a withdrawal (−)', () => {
    const t = [
      txn({ id: 't1', amount: 300000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-07-02' }),
      txn({ id: 't2', amount: 100000, kind: 'transfer', account_id: 'bank', to_account_id: 'cash', date: '2026-07-03' }),
    ];
    expect(sNet(accounts, t, '2026-07')).toBe(200000); // 300000 in − 100000 out
  });

  it('regular↔regular and savings↔savings transfers count in nothing', () => {
    const regs = [acc('cash', 'cash', 500000), acc('cash2', 'cash')];
    const savs = [acc('bank', 'bank', 500000), acc('inv', 'investment')];
    const regMove = [txn({ id: 't', amount: 200000, kind: 'transfer', account_id: 'cash', to_account_id: 'cash2', date: '2026-07-01' })];
    const savMove = [txn({ id: 't', amount: 200000, kind: 'transfer', account_id: 'bank', to_account_id: 'inv', date: '2026-07-01' })];
    expect(sNet(regs, regMove, '2026-07')).toBe(0);
    expect(sNet(savs, savMove, '2026-07')).toBe(0);
  });

  it('free_cash_flow = I − E − S_net', () => {
    const t = [
      txn({ id: 'i', amount: 2000000, kind: 'income', account_id: 'cash', date: '2026-07-01' }),
      txn({ id: 'e', amount: 500000, kind: 'expense', account_id: 'cash', date: '2026-07-05' }),
      txn({ id: 's', amount: 400000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-07-06' }),
    ];
    expect(cashFlow(accounts, t, '2026-07')).toBe(1500000);
    expect(sNet(accounts, t, '2026-07')).toBe(400000);
    expect(freeCashFlow(accounts, t, '2026-07')).toBe(1100000);
  });
});

// ── §8.8 invariants that A3 must implement ──

describe('invariant 1 — transfers conserve total_balance', () => {
  it('Δsource + Δdestination = 0 and total_balance is unchanged by a transfer', () => {
    const cash = acc('cash', 'cash', 1000000);
    const bank = acc('bank', 'bank', 200000);
    const accounts = [cash, bank];
    const before = totalBalance(accounts, []);
    const t = [txn({ id: 't1', amount: 350000, kind: 'transfer', account_id: 'cash', to_account_id: 'bank', date: '2026-07-01' })];

    const dSource = accountBalance(cash, t) - accountBalance(cash, []);
    const dDest = accountBalance(bank, t) - accountBalance(bank, []);
    expect(dSource + dDest).toBe(0);
    expect(totalBalance(accounts, t)).toBe(before);
  });
});

describe('invariant 2 — cash_flow(t) ≡ Δtotal_balance(t)', () => {
  it('holds for a mixed set including transfers (transfers net to zero)', () => {
    const accounts = [acc('cash', 'cash', 0), acc('bank', 'bank', 0)];
    const t = [
      txn({ id: 'i', amount: 2000000, kind: 'income', account_id: 'bank', date: '2026-07-01' }),
      txn({ id: 'e', amount: 900000, kind: 'expense', account_id: 'bank', date: '2026-07-05' }),
      txn({ id: 'e2', amount: 450000, kind: 'expense', account_id: 'cash', date: '2026-07-06' }),
      txn({ id: 'x', amount: 300000, kind: 'transfer', account_id: 'bank', to_account_id: 'cash', date: '2026-07-07' }),
    ];
    const deltaTotal = totalBalance(accounts, t) - totalBalance(accounts, []);
    expect(cashFlow(accounts, t, '2026-07')).toBe(deltaTotal);
    expect(deltaTotal).toBe(650000);
  });
});

describe('invariant 6 — backdated transactions re-bucket into the right month', () => {
  it('a June-dated entry lands in June, leaving July untouched', () => {
    const accounts = [acc('bank', 'bank', 0)];
    const t = [
      txn({ id: 'jul', amount: 2000000, kind: 'income', account_id: 'bank', date: '2026-07-01' }),
      txn({ id: 'jun', amount: 500000, kind: 'income', account_id: 'bank', date: '2026-06-28' }),
    ];
    expect(income(accounts, t, '2026-06')).toBe(500000);
    expect(income(accounts, t, '2026-07')).toBe(2000000);
    expect(cashFlow(accounts, t, '2026-06')).toBe(500000);
    // total_balance is date-agnostic: both entries always counted.
    expect(totalBalance(accounts, t)).toBe(2500000);
  });
});

describe('momChange — §8.7 trends', () => {
  it('is the signed percentage change vs the previous period', () => {
    expect(momChange(110, 100)).toBeCloseTo(10);
    expect(momChange(92, 100)).toBeCloseTo(-8); // "▼ 8% vs last week"
  });

  it('uses |previous| so a negative baseline keeps the direction readable', () => {
    expect(momChange(-50, -100)).toBeCloseTo(50);
  });

  it('previous = 0 → null, never Infinity/NaN', () => {
    expect(momChange(500, 0)).toBeNull();
    expect(momChange(0, 0)).toBeNull();
  });
});
