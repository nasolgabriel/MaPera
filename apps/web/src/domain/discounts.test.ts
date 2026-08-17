import { describe, it, expect } from 'vitest';
import type { DiscountLog, Transaction } from '../db/repositories/types';
import {
  applyDiscount,
  discountSaved,
  findRule,
  ratePercent,
  removeVat,
  roundToQuarterPeso,
  type DiscountRule,
} from './discounts';
import rulesFile from '../data/discountRules.json';

const fare: DiscountRule = {
  id: 'fare-jeepney-student', category: 'fare', mode: 'jeepney', role: 'student',
  label: 'student fare', rate_bp: 2000, vat_exempt: false, rounding: 'quarter_peso',
};
const goods: DiscountRule = {
  id: 'goods-senior', category: 'goods', mode: 'grocery', role: 'senior',
  label: 'senior goods', rate_bp: 2000, vat_exempt: true, rounding: 'none',
};

function txn(id: string, amount: number, date: string): Transaction {
  return {
    id, amount, kind: 'expense', account_id: 'acc-cash', to_account_id: null,
    category_id: 'cat-transport', date, note: null,
    discount_rule_id: 'fare-jeepney-student', recurring_id: null, saved_item_id: null,
  };
}

function log(id: string, transaction_id: string, base_amount: number): DiscountLog {
  return { id, transaction_id, base_amount };
}

describe('roundToQuarterPeso (invariant 7)', () => {
  it('snaps to the nearest 25 centavos', () => {
    expect(roundToQuarterPeso(1040)).toBe(1050);
    expect(roundToQuarterPeso(1030)).toBe(1025);
    expect(roundToQuarterPeso(1037)).toBe(1025);
    expect(roundToQuarterPeso(1038)).toBe(1050);
  });

  it('leaves exact quarters and zero alone', () => {
    expect(roundToQuarterPeso(1200)).toBe(1200);
    expect(roundToQuarterPeso(1225)).toBe(1225);
    expect(roundToQuarterPeso(0)).toBe(0);
  });
});

describe('applyDiscount — fares (§7.9 launch scope)', () => {
  it('matches wireframe E1: ₱15.00 student jeepney → ₱12.00, keeps ₱3.00', () => {
    expect(applyDiscount(1500, fare)).toEqual({ base: 1500, discounted: 1200, kept: 300 });
  });

  it('rounds a ₱13.00 fare up to the nearest quarter (₱10.40 → ₱10.50)', () => {
    expect(applyDiscount(1300, fare)).toEqual({ base: 1300, discounted: 1050, kept: 250 });
  });

  it('lands every fare on a ₱0.25 multiple (invariant 7)', () => {
    for (let base = 100; base <= 20000; base += 1) {
      const { discounted, base: b, kept } = applyDiscount(base, fare);
      expect(discounted % 25).toBe(0);
      expect(kept).toBe(b - discounted);
    }
  });

  it('never discounts below zero or above the base', () => {
    expect(applyDiscount(0, fare)).toEqual({ base: 0, discounted: 0, kept: 0 });
    const { discounted } = applyDiscount(25, fare);
    expect(discounted).toBeGreaterThanOrEqual(0);
    expect(discounted).toBeLessThanOrEqual(25);
  });

  it('a zero-rate rule leaves the price alone', () => {
    const free = { ...fare, rate_bp: 0 };
    expect(applyDiscount(1500, free)).toEqual({ base: 1500, discounted: 1500, kept: 0 });
  });
});

describe('applyDiscount — VAT-exempt goods (invariant 7 ordering)', () => {
  it('removes VAT first: ₱112 → ₱100 → ₱80, never ₱89.60', () => {
    expect(removeVat(11200)).toBe(10000);
    const result = applyDiscount(11200, goods);
    expect(result.discounted).toBe(8000);
    expect(result.discounted).not.toBe(8960);
    expect(result.kept).toBe(3200);
  });

  it('a taxed rule at the same rate would give the wrong ₱89.60 figure', () => {
    expect(applyDiscount(11200, { ...goods, vat_exempt: false }).discounted).toBe(8960);
  });
});

describe('findRule / ratePercent', () => {
  it('picks the rule for a role and mode from the bundled file', () => {
    const rules = rulesFile.rules as DiscountRule[];
    expect(findRule(rules, 'senior', 'bus_train')!.id).toBe('fare-bus-train-senior');
    expect(findRule(rules, 'pwd', 'jeepney')!.id).toBe('fare-jeepney-pwd');
    expect(findRule(rules, 'student', 'ferry')).toBeNull();
  });

  it('ships fares only at launch, all at 20% with quarter-peso rounding (§6.5)', () => {
    const rules = rulesFile.rules as DiscountRule[];
    expect(rulesFile.version).toBe(1);
    expect(rules).toHaveLength(6);
    expect(rules.every((r) => r.category === 'fare')).toBe(true);
    expect(rules.every((r) => r.rounding === 'quarter_peso' && !r.vat_exempt)).toBe(true);
    expect(ratePercent(rules[0]!)).toBe(20);
  });
});

describe('discountSaved (§6.5 yearly counter)', () => {
  const txns = [txn('t1', 1200, '2026-03-04'), txn('t2', 1050, '2026-11-20'), txn('t3', 1200, '2025-12-31')];
  const logs = [log('d1', 't1', 1500), log('d2', 't2', 1300), log('d3', 't3', 1500)];

  it('sums base − paid for the given year only', () => {
    expect(discountSaved(logs, txns, '2026')).toBe(550);
    expect(discountSaved(logs, txns, '2025')).toBe(300);
    expect(discountSaved(logs, txns, '2024')).toBe(0);
  });

  it('ignores a log whose transaction was deleted', () => {
    expect(discountSaved([...logs, log('d4', 'gone', 9900)], txns, '2026')).toBe(550);
  });

  it('is zero with nothing logged', () => {
    expect(discountSaved([], txns, '2026')).toBe(0);
  });
});
