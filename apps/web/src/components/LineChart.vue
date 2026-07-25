<script setup lang="ts">
// §6.4 trend line — total-saved-over-time (saffron) vs a dashed comparison line.
// Presentation only: the series, comparison and headline % arrive as props (all money
// math is done in domain/statistics + the store, per §4). The live partial month is
// drawn as a dashed segment with a hollow dot and is excluded from the headline change.
import { computed } from 'vue';
import { useChartScrub } from '../composables/useChartScrub';
import ChartTooltip from './ChartTooltip.vue';
import type { SeriesPoint } from '../domain/statistics';

const props = defineProps<{
  points: SeriesPoint[];
  /** Same length as points; null where no comparison sample exists. */
  comparison: Array<number | null>;
  label: string;
  /** mom_change of the last two COMPLETED months; null = not enough data → "—". */
  changePct: number | null;
}>();

const W = 300;
const H = 92;
const PAD_X = 8;
const PAD_T = 10;
const PAD_B = 6;

const scale = computed(() => {
  const vals = props.points.map((p) => p.value);
  const cmp = props.comparison.filter((v): v is number => v !== null);
  const max = Math.max(1, ...vals, ...cmp);
  const min = Math.min(0, ...vals, ...cmp);
  const span = max - min || 1;
  const n = props.points.length;
  const x = (i: number) => (n <= 1 ? W / 2 : PAD_X + (i * (W - 2 * PAD_X)) / (n - 1));
  const y = (v: number) => H - PAD_B - ((v - min) / span) * (H - PAD_T - PAD_B);
  return { x, y };
});

interface Dot { x: number; y: number; partial: boolean; }
const dots = computed<Dot[]>(() =>
  props.points.map((p, i) => ({ x: scale.value.x(i), y: scale.value.y(p.value), partial: p.partial })),
);

/** Solid line over the completed points only. */
const solidPath = computed(() => line(dots.value.filter((d) => !d.partial)));
/** Dashed tail from the last completed point into the partial live month, if present. */
const partialPath = computed(() => {
  const partial = dots.value.find((d) => d.partial);
  if (!partial) return '';
  const completed = dots.value.filter((d) => !d.partial);
  const last = completed[completed.length - 1];
  return last ? `M ${last.x} ${last.y} L ${partial.x} ${partial.y}` : '';
});
/** Comparison line over the indices that have a sample. */
const comparisonPath = computed(() =>
  line(
    props.comparison
      .map((v, i) => (v === null ? null : { x: scale.value.x(i), y: scale.value.y(v) }))
      .filter((d): d is { x: number; y: number } => d !== null),
  ),
);

function line(ds: Array<{ x: number; y: number }>): string {
  if (ds.length === 0) return '';
  return ds.map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.x} ${d.y}`).join(' ');
}

function monthShort(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-PH', { month: 'short' });
}

const changeLabel = computed(() => {
  if (props.changePct === null) return '—';
  const rounded = Math.round(props.changePct);
  if (rounded === 0) return 'flat vs last month';
  return `${rounded < 0 ? '▼' : '▲'} ${Math.abs(rounded)}% vs last month`;
});

// ── E3 scrub + tooltip ──
const scrub = useChartScrub(() => props.points.length);

function pesoWhole(centavos: number): string {
  const sign = centavos < 0 ? '−' : '';
  return `${sign}₱ ${Math.round(Math.abs(centavos) / 100).toLocaleString('en-PH')}`;
}
function monthYear(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
}

/** The selected point in both viewBox coords (marker/dot) and % (tooltip), or null. */
const selected = computed(() => {
  const i = scrub.selected.value;
  if (i === null) return null;
  const p = props.points[i];
  const d = dots.value[i];
  if (!p || !d) return null;
  return { month: p.month, value: p.value, dx: d.x, dy: d.y, xPct: (d.x / W) * 100, yPct: (d.y / H) * 100 };
});
const tooltipText = computed(() =>
  selected.value ? `${monthYear(selected.value.month)} · ${pesoWhole(selected.value.value)}` : '',
);
const ariaText = computed(() => tooltipText.value || props.label);
</script>

<template>
  <section class="line-chart" :aria-label="label">
    <div class="head">
      <span class="tag mono">{{ label }}</span>
      <span class="change mono" :class="{ up: (changePct ?? 0) > 0, down: (changePct ?? 0) < 0 }">
        {{ changeLabel }}
      </span>
    </div>

    <div class="host">
      <svg
        class="plot"
        :viewBox="`0 0 ${W} ${H}`"
        preserveAspectRatio="none"
        role="slider"
        tabindex="0"
        :aria-label="label"
        :aria-valuemin="0"
        :aria-valuemax="Math.max(0, points.length - 1)"
        :aria-valuenow="scrub.valueNow.value"
        :aria-valuetext="ariaText"
        @pointerdown="scrub.onPointerDown"
        @pointermove="scrub.onPointerMove"
        @pointerup="scrub.onPointerUp"
        @pointercancel="scrub.onPointerUp"
        @keydown="scrub.onKeydown"
      >
        <line v-if="selected" class="marker" :x1="selected.dx" :x2="selected.dx" :y1="PAD_T" :y2="H - PAD_B" />
        <path v-if="comparisonPath" class="cmp" :d="comparisonPath" />
        <path v-if="solidPath" class="main" :d="solidPath" />
        <path v-if="partialPath" class="main partial" :d="partialPath" />
        <circle
          v-for="(d, i) in dots"
          :key="i"
          :cx="d.x"
          :cy="d.y"
          :r="d.partial ? 3 : 2.4"
          class="dot"
          :class="{ hollow: d.partial }"
        />
        <circle v-if="selected" class="sel" :cx="selected.dx" :cy="selected.dy" r="4" />
      </svg>

      <ChartTooltip
        :visible="selected !== null"
        :x-pct="selected?.xPct ?? 0"
        :y-pct="selected?.yPct ?? 0"
      >
        {{ tooltipText }}
      </ChartTooltip>
    </div>

    <div class="axis">
      <span v-for="p in points" :key="p.month" class="mono" :class="{ now: p.partial }">{{ monthShort(p.month) }}</span>
    </div>
  </section>
</template>

<style scoped>
.line-chart {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px;
  background: var(--color-surface);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.tag {
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-textDim);
}
.change {
  font-size: 9px;
  font-weight: 700;
  color: var(--color-textDim);
}
.change.up {
  color: var(--color-accentText); /* saving more is the good direction (§5 money moment) */
}
.change.down {
  color: #b3282d;
}
.host {
  position: relative;
  margin-top: 8px;
}
.plot {
  width: 100%;
  height: 92px;
  overflow: visible;
  touch-action: none; /* let the scrub own horizontal drag, not the page scroll */
  cursor: pointer;
  border-radius: 6px;
  outline: none;
}
.plot:focus-visible {
  box-shadow: 0 0 0 2px var(--color-primary);
}
.marker {
  stroke: var(--color-primary);
  stroke-width: 1;
  stroke-dasharray: 2 2;
  opacity: 0.5;
  vector-effect: non-scaling-stroke;
}
.sel {
  fill: var(--color-surface);
  stroke: var(--color-primary);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.cmp {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 1.4;
  stroke-dasharray: 3 3;
  opacity: 0.5;
  vector-effect: non-scaling-stroke;
}
.main {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.main.partial {
  stroke-dasharray: 3 3;
}
.dot {
  fill: var(--color-accent);
}
.dot.hollow {
  fill: var(--color-surface);
  stroke: var(--color-accent);
  stroke-width: 1.6;
}
.axis {
  display: flex;
  margin-top: 6px;
}
.axis span {
  flex: 1;
  text-align: center;
  font-size: 8px;
  color: var(--color-textDim);
}
.axis span.now {
  color: var(--color-text);
  font-weight: 700;
}
</style>
