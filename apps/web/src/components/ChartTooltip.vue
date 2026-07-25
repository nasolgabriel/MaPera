<script setup lang="ts">
// Floating readout anchored at a chart point (E3). Positioned inside the chart's
// position:relative host from viewBox-derived percentages; clamps horizontally so the
// bubble never leaves the plot. Presentation only — content comes in via the slot.
import { computed } from 'vue';

const props = defineProps<{
  /** Point x as 0..100 % of the plot width. */
  xPct: number;
  /** Point y as 0..100 % of the plot height (bubble sits above it). */
  yPct: number;
  visible: boolean;
}>();

// Half the bubble's min-width as a % of a ~300px-wide plot, so it stays fully in view.
const CLAMP = 16;
const leftPct = computed(() => Math.min(100 - CLAMP, Math.max(CLAMP, props.xPct)));
/** Caret tracks the true point even when the bubble is clamped at an edge. */
const caretPct = computed(() => Math.min(100, Math.max(0, props.xPct - leftPct.value + 50)));
</script>

<template>
  <div
    v-if="visible"
    class="tooltip"
    role="status"
    :style="{ left: `${leftPct}%`, top: `${yPct}%` }"
  >
    <div class="bubble mono"><slot /></div>
    <span class="caret" :style="{ left: `${caretPct}%` }"></span>
  </div>
</template>

<style scoped>
.tooltip {
  position: absolute;
  transform: translate(-50%, calc(-100% - 9px));
  pointer-events: none;
  z-index: 2;
  animation: tip-in 120ms ease;
  /* Slide along as the scrub moves between months (the fade-in masks the first placement). */
  transition:
    left var(--dur-move) var(--ease-standard),
    top var(--dur-move) var(--ease-standard);
}
.bubble {
  min-width: 84px;
  white-space: nowrap;
  text-align: center;
  padding: 5px 8px;
  border-radius: 8px;
  background: #16213a; /* dark chip both themes, like the savings hero */
  color: #e7ecf5;
  font-size: 10px;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(16, 23, 37, 0.28);
}
.caret {
  position: absolute;
  bottom: -4px;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid #16213a;
}
@keyframes tip-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .tooltip {
    animation: none;
  }
}
</style>
