import { describe, it, expect } from 'vitest';
import { nearestIndex, useChartScrub } from './useChartScrub';

const rect = (left: number, width: number) => ({ left, width });
const key = (k: string): KeyboardEvent => ({ key: k, preventDefault() {} }) as KeyboardEvent;

describe('nearestIndex — clientX → data index', () => {
  it('maps the ends and clamps beyond them', () => {
    expect(nearestIndex(0, rect(0, 500), 6)).toBe(0);
    expect(nearestIndex(500, rect(0, 500), 6)).toBe(5);
    expect(nearestIndex(-50, rect(0, 500), 6)).toBe(0); // clamp low
    expect(nearestIndex(9999, rect(0, 500), 6)).toBe(5); // clamp high
  });

  it('rounds to the nearest index and respects a non-zero offset', () => {
    // width 400, 5 points → 100px per step.
    expect(nearestIndex(100, rect(0, 400), 5)).toBe(1);
    expect(nearestIndex(190, rect(0, 400), 5)).toBe(2); // 0.475*4 = 1.9 → 2
    expect(nearestIndex(120, rect(20, 400), 5)).toBe(1); // (120−20)/400 = 0.25 → 1
  });

  it('guards degenerate inputs (single point, zero width)', () => {
    expect(nearestIndex(123, rect(0, 400), 1)).toBe(0);
    expect(nearestIndex(123, rect(0, 0), 6)).toBe(0); // jsdom-style zero rect
  });
});

describe('useChartScrub — keyboard stepping (the a11y + testable path)', () => {
  it('starts null, steps with arrows, and clamps at both ends', () => {
    const s = useChartScrub(() => 4);
    expect(s.selected.value).toBeNull();

    s.onKeydown(key('ArrowRight'));
    expect(s.selected.value).toBe(0); // first press lands on index 0
    s.onKeydown(key('ArrowRight'));
    expect(s.selected.value).toBe(1);
    s.onKeydown(key('ArrowLeft'));
    expect(s.selected.value).toBe(0);
    s.onKeydown(key('ArrowLeft'));
    expect(s.selected.value).toBe(0); // clamps at 0
  });

  it('Home/End jump to the ends; End on a fresh scrub selects the last', () => {
    const s = useChartScrub(() => 4);
    s.onKeydown(key('End'));
    expect(s.selected.value).toBe(3);
    s.onKeydown(key('ArrowRight'));
    expect(s.selected.value).toBe(3); // clamps at n−1
    s.onKeydown(key('Home'));
    expect(s.selected.value).toBe(0);
  });

  it('ArrowLeft from null selects the last (walking in from the right)', () => {
    const s = useChartScrub(() => 4);
    s.onKeydown(key('ArrowLeft'));
    expect(s.selected.value).toBe(3);
  });

  it('clear() resets the selection', () => {
    const s = useChartScrub(() => 4);
    s.onKeydown(key('Home'));
    s.clear();
    expect(s.selected.value).toBeNull();
  });

  it('ignores keys on an empty series', () => {
    const s = useChartScrub(() => 0);
    s.onKeydown(key('ArrowRight'));
    expect(s.selected.value).toBeNull();
  });
});
