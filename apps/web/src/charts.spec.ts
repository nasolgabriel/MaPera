import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LineChart from './components/LineChart.vue';
import MonthBars from './components/MonthBars.vue';
import type { SeriesPoint } from './domain/statistics';

// jsdom has no layout (getBoundingClientRect → 0), so pointer scrub can't be asserted here;
// the keyboard path drives the same selection and IS deterministic (E3).
const points: SeriesPoint[] = [
  { month: '2026-05', value: 4300000, partial: false },
  { month: '2026-06', value: 7300000, partial: false },
  { month: '2026-07', value: 8100000, partial: true },
];

describe('LineChart interactivity (E3)', () => {
  it('is a keyboard slider that shows a tooltip + selected mark on Arrow', async () => {
    const wrapper = mount(LineChart, {
      props: { points, comparison: [null, 4300000, 7300000], label: 'Total saved', changePct: 12 },
    });
    const plot = wrapper.find('.plot');
    expect(plot.attributes('role')).toBe('slider');
    expect(wrapper.find('.tooltip').exists()).toBe(false); // nothing selected yet

    await plot.trigger('keydown', { key: 'ArrowRight' }); // → index 0 = May 2026
    expect(wrapper.find('.tooltip').exists()).toBe(true);
    expect(wrapper.find('.tooltip').text()).toContain('May 2026');
    expect(wrapper.find('.tooltip').text()).toContain('43,000');
    expect(wrapper.find('.sel').exists()).toBe(true); // highlighted dot
    expect(plot.attributes('aria-valuenow')).toBe('0');

    await plot.trigger('keydown', { key: 'End' }); // → last (partial July)
    expect(wrapper.find('.tooltip').text()).toContain('Jul 2026');
    expect(plot.attributes('aria-valuenow')).toBe('2');
  });
});

describe('MonthBars interactivity (E3)', () => {
  it('selects a bar by keyboard and reads its value (signed)', async () => {
    const net: SeriesPoint[] = [
      { month: '2026-05', value: 650000, partial: false },
      { month: '2026-06', value: -120000, partial: false },
      { month: '2026-07', value: 300000, partial: true },
    ];
    const wrapper = mount(MonthBars, { props: { points: net, label: 'Free cash flow', changePct: -8 } });
    const plot = wrapper.find('.plot');

    await plot.trigger('keydown', { key: 'ArrowRight' }); // → May
    await plot.trigger('keydown', { key: 'ArrowRight' }); // → June (negative)
    expect(wrapper.find('.tooltip').text()).toContain('Jun 2026');
    expect(wrapper.find('.tooltip').text()).toContain('−₱'); // negative month keeps the sign
    expect(wrapper.find('.bar.selected').exists()).toBe(true);
  });
});

describe('chart reveal', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for data, then reveals a frame after the bars exist', async () => {
    vi.useFakeTimers();
    const wrapper = mount(MonthBars, { props: { points: [], label: 'Spend by month', changePct: null } });
    expect(wrapper.find('.host').classes()).not.toContain('revealed');

    vi.advanceTimersByTime(100);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.host').classes()).not.toContain('revealed');

    await wrapper.setProps({ points });
    expect(wrapper.findAll('.bar').length).toBe(3);
    expect(wrapper.find('.host').classes()).not.toContain('revealed');

    vi.advanceTimersByTime(100);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.host').classes()).toContain('revealed');
  });
});
