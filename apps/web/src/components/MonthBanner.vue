<script setup lang="ts">
// Wireframe A1b — the month calendar as a banner OVER the page content:
// no dim, no push-down (owner-decided). Cells/levels come in from domain/calendar.
import { computed } from 'vue';
import type { MonthDayCell } from '../domain/calendar';

const props = withDefaults(
  defineProps<{
    cells: MonthDayCell[];
    /** ISO dates carrying a due (§7.5) — B6 fills this; empty until then. */
    dueDates?: string[];
    selectedDate: string | null;
  }>(),
  { dueDates: () => [] },
);

const emit = defineEmits<{ select: [date: string]; 'whole-month': []; dismiss: [] }>();

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Monday-start (§3 ISO weeks)

const dues = computed(() => new Set(props.dueDates));

const selectedLabel = computed(() => {
  if (props.selectedDate === null) return null;
  const [y, m, d] = props.selectedDate.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
});

function cellLabel(cell: MonthDayCell): string {
  if (cell.date === null) return '';
  const [y, m, d] = cell.date.split('-').map(Number);
  const day = new Date(y!, m! - 1, d!).toLocaleDateString('en-PH', { month: 'long', day: 'numeric' });
  const spend = cell.spend === 0 ? 'no spend' : `₱${(cell.spend / 100).toLocaleString('en-PH')} spent`;
  return `${day} — ${spend}`;
}
</script>

<template>
  <div class="banner" @pointerdown.stop>
    <div class="weekdays">
      <span v-for="(w, i) in WEEKDAYS" :key="i" :class="['weekday', 'mono', { weekend: i >= 5 }]">{{ w }}</span>
    </div>

    <div class="grid">
      <template v-for="(cell, i) in cells" :key="cell.date ?? `blank-${i}`">
        <span v-if="cell.date === null" class="blank"></span>
        <button
          v-else
          type="button"
          :class="['cell', { today: cell.isToday, future: cell.isFuture, selected: cell.date === selectedDate }]"
          :aria-label="cellLabel(cell)"
          :aria-pressed="cell.date === selectedDate"
          @click="emit('select', cell.date!)"
        >
          <span v-if="dues.has(cell.date)" class="due-dot" aria-hidden="true"></span>
          <span class="day">{{ cell.day }}</span>
          <span :class="['bar', `level-${cell.level}`]" aria-hidden="true"></span>
        </button>
      </template>
    </div>

    <div class="legend">
      <span class="legend-item"><i class="swatch level-heavy"></i>heavy</span>
      <span class="legend-item"><i class="swatch level-light"></i>light</span>
      <span class="legend-item"><i class="swatch level-over"></i>over cap</span>
      <span class="legend-item"><i class="swatch dot"></i>due</span>
    </div>

    <div class="actions">
      <button type="button" class="action whole" @click="emit('whole-month')">Whole month</button>
      <button
        type="button"
        class="action show"
        :disabled="selectedDate === null"
        @click="selectedDate && emit('select', selectedDate)"
      >
        {{ selectedLabel ? `Show ${selectedLabel}` : 'Pick a day' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.banner {
  /* Anchored to the sticky header, so it spans the screen (A1b) rather than the chip. */
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 20;
  margin-top: 2px;
  border-radius: 16px;
  /* Dark mode can't separate this with a shadow (invisible on dark) — the surface fill
     plus a lighter border does the work; see PROGRESS 2026-07-21 E2. */
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  padding: 12px 12px 13px;
  box-shadow: 0 16px 40px rgba(22, 33, 58, 0.22), 0 3px 10px rgba(22, 33, 58, 0.1);
  animation: banner-drop 300ms cubic-bezier(0.41, -0.86, 0.76, 1.89); /* §5 overshoot spring */
  transform-origin: top center;
}
@keyframes banner-drop {
  from {
    opacity: 0;
    transform: translateY(-10px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.weekdays,
.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}
.weekdays {
  margin-bottom: 6px;
}
.weekday {
  text-align: center;
  font-size: 9px;
  color: var(--color-textDim);
}
.weekday.weekend {
  opacity: 0.65;
}
.blank {
  height: 34px;
}
.cell {
  position: relative;
  min-width: 0;
  min-height: 34px;
  height: 34px;
  padding: 0;
  border-radius: 8px;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.cell.today {
  background: var(--color-primary);
}
.cell.selected {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
.day {
  font-size: 10px;
  line-height: 1;
  color: var(--color-text);
}
.cell.future .day {
  color: var(--color-textDim);
  opacity: 0.75;
}
.cell.today .day {
  color: #fff;
  font-weight: 700;
}
.bar {
  width: 13px;
  height: 2.5px;
  border-radius: 2px;
  background: transparent;
}
.level-light {
  background: #b7c9e8;
}
.level-heavy {
  background: var(--color-primary);
}
.level-over {
  background: var(--color-accent);
}
.cell.today .level-heavy {
  background: #fff; /* navy-on-navy would vanish */
}
.due-dot {
  position: absolute;
  top: 3px;
  right: 4px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-accent);
}
.legend {
  display: flex;
  gap: 9px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 10px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 9px;
  color: var(--color-textDim);
}
.swatch {
  width: 11px;
  height: 2.5px;
  border-radius: 2px;
  display: block;
}
.swatch.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-accent);
}
.actions {
  display: flex;
  gap: 7px;
  margin-top: 11px;
  padding-top: 11px;
  border-top: 1px solid var(--color-muted);
}
.action {
  flex: 1;
  min-height: 34px;
  border-radius: 17px;
  font-size: 11px;
  font-weight: 600;
}
.action.whole {
  background: var(--color-muted);
}
.action.show {
  background: var(--color-primary);
  color: #fff;
  font-weight: 700;
}
.action.show:disabled {
  opacity: 0.45;
  cursor: default;
}
@media (prefers-reduced-motion: reduce) {
  .banner {
    animation: none;
  }
}
</style>
