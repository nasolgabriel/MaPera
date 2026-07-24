<script setup lang="ts">
// Wireframes A1 (peek strip above the hub) → A1c (expanded chart on scroll).
// Presentation only: the 7-day series, average and week-over-week % arrive as props.
import { computed } from 'vue';
import type { DaySpend } from '../domain/calendar';

const props = defineProps<{
  days: DaySpend[];
  /** Mean centavos/day over the window; null = nothing to average (§8.7). */
  average: number | null;
  /** mom_change vs the previous 7 days; null = previous window was 0 → render "—". */
  changePct: number | null;
  /** Per-day cap line; null when no caps are set. */
  dayCap: number | null;
  /** ISO date drawn as "today" (navy bar). */
  todayDate: string;
  expanded: boolean;
}>();

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const peak = computed(() => Math.max(...props.days.map((d) => d.spend), 1));

const bars = computed(() =>
  props.days.map((d) => ({
    ...d,
    /** Height as a % of the tallest bar — never 0 for a day with spend, so it stays visible. */
    height: d.spend === 0 ? 0 : Math.max(6, (d.spend / peak.value) * 100),
    over: props.dayCap !== null && d.spend > props.dayCap,
    isToday: d.date === props.todayDate,
    weekday: WEEKDAYS[d.weekdayIndex] ?? '',
  })),
);

/** The heaviest over-cap day of the window — the A1c footer note. */
const overCapDay = computed(() => {
  const overs = bars.value.filter((b) => b.over);
  if (overs.length === 0) return null;
  return overs.reduce((worst, b) => (b.spend > worst.spend ? b : worst));
});

function pesoWhole(centavos: number): string {
  return `₱ ${Math.round(centavos / 100).toLocaleString('en-PH')}`;
}

function amount(centavos: number): string {
  return Math.round(centavos / 100).toLocaleString('en-PH');
}

const changeLabel = computed(() => {
  if (props.changePct === null) return '—';
  const rounded = Math.round(props.changePct);
  if (rounded === 0) return 'same as last week';
  const arrow = rounded < 0 ? '▼' : '▲';
  return `${arrow} ${Math.abs(rounded)}% vs last week`;
});

const dayLabel = computed(() => {
  const day = overCapDay.value;
  if (day === null) return null;
  const [y, m, d] = day.date.split('-').map(Number);
  const weekday = new Date(y!, m! - 1, d!).toLocaleDateString('en-PH', { weekday: 'short' });
  return `${weekday} over cap · ${pesoWhole(day.spend)}`;
});
</script>

<template>
  <section :class="['graph', { expanded }]" aria-label="Spending, last 7 days">
    <div class="head">
      <span class="tag mono">LAST 7 DAYS</span>
      <span v-if="expanded" :class="['change', 'mono', { down: (changePct ?? 0) < 0 }]">{{ changeLabel }}</span>
    </div>

    <div class="bars">
      <div v-for="b in bars" :key="b.date" class="col">
        <span v-if="expanded" class="value mono" :class="{ over: b.over, today: b.isToday }">
          {{ b.spend === 0 ? '—' : amount(b.spend) }}
        </span>
        <div class="bar" :class="{ over: b.over, today: b.isToday }" :style="{ height: `${b.height}%` }"></div>
      </div>
    </div>

    <!-- Collapsed only: the affordance sits at the far right of the strip (A1). -->
    <svg
      v-if="!expanded"
      class="chevron"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>

    <div v-if="expanded" class="axis">
      <span v-for="b in bars" :key="b.date" class="mono" :class="{ today: b.isToday }">{{ b.weekday }}</span>
    </div>

    <div v-if="expanded" class="foot">
      <span class="mono">avg {{ average === null ? '—' : `${pesoWhole(average)}/day` }}</span>
      <span v-if="dayLabel" class="mono over">{{ dayLabel }}</span>
    </div>
  </section>
</template>

<style scoped>
.graph {
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 0 2px;
  transition: padding 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.graph.expanded {
  border-color: var(--color-border);
  padding: 12px;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-textDim);
}
.graph.expanded .head {
  justify-content: space-between;
}
.tag {
  font-size: 8px;
  letter-spacing: 0.04em;
  color: var(--color-textDim);
  flex: none;
}
.graph.expanded .tag {
  font-size: 9px;
}
.change {
  font-size: 9px;
  font-weight: 700;
  color: var(--color-accentText);
}
.change.down {
  color: #0d7a3f; /* spending less is the good direction */
}
.chevron {
  flex: none;
  color: var(--color-textDim);
}
.bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 14px;
  opacity: 0.55;
  transition:
    height 300ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 300ms ease;
}
.graph.expanded .bars {
  height: 74px;
  gap: 5px;
  margin-top: 10px;
  opacity: 1;
}
/* Collapsed: the strip sits inline with the label (A1 peek). */
.graph:not(.expanded) {
  display: flex;
  align-items: center;
  gap: 8px;
}
.graph:not(.expanded) .head {
  flex: none;
}
.graph:not(.expanded) .bars {
  flex: 1;
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  height: 100%;
  min-width: 0;
}
.value {
  font-size: 7px;
  color: var(--color-textDim);
}
.value.over {
  color: var(--color-accentText);
  font-weight: 700;
}
.value.today {
  color: var(--color-text);
  font-weight: 700;
}
.bar {
  width: 100%;
  min-height: 0;
  background: #d5deec;
  border-radius: 2px 2px 0 0;
  transition: height 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.graph.expanded .bar {
  border-radius: 3px 3px 0 0;
}
.bar.today {
  background: var(--color-primary);
}
.bar.over {
  background: var(--color-accent);
}
.axis {
  display: flex;
  gap: 5px;
  margin-top: 5px;
}
.axis span {
  flex: 1;
  text-align: center;
  font-size: 7.5px;
  color: var(--color-textDim);
}
.axis span.today {
  color: var(--color-text);
  font-weight: 700;
}
.foot {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px solid var(--color-muted);
  font-size: 8.5px;
  color: var(--color-textDim);
}
.foot .over {
  color: var(--color-accentText);
}
@media (prefers-reduced-motion: reduce) {
  .graph,
  .bars,
  .bar {
    transition: none;
  }
}
</style>
