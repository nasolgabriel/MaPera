<script setup lang="ts">
// §6.4 spend-by-month / net bars. Presentation only — the monthly series arrives as a
// prop (money math lives in domain/statistics + the store, §4). Handles signed values so
// the Net tab (free_cash_flow, which can go negative) shares one component with the
// positive-only expense bars. The live partial month is drawn outlined and excluded from
// the headline change (§8.7).
import { computed, onMounted, ref } from 'vue';
import { prefersReducedMotion, useChartScrub } from '../composables/useChartScrub';
import ChartTooltip from './ChartTooltip.vue';
import type { SeriesPoint } from '../domain/statistics';

const props = defineProps<{
  points: SeriesPoint[];
  label: string;
  /** mom_change of the last two COMPLETED months; null → "—". */
  changePct: number | null;
}>();

const W = 300;
const H = 84;
const PAD_T = 8;
const PAD_B = 6;

const geometry = computed(() => {
  const vals = props.points.map((p) => p.value);
  const maxPos = Math.max(0, ...vals);
  const maxNeg = Math.max(0, ...vals.map((v) => -v));
  const unit = (H - PAD_T - PAD_B) / (maxPos + maxNeg || 1);
  const zeroY = PAD_T + maxPos * unit;
  const n = props.points.length || 1;
  const slot = W / n;
  const barW = slot * 0.52;
  const bars = props.points.map((p, i) => {
    const h = Math.abs(p.value) * unit;
    return {
      month: p.month,
      partial: p.partial,
      negative: p.value < 0,
      x: i * slot + slot / 2 - barW / 2,
      w: barW,
      y: p.value >= 0 ? zeroY - h : zeroY,
      /** never fully invisible for a nonzero month */
      h: p.value === 0 ? 0 : Math.max(1.5, h),
    };
  });
  return { bars, zeroY, hasNegative: maxNeg > 0 };
});

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

// Reveal: bars grow up from the baseline, staggered (instant under reduced motion).
const revealed = ref(false);
onMounted(() => {
  if (prefersReducedMotion()) {
    revealed.value = true;
    return;
  }
  requestAnimationFrame(() => {
    revealed.value = true;
  });
});

function pesoWhole(centavos: number): string {
  const sign = centavos < 0 ? '−' : '';
  return `${sign}₱ ${Math.round(Math.abs(centavos) / 100).toLocaleString('en-PH')}`;
}
function monthYear(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
}

/** Selected bar in viewBox coords (marker/center) + % (tooltip), or null. */
const selected = computed(() => {
  const i = scrub.selected.value;
  if (i === null) return null;
  const p = props.points[i];
  const b = geometry.value.bars[i];
  if (!p || !b) return null;
  const cx = b.x + b.w / 2;
  const topY = Math.min(b.y, geometry.value.zeroY);
  return { index: i, month: p.month, value: p.value, cx, topY, xPct: (cx / W) * 100, yPct: (topY / H) * 100 };
});
const tooltipText = computed(() =>
  selected.value ? `${monthYear(selected.value.month)} · ${pesoWhole(selected.value.value)}` : '',
);
const ariaText = computed(() => tooltipText.value || props.label);
</script>

<template>
  <section class="month-bars" :aria-label="label">
    <div class="head">
      <span class="tag mono">{{ label }}</span>
      <span class="change mono">{{ changeLabel }}</span>
    </div>

    <div class="host" :class="{ revealed }">
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
        :class="{ active: scrub.selected.value !== null }"
        @pointerdown="scrub.onPointerDown"
        @pointermove="scrub.onPointerMove"
        @pointerup="scrub.onPointerUp"
        @pointercancel="scrub.onPointerUp"
        @keydown="scrub.onKeydown"
      >
        <line v-if="geometry.hasNegative" class="zero" :x1="0" :x2="W" :y1="geometry.zeroY" :y2="geometry.zeroY" />
        <line
          v-if="selected"
          class="marker"
          :x1="0"
          :x2="0"
          :y1="0"
          :y2="H"
          :style="{ transform: `translateX(${selected.cx}px)` }"
        />
        <rect
          v-for="(b, i) in geometry.bars"
          :key="b.month"
          :x="b.x"
          :y="b.y"
          :width="b.w"
          :height="b.h"
          rx="1.5"
          class="bar"
          :class="{ negative: b.negative, partial: b.partial, selected: selected?.index === i }"
          :style="{ transitionDelay: revealed ? `${i * 35}ms` : '0ms' }"
        />
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
.month-bars {
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
.host {
  position: relative;
  margin-top: 8px;
  opacity: 0;
  transition: opacity var(--dur-reveal) var(--ease-standard);
}
.host.revealed {
  opacity: 1;
}
.plot {
  width: 100%;
  height: 84px;
  touch-action: none; /* the scrub owns horizontal drag, not page scroll */
  cursor: pointer;
  border-radius: 6px;
  outline: none;
  transition: filter var(--dur-press) var(--ease-standard);
}
.plot.active {
  filter: brightness(1.02);
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
  transition: transform var(--dur-move) var(--ease-standard); /* glide to follow the finger */
}
.bar {
  fill: var(--color-primary);
  transform: scaleY(0);
  transform-box: fill-box;
  transform-origin: bottom; /* grow up from the baseline */
  transition:
    transform var(--dur-reveal) var(--ease-spring),
    fill var(--dur-move) var(--ease-standard);
}
.host.revealed .bar {
  transform: scaleY(1);
}
.bar.selected {
  fill: var(--color-accent); /* selected month = a money moment (§5); no cap semantic here */
}
.bar.negative {
  fill: #b3282d;
  transform-origin: top; /* negatives hang from the zero line — grow downward */
}
.bar.selected.negative {
  fill: var(--color-accent);
}
.bar.partial {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 1.4;
  stroke-dasharray: 2.5 2.5;
  vector-effect: non-scaling-stroke;
}
.bar.partial.negative {
  stroke: #b3282d;
}
.bar.partial.selected {
  stroke: var(--color-accent); /* keep the selected accent even on the outlined live month */
}
.zero {
  stroke: var(--color-border);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
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
