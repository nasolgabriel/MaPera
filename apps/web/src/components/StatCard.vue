<script setup lang="ts">
// §6.4 single-figure stat card (savings-rate + spend-vs-budget). Presentation only —
// the value/sub strings and the already-computed delta % arrive as props (§4).
import { computed } from 'vue';

const props = defineProps<{
  label: string;
  value: string;
  sub?: string;
  /** Signed % change vs last month; null → "—" (invariant 5 / §8.7 zero-guard). */
  delta?: number | null;
  /** Which direction is the good one, for coloring the arrow. Defaults to up = good. */
  goodDirection?: 'up' | 'down';
}>();

const good = computed(() => props.goodDirection ?? 'up');

const deltaLabel = computed(() => {
  if (props.delta === null || props.delta === undefined) return null;
  const rounded = Math.round(props.delta);
  if (rounded === 0) return { text: 'no change', tone: 'flat' as const };
  const up = rounded > 0;
  const isGood = (up && good.value === 'up') || (!up && good.value === 'down');
  return { text: `${up ? '▲' : '▼'} ${Math.abs(rounded)}% vs last month`, tone: isGood ? 'good' : 'bad' as const };
});
</script>

<template>
  <div class="stat-card">
    <span class="label mono">{{ label }}</span>
    <span class="value amount">{{ value }}</span>
    <span v-if="sub" class="sub mono">{{ sub }}</span>
    <span v-if="deltaLabel" class="delta mono" :class="deltaLabel.tone">{{ deltaLabel.text }}</span>
  </div>
</template>

<style scoped>
.stat-card {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.label {
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-textDim);
}
.value {
  font-size: 20px;
  font-weight: 800;
  color: var(--color-text);
}
.sub {
  font-size: 10px;
  color: var(--color-textDim);
}
.delta {
  font-size: 9px;
  font-weight: 700;
  color: var(--color-textDim);
}
.delta.good {
  color: var(--color-accentText); /* the good direction is a money moment (§5) */
}
.delta.bad {
  color: #b3282d;
}
</style>
