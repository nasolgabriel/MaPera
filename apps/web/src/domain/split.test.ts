import { describe, expect, it } from 'vitest';
import { allocateSplit, daysLeftInMonth, parsePresetBuckets } from './split';
import type { SplitBucket } from './split';

const foodCap: SplitBucket = { target: { type: 'budget', category_id: 'cat-food' }, mode: 'percent', value: 5000 };
const transportCap: SplitBucket = { target: { type: 'budget', category_id: 'cat-transport' }, mode: 'percent', value: 2500 };
const bpiFixed: SplitBucket = { target: { type: 'account', account_id: 'acc-bank' }, mode: 'fixed', value: 200000 };

describe('allocateSplit', () => {
  // B4 accept criterion: split of seed salary allocates exactly, in centavos.
  it('splits the seed salary exactly in centavos (50% + 25% + ₱2,000 fixed)', () => {
    const result = allocateSplit(2000000, [foodCap, transportCap, bpiFixed]);
    expect(result.allocations.map((a) => a.amount)).toEqual([1000000, 500000, 200000]);
    expect(result.leftFree).toBe(300000);
    expect(result.overAllocated).toBe(false);
  });

  it('always reconciles: Σ allocations + leftFree ≡ income, dust never invented', () => {
    // 3 × 3,333bp on a prime centavo amount — floor drops sub-centavo dust into leftFree.
    const third: SplitBucket = { target: { type: 'budget', category_id: 'c' }, mode: 'percent', value: 3333 };
    const income = 1000003;
    const result = allocateSplit(income, [third, third, third]);
    const total = result.allocations.reduce((sum, a) => sum + a.amount, 0);
    expect(total + result.leftFree).toBe(income);
    expect(result.allocations.every((a) => Number.isInteger(a.amount))).toBe(true);
    expect(result.leftFree).toBeGreaterThanOrEqual(0);
  });

  it('flags over-allocation when buckets exceed the income', () => {
    const result = allocateSplit(100000, [{ ...bpiFixed, value: 150000 }]);
    expect(result.overAllocated).toBe(true);
    expect(result.leftFree).toBe(-50000);
  });

  it('handles zero buckets and zero income', () => {
    expect(allocateSplit(50000, [])).toEqual({ allocations: [], leftFree: 50000, overAllocated: false });
    const zero = allocateSplit(0, [foodCap]);
    expect(zero.allocations[0]?.amount).toBe(0);
    expect(zero.overAllocated).toBe(false);
  });
});

describe('parsePresetBuckets', () => {
  it('round-trips a valid buckets array', () => {
    const buckets = [foodCap, bpiFixed];
    expect(parsePresetBuckets(JSON.stringify(buckets))).toEqual(buckets);
  });

  it('rejects malformed input', () => {
    expect(parsePresetBuckets('not json')).toBeNull();
    expect(parsePresetBuckets('{"a":1}')).toBeNull(); // not an array
    expect(parsePresetBuckets('[{"mode":"percent","value":5000}]')).toBeNull(); // no target
    expect(parsePresetBuckets('[{"target":{"type":"budget","category_id":"c"},"mode":"half","value":1}]')).toBeNull();
    expect(parsePresetBuckets('[{"target":{"type":"budget","category_id":"c"},"mode":"fixed","value":10.5}]')).toBeNull(); // non-integer centavos
    expect(parsePresetBuckets('[{"target":{"type":"goal","goal_id":"g"},"mode":"fixed","value":1}]')).toBeNull(); // goals are B5
  });
});

describe('daysLeftInMonth', () => {
  it('counts today through month end', () => {
    expect(daysLeftInMonth('2026-07-15', '2026-07')).toBe(17);
    expect(daysLeftInMonth('2026-07-31', '2026-07')).toBe(1);
    expect(daysLeftInMonth('2026-07-01', '2026-07')).toBe(31);
  });

  it('past month → 0, future month → full length (leap-aware)', () => {
    expect(daysLeftInMonth('2026-08-01', '2026-07')).toBe(0);
    expect(daysLeftInMonth('2026-07-15', '2026-09')).toBe(30);
    expect(daysLeftInMonth('2027-12-31', '2028-02')).toBe(29);
  });
});
