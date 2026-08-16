import { describe, it, expect } from 'vitest';
import type { Account, Transaction } from '../db/repositories/types';
import {
  amountOwed,
  cardHealth,
  cardPayments,
  cardSpend,
  estimatedInterest,
  incomeShare,
  paidInFull,
  points,
  previousMonth,
  statementBalance,
  utilization,
} from './credit';
import { cashFlow, expenses } from './stats';

function acc(id: string, type: Account['type'], extra: Partial<Account> = {}): Account {
  return {
    id, name: id, type, starting_balance: 0, essence_color: '#B3282D',
    archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
    ...extra,
  };
}

function txn(p: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'kind' | 'account_id' | 'date'>): Transaction {
  return {
    to_account_id: null, category_id: null, note: null,
    discount_rule_id: null, recurring_id: null, saved_item_id: null,
    ...p,
  };
}

// The wireframe D3 card: ₱30,000 limit, statement on the 15th, 1 pt per ₱25.
const card = acc('card', 'credit_card', { credit_limit: 3000000, statement_day: 15, points_rate: 2500 });
const cash = acc('cash', 'cash');
const bank = acc('bank', 'bank');
const accounts = [card, cash, bank];

// June: ₱4,890 charged before the statement day + ₱1,200 after it.
// July: ₱4,200 charged, and the June statement (₱4,890) paid off from cash.
// → owed = 4,890 + 1,200 + 4,200 − 4,890 = ₱5,400 (the figure on the wireframe).
const ledger: Transaction[] = [
  txn({ id: 'inc-7', amount: 2000000, kind: 'income', account_id: 'bank', date: '2026-07-01' }),
  txn({ id: 'jun-1', amount: 489000, kind: 'expense', account_id: 'card', date: '2026-06-10' }),
  txn({ id: 'jun-2', amount: 120000, kind: 'expense', account_id: 'card', date: '2026-06-24' }),
  txn({ id: 'jul-1', amount: 420000, kind: 'expense', account_id: 'card', date: '2026-07-08' }),
  txn({ id: 'pay-7', amount: 489000, kind: 'transfer', account_id: 'cash', to_account_id: 'card', date: '2026-07-05' }),
];

describe('owed & utilization (§8.6)', () => {
  it('owed is the card balance with the sign flipped', () => {
    expect(amountOwed(card, ledger)).toBe(540000); // ₱5,400
  });

  it('an overpaid card reports a negative owed rather than clamping to zero', () => {
    const overpaid = [
      txn({ id: 'e', amount: 100000, kind: 'expense', account_id: 'card', date: '2026-07-02' }),
      txn({ id: 'p', amount: 150000, kind: 'transfer', account_id: 'cash', to_account_id: 'card', date: '2026-07-03' }),
    ];
    expect(amountOwed(card, overpaid)).toBe(-50000);
  });

  it('utilization = owed / credit_limit × 100', () => {
    expect(utilization(540000, 3000000)).toBeCloseTo(18); // the wireframe's 18% of ₱30k
  });

  it('returns null without a credit limit (§8.7 zero-guard, never NaN/Infinity)', () => {
    expect(utilization(540000, null)).toBeNull();
    expect(utilization(540000, 0)).toBeNull();
  });
});

describe('card spend, income share & points (§8.6)', () => {
  it('card_spend counts only expenses charged to the card in month t', () => {
    expect(cardSpend(card, ledger, '2026-07')).toBe(420000); // the payment transfer is excluded
    expect(cardSpend(card, ledger, '2026-06')).toBe(609000); // 4,890 + 1,200
  });

  it('income_share = card_spend / I(t) × 100', () => {
    expect(incomeShare(420000, 2000000)).toBeCloseTo(21); // the wireframe's 21%
  });

  it('income_share is null in a zero-income month (§8.7)', () => {
    expect(incomeShare(420000, 0)).toBeNull();
  });

  it('points = floor(card_spend / peso_per_point)', () => {
    expect(points(420000, 2500)).toBe(168); // ₱4,200 at 1 pt / ₱25
    expect(points(421000, 2500)).toBe(168); // floored, never rounded up
  });

  it('points is null without a rate — a card that earns none shows "—", not 0', () => {
    expect(points(420000, null)).toBeNull();
    expect(points(420000, 0)).toBeNull();
  });
});

describe('statement balance & paid_in_full (§8.6)', () => {
  it('previousMonth crosses a year boundary', () => {
    expect(previousMonth('2026-07')).toBe('2026-06');
    expect(previousMonth('2026-01')).toBe('2025-12');
  });

  it('statement_balance snapshots what was owed on the statement day', () => {
    // June statement (15th) sees the ₱4,890 charge on the 10th but not the ₱1,200 on the 24th.
    expect(statementBalance(card, ledger, '2026-06')).toBe(489000);
  });

  it('falls back to the month-end when the card has no statement day', () => {
    const noDay = acc('card', 'credit_card', { credit_limit: 3000000 });
    expect(statementBalance(noDay, ledger, '2026-06')).toBe(609000); // both June charges
  });

  it('payments count transfers into the card only', () => {
    expect(cardPayments(card, ledger, '2026-07')).toBe(489000);
    expect(cardPayments(card, ledger, '2026-06')).toBe(0);
  });

  it('paid_in_full compares this month’s payments against last month’s statement', () => {
    expect(paidInFull(card, ledger, '2026-07')).toBe(true); // 4,890 paid ≥ 4,890 statement
  });

  it('a short payment is not paid in full', () => {
    const short = ledger.map((t) => (t.id === 'pay-7' ? { ...t, amount: 400000 } : t));
    expect(paidInFull(card, short, '2026-07')).toBe(false);
  });

  it('a month with nothing owed last statement is vacuously paid in full', () => {
    expect(paidInFull(card, ledger, '2026-06')).toBe(true); // no May statement
  });
});

describe('interest warning (§7.8)', () => {
  it('sizes the charge off the unpaid balance', () => {
    expect(estimatedInterest(540000)).toBe(18900); // ₱5,400 × 3.5% = ₱189
  });

  it('is zero when nothing is owed', () => {
    expect(estimatedInterest(0)).toBe(0);
    expect(estimatedInterest(-50000)).toBe(0);
  });
});

describe('cardHealth — the three §7.8 checks', () => {
  it('reports every §8.6 figure and flags a healthy card', () => {
    const h = cardHealth(card, accounts, ledger, '2026-07');
    expect(h.owed).toBe(540000);
    expect(h.utilization).toBeCloseTo(18);
    expect(h.cardSpend).toBe(420000);
    expect(h.incomeShare).toBeCloseTo(21);
    expect(h.points).toBe(168);
    expect(h.previousMonth).toBe('2026-06');
    expect(h.previousStatement).toBe(489000);
    expect(h.payments).toBe(489000);
    expect(h.paidInFull).toBe(true);
    expect(h.estimatedInterest).toBeNull(); // cleared → no interest warning
    expect(h.checks).toEqual({ utilization: 'ok', incomeShare: 'ok', paidInFull: 'ok' });
    expect(h.healthy).toBe(true);
  });

  it('turns red when utilization runs past 30%', () => {
    const heavy = [...ledger, txn({ id: 'big', amount: 900000, kind: 'expense', account_id: 'card', date: '2026-07-12' })];
    const h = cardHealth(card, accounts, heavy, '2026-07');
    expect(h.checks.utilization).toBe('bad');
    expect(h.healthy).toBe(false);
  });

  it('turns red when card spend passes 30% of income', () => {
    const heavy = [...ledger, txn({ id: 'big', amount: 300000, kind: 'expense', account_id: 'card', date: '2026-07-12' })];
    const h = cardHealth(card, accounts, heavy, '2026-07'); // 7,200 / 20,000 = 36%
    expect(h.checks.incomeShare).toBe('bad');
    expect(h.healthy).toBe(false);
  });

  it('turns red and estimates interest when the statement was not cleared', () => {
    const unpaid = ledger.filter((t) => t.id !== 'pay-7');
    const h = cardHealth(card, accounts, unpaid, '2026-07');
    expect(h.checks.paidInFull).toBe('bad');
    expect(h.healthy).toBe(false);
    expect(h.estimatedInterest).toBe(Math.round(h.owed * 0.035));
  });

  it('an unmeasurable check is "unknown", never a green one', () => {
    const noLimit = acc('card', 'credit_card', { statement_day: 15 });
    const h = cardHealth(noLimit, [noLimit, cash, bank], ledger.filter((t) => t.kind !== 'income'), '2026-07');
    expect(h.utilization).toBeNull();
    expect(h.checks.utilization).toBe('unknown');
    expect(h.checks.incomeShare).toBe('unknown'); // zero-income month
    expect(h.healthy).toBe(false);
  });
});

// README §8.8 invariant 8 — the reason a bill payment is a transfer (§7.2) and not an expense.
describe('invariant 8 — a card bill payment changes neither E nor cash_flow', () => {
  it('holds when the payment is added to the ledger', () => {
    const before = ledger.filter((t) => t.id !== 'pay-7');
    const after = ledger;

    expect(expenses(accounts, after, '2026-07')).toBe(expenses(accounts, before, '2026-07'));
    expect(cashFlow(accounts, after, '2026-07')).toBe(cashFlow(accounts, before, '2026-07'));
    // …and it is a real money movement: the card owes ₱4,890 less than it did.
    expect(amountOwed(card, before) - amountOwed(card, after)).toBe(489000);
  });
});
