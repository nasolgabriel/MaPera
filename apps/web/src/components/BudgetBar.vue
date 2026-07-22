<script setup lang="ts">
// §5 budget bar states: <80% primary · ≥80% saffron · >100% red (wireframe B1).
// `used` (%) comes from domain budgetUsed via the store — no money math here.
import { computed } from 'vue';

const props = defineProps<{
  label: string;
  spent: number; // centavos
  cap: number; // centavos
  used: number | null; // budget_used(c,t) %, null when cap 0 (§8.7 guard)
}>();

const WARN_AT = 80;

const state = computed(() => {
  if (props.used === null) return 'normal';
  if (props.used > 100) return 'over';
  if (props.used >= WARN_AT) return 'warn';
  return 'normal';
});

const fillWidth = computed(() => `${Math.min(props.used ?? 0, 100)}%`);

function pesoPlain(centavos: number): string {
  const opts = centavos % 100 === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return (centavos / 100).toLocaleString('en-PH', opts);
}
</script>

<template>
  <div class="budget-bar">
    <div class="head">
      <span class="label">{{ label }}</span>
      <span class="numbers mono">{{ pesoPlain(spent) }} / {{ pesoPlain(cap) }}</span>
    </div>
    <div class="track">
      <div :class="['fill', state]" :style="{ width: fillWidth }"></div>
    </div>
    <div v-if="used !== null && state !== 'normal'" :class="['note', 'mono', state]">
      {{ Math.round(used) }}% — {{ state === 'over' ? 'over' : `warning at ${WARN_AT}%` }}
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
}
.label {
  font-weight: 700;
}
.numbers {
  font-size: 11px;
}
.track {
  height: 8px;
  border-radius: 4px;
  background: var(--color-muted);
  margin-top: 5px;
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 4px;
  background: var(--color-primary);
}
.fill.warn {
  background: var(--color-accent);
}
.fill.over {
  background: var(--color-danger);
}
.note {
  font-size: 9px;
  margin-top: 3px;
}
.note.warn {
  color: var(--color-accentText);
}
.note.over {
  color: var(--color-danger);
}
</style>
