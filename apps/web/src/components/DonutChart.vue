<script setup lang="ts">
// Pure presentation: fractions/colors/labels come in as props (money math stays in domain/).
import { computed } from 'vue';

export interface DonutSlice {
  key: string;
  fraction: number; 
  color: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    slices: DonutSlice[];
    size?: number; // css px
    trackColor?: string;
  }>(),
  { size: 180, trackColor: '#E6EAF1' },
);

const emit = defineEmits<{ select: [key: string] }>();

// Wireframe A1 ring proportions: 150px outer / 104px inner ≈ 0.69.
const R_OUTER = 50;
const R_INNER = 34.5;

function point(radius: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // 0° = top, clockwise
  return { x: 50 + radius * Math.cos(rad), y: 50 + radius * Math.sin(rad) };
}

/** Annular sector path from startDeg to endDeg (clockwise). */
function arcPath(startDeg: number, endDeg: number): string {
  const sweep = Math.min(endDeg - startDeg, 359.98); // full circle would collapse to nothing
  const end = startDeg + sweep;
  const large = sweep > 180 ? 1 : 0;
  const o1 = point(R_OUTER, startDeg);
  const o2 = point(R_OUTER, end);
  const i2 = point(R_INNER, end);
  const i1 = point(R_INNER, startDeg);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ');
}

const arcs = computed(() => {
  let cursor = 0;
  return props.slices
    .filter((s) => s.fraction > 0)
    .map((s) => {
      const start = cursor * 360;
      cursor = Math.min(cursor + s.fraction, 1);
      return { ...s, d: arcPath(start, cursor * 360) };
    });
});
</script>

<template>
  <div class="donut" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg viewBox="0 0 100 100" role="img" aria-label="Spend by category">
      <circle cx="50" cy="50" :r="(R_OUTER + R_INNER) / 2" fill="none" :stroke="trackColor" :stroke-width="R_OUTER - R_INNER" />
      <path
        v-for="a in arcs"
        :key="a.key"
        :d="a.d"
        :fill="a.color"
        class="slice"
        role="button"
        tabindex="0"
        :aria-label="a.label"
        @click="emit('select', a.key)"
        @keyup.enter="emit('select', a.key)"
      />
    </svg>
    <div class="center">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.donut {
  position: relative;
}
.donut svg {
  display: block;
  width: 100%;
  height: 100%;
}
.slice {
  cursor: pointer;
  outline: none;
}
.slice:hover,
.slice:focus-visible {
  opacity: 0.85;
}
.center {
  position: absolute;
  inset: 16%;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  text-align: center;
  pointer-events: none;
}
</style>
