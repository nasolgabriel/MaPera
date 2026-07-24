import { describe, expect, it } from 'vitest';
import {
  dueNextMonth, dueThisMonth, duesTotal, nextDueAfter, parseRecurringTemplate, stillDue,
} from './dues';
import type { RecurringTemplate } from './dues';
import type { Recurring, Transaction } from '../db/repositories/types';

function tmplJson(
  over: Partial<RecurringTemplate> & Pick<RecurringTemplate, 'amount' | 'kind' | 'account_id'>,
): string {
  return JSON.stringify({
    to_account_id: null, category_id: null, note: null, total_payments: null, interval_months: null,
    ...over,
  });
}

function rec(p: Partial<Recurring> & Pick<Recurring, 'id' | 'template'>): Recurring {
  return {
    kind: 'subscription', frequency: 'monthly', next_due: '2026-07-15', auto_post: false,
    remaining_payments: null, ...p,
  };
}

function txn(p: Partial<Transaction> & Pick<Transaction, 'id' | 'recurring_id' | 'date'>): Transaction {
  return {
    amount: 0, kind: 'expense', account_id: 'acc', to_account_id: null, category_id: null,
    note: null, discount_rule_id: null, saved_item_id: null, ...p,
  };
}

// The seeded July scene (wireframe B2): 3 dues = ₱2,998, an annual landing in August, an
// auto-transfer that must NOT count as a due.
const netflix = rec({ id: 'r-netflix', template: tmplJson({ amount: 54900, kind: 'expense', account_id: 'acc-cash', note: 'Netflix' }), kind: 'subscription', next_due: '2026-07-15' });
const spotify = rec({ id: 'r-spotify', template: tmplJson({ amount: 14900, kind: 'expense', account_id: 'acc-cash', note: 'Spotify' }), kind: 'subscription', next_due: '2026-07-20' });
const loan = rec({ id: 'r-loan', template: tmplJson({ amount: 230000, kind: 'expense', account_id: 'acc-cash', note: 'Gadget loan', total_payments: 24 }), kind: 'loan', next_due: '2026-07-30', remaining_payments: 10 });
const googleOne = rec({ id: 'r-google', template: tmplJson({ amount: 97900, kind: 'expense', account_id: 'acc-cash', note: 'Google One', interval_months: 12 }), kind: 'bill', frequency: 'custom', next_due: '2026-08-10' });
const autoTransfer = rec({ id: 'r-auto', template: tmplJson({ amount: 200000, kind: 'transfer', account_id: 'acc-cash', to_account_id: 'acc-maya' }), kind: 'transfer', next_due: '2026-07-30', auto_post: true });
const all = [netflix, spotify, loan, googleOne, autoTransfer];

describe('parseRecurringTemplate (§7.1 JSON-as-text, never eval)', () => {
  it('round-trips a valid template', () => {
    const t: RecurringTemplate = {
      amount: 54900, kind: 'expense', account_id: 'acc-cash', to_account_id: null,
      category_id: null, note: 'Netflix', total_payments: null, interval_months: null,
    };
    expect(parseRecurringTemplate(JSON.stringify(t))).toEqual(t);
  });

  it('normalises absent optional fields to null', () => {
    const parsed = parseRecurringTemplate('{"amount":100,"kind":"expense","account_id":"a"}');
    expect(parsed).toEqual({
      amount: 100, kind: 'expense', account_id: 'a', to_account_id: null,
      category_id: null, note: null, total_payments: null, interval_months: null,
    });
  });

  it('rejects malformed input', () => {
    expect(parseRecurringTemplate('not json')).toBeNull();
    expect(parseRecurringTemplate('[]')).toBeNull(); // array, not an object
    expect(parseRecurringTemplate('{"kind":"expense","account_id":"a"}')).toBeNull(); // no amount
    expect(parseRecurringTemplate('{"amount":10.5,"kind":"expense","account_id":"a"}')).toBeNull(); // non-integer centavos
    expect(parseRecurringTemplate('{"amount":-5,"kind":"expense","account_id":"a"}')).toBeNull(); // negative
    expect(parseRecurringTemplate('{"amount":10,"kind":"gift","account_id":"a"}')).toBeNull(); // bad kind
    expect(parseRecurringTemplate('{"amount":10,"kind":"expense"}')).toBeNull(); // no account_id
    expect(parseRecurringTemplate('{"amount":10,"kind":"expense","account_id":"a","total_payments":2.5}')).toBeNull();
    expect(parseRecurringTemplate('{"amount":10,"kind":"expense","account_id":"a","note":42}')).toBeNull();
  });
});

describe('nextDueAfter', () => {
  it('advances one month, preserving the day', () => {
    expect(nextDueAfter('2026-07-15', 'monthly')).toBe('2026-08-15');
    expect(nextDueAfter('2026-12-31', 'monthly')).toBe('2027-01-31'); // year rollover
  });

  it('clamps the day into a shorter month', () => {
    expect(nextDueAfter('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(nextDueAfter('2028-01-31', 'monthly')).toBe('2028-02-29'); // leap
  });

  it('advances custom cadence by interval months (annual default 12)', () => {
    expect(nextDueAfter('2026-08-10', 'custom', 12)).toBe('2027-08-10');
    expect(nextDueAfter('2026-08-10', 'custom')).toBe('2027-08-10');
    expect(nextDueAfter('2026-08-10', 'custom', 3)).toBe('2026-11-10');
  });
});

describe('dueThisMonth (§8.5)', () => {
  it('lists non-transfer dues scheduled in the month; excludes auto-transfers', () => {
    const rows = dueThisMonth(all, [], '2026-07');
    expect(rows.map((r) => r.id)).toEqual(['r-netflix', 'r-spotify', 'r-loan']); // no google (Aug), no auto-transfer
    expect(duesTotal(rows)).toBe(299800); // ₱2,998
  });

  it('carries loan progress for the "14 of 24" read', () => {
    const row = dueThisMonth([loan], [], '2026-07')[0]!;
    expect(row.loanTotal).toBe(24);
    expect(row.loanRemaining).toBe(10); // 24 − 10 = 14 paid
    expect(row.name).toBe('Gadget loan');
  });

  it('marks a due paid once a linked transaction sits in the month (no double-count)', () => {
    const paidTxn = txn({ id: 't1', recurring_id: 'r-netflix', date: '2026-07-15', amount: 54900 });
    const rows = dueThisMonth(all, [paidTxn], '2026-07');
    expect(rows.find((r) => r.id === 'r-netflix')!.paid).toBe(true);
    expect(rows.find((r) => r.id === 'r-spotify')!.paid).toBe(false);
    expect(stillDue(rows)).toBe(244900); // ₱2,449 — Netflix cleared
  });

  it('recovers an auto-posted due whose next_due has rolled to next month via its linked txn', () => {
    const rolled = rec({ ...netflix, next_due: '2026-08-15' }); // engine advanced it
    const linked = txn({ id: 't2', recurring_id: 'r-netflix', date: '2026-07-15', amount: 54900 });
    const rows = dueThisMonth([rolled], [linked], '2026-07');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.paid).toBe(true);
  });

  it('skips a recurring with an unparseable template', () => {
    const broken = rec({ id: 'r-bad', template: 'not json', next_due: '2026-07-15' });
    expect(dueThisMonth([broken], [], '2026-07')).toEqual([]);
  });
});

describe('dueNextMonth (§8.5 projection + diff note)', () => {
  it('projects monthlies + loan forward and adds the annual anniversary', () => {
    const next = dueNextMonth(all, '2026-07');
    expect(next.total).toBe(397700); // ₱3,977 = 2,998 + Google One 979
    expect(next.delta).toBe(97900); // +₱979
    expect(next.reason).toBe('Google One lands in August');
  });

  it('drops a loan out once its last payment falls in the current month', () => {
    const lastPayment = rec({ ...loan, remaining_payments: 1 });
    const next = dueNextMonth([lastPayment], '2026-07');
    expect(next.total).toBe(0);
    expect(next.delta).toBe(-230000);
    expect(next.reason).toBe('Gadget loan ends');
  });

  it('reports no diff note when the set is unchanged month to month', () => {
    const next = dueNextMonth([netflix, spotify], '2026-07');
    expect(next.delta).toBe(0);
    expect(next.reason).toBeNull();
  });
});
