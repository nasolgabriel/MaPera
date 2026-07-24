<script setup lang="ts">
// Pure presentation: the progress fraction comes in as a prop (goal math lives in
// domain/savings). Single-value ring — DonutChart is annular/multi-slice, this is simpler.
// Matches the C1 wireframe: saffron progress on a muted track, % label in the hole.
import { computed } from 'vue';

const props = withDefaults(defineProps<{ fraction: number; size?: number }>(), { size: 44 });

const deg = computed(() => Math.round(Math.min(1, Math.max(0, props.fraction)) * 360));
const pct = computed(() => `${Math.round(Math.min(1, Math.max(0, props.fraction)) * 100)}%`);
</script>

<template>
  <div
    class="ring"
    role="img"
    :aria-label="`${pct} of goal`"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      background: `conic-gradient(var(--color-accent) 0 ${deg}deg, var(--color-muted) ${deg}deg 360deg)`,
    }"
  >
    <span class="hole mono">{{ pct }}</span>
  </div>
</template>

<style scoped>
.ring {
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hole {
  width: 68%;
  height: 68%;
  border-radius: 50%;
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 800;
  color: var(--color-text);
}
</style>
