<script setup lang="ts">
import { computed } from 'vue';
import { useReveal } from '../composables/useReveal';
import { essenceVars } from '../theme/essence';
import type { AccountSeries } from '../domain/statistics';

const props = defineProps<{ series: AccountSeries[]; label: string }>();

const W = 300;
const H = 70;
const PAD_X = 6;
const PAD_T = 8;
const PAD_B = 6;

const scale = computed(() => {
  const values = props.series.flatMap((s) => s.points.map((p) => p.value));
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const n = props.series[0]?.points.length ?? 0;
  const x = (i: number) => (n <= 1 ? W / 2 : PAD_X + (i * (W - 2 * PAD_X)) / (n - 1));
  const y = (v: number) => H - PAD_B - ((v - min) / span) * (H - PAD_T - PAD_B);
  return { x, y };
});

function path(dots: Array<{ x: number; y: number }>): string {
  return dots.map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.x} ${d.y}`).join(' ');
}

interface Line {
  id: string;
  name: string;
  vars: Record<string, string>;
  solid: string;
  partial: string;
}

const lines = computed<Line[]>(() =>
  props.series.map((s) => {
    const dots = s.points.map((p, i) => ({ x: scale.value.x(i), y: scale.value.y(p.value), partial: p.partial }));
    const completed = dots.filter((d) => !d.partial);
    const live = dots.find((d) => d.partial);
    const last = completed[completed.length - 1];
    return {
      id: s.account.id,
      name: s.account.name,
      vars: essenceVars(s.account.essence_color),
      solid: path(completed),
      partial: live && last ? `M ${last.x} ${last.y} L ${live.x} ${live.y}` : '',
    };
  }),
);

const revealed = useReveal(() => lines.value.length > 0);
</script>

<template>
  <section class="account-lines" :aria-label="label">
    <span class="tag mono">{{ label }}</span>

    <div class="host" :class="{ revealed }">
      <svg class="plot" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="label">
        <g v-for="l in lines" :key="l.id" class="essence" :style="l.vars">
          <path v-if="l.solid" class="line draw" :d="l.solid" />
          <path v-if="l.partial" class="line live" :d="l.partial" />
        </g>
      </svg>
    </div>

    <div class="legend">
      <span v-for="l in lines" :key="l.id" class="entry essence" :style="l.vars">
        <i class="dash" aria-hidden="true"></i>{{ l.name }}
      </span>
    </div>

    <span class="foot mono">each account in its essence colour · current month dashed, excluded from comparisons</span>
  </section>
</template>

<style scoped>
.account-lines {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px;
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tag {
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-textDim);
}
.host {
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity var(--dur-reveal) var(--ease-standard),
    transform var(--dur-reveal) var(--ease-standard);
}
.host.revealed {
  opacity: 1;
  transform: none;
}
.plot {
  width: 100%;
  height: 70px;
  overflow: visible;
}
.line {
  fill: none;
  stroke: var(--essence);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.live {
  stroke-dasharray: 5 4;
}
.draw {
  clip-path: inset(-4px calc(100% + 4px) -4px -4px);
  transition: clip-path var(--dur-reveal) var(--ease-standard);
}
.host.revealed .draw {
  clip-path: inset(-4px -4px -4px -4px);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.entry {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--color-textDim);
}
.dash {
  width: 14px;
  height: 3px;
  border-radius: 2px;
  background: var(--essence);
}
.foot {
  font-size: 8px;
  color: var(--color-textDim);
}
</style>
