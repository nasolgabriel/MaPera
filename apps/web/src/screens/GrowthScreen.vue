<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import BackButton from '../components/BackButton.vue';
import { useReveal } from '../composables/useReveal';
import SweepSheet from '../components/SweepSheet.vue';
import type { MilestoneRow } from '../domain/gamification';

const store = useLedgerStore();

function pesoWhole(centavos: number): string {
  const abs = Math.abs(centavos);
  const opts = abs % 100 === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `${centavos < 0 ? '−' : ''}₱${(abs / 100).toLocaleString('en-PH', opts)}`;
}

function milestoneLabel(amount: number): string {
  const pesos = amount / 100;
  return pesos >= 1000 ? `₱${pesos / 1000}k` : `₱${pesos}`;
}

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-PH', { month: 'long' });
}

const streakLabel = computed(() => {
  const n = store.savingStreak.weeks;
  return `${n} ${n === 1 ? 'week' : 'weeks'}`;
});

const revealed = useReveal(() => store.streakWeekBars.length > 0);

const rateLine = computed(() => {
  const cur = store.savingsRateInfo;
  if (cur === null) return 'no income logged this month';
  const pct = cur.pct.toFixed(cur.pct % 1 === 0 ? 0 : 1);
  const delta = store.savingsRateDelta;
  if (delta === null) return `${pct}% of income`;
  const rounded = Math.round(delta);
  if (rounded === 0) return `${pct}% of income · same as last month`;
  return `${pct}% of income · ${rounded > 0 ? '▲' : '▼'} ${Math.abs(rounded)}% vs last month`;
});

function milestoneMeta(row: MilestoneRow): string {
  if (row.reached) {
    if (row.monthsTaken === null) return 'reached';
    if (row.monthsTaken === 0) return 'reached in the first month';
    return `took ${row.monthsTaken} ${row.monthsTaken === 1 ? 'month' : 'months'}`;
  }
  if (row.next && row.toGo !== null) return `${pesoWhole(row.toGo)} to go`;
  return 'locked';
}

const sweeping = ref(false);

async function onSweep(sourceId: string, destinationId: string): Promise<void> {
  await store.sweepUnderBudget(sourceId, destinationId);
  sweeping.value = false;
}

onMounted(async () => {
  if (!store.loaded) await store.load();
});
</script>

<template>
  <main class="screen">
    <header class="screen-head">
      <BackButton to="/savings" label="Back to Savings" />
      <h1 class="title">Growth</h1>
    </header>

    <section class="card">
      <div class="card-head">
        <span class="card-title">Saving streak</span>
        <span class="streak-count amount">{{ streakLabel }}</span>
      </div>
      <div v-if="store.streakWeekBars.length > 0" class="bars" :class="{ revealed }">
        <div
          v-for="(w, i) in store.streakWeekBars"
          :key="w.week"
          class="bar"
          :class="{ current: w.current, swept: w.swept }"
          :style="{ '--stagger': `${i * 35}ms` }"
          :title="`${w.week} · ${pesoWhole(w.sNet)} saved${w.swept ? ' · swept ×2' : ''}`"
        >
          <span v-if="w.swept" class="bar-badge mono">×2</span>
        </div>
      </div>
      <p v-else class="empty mono">No saving week yet — move any amount into savings to start one.</p>
      <p class="card-note mono">a week counts when you add to savings — not when you open the app</p>
    </section>

    <section class="card rate-card">
      <div class="rate-text">
        <span class="card-title">Savings rate · {{ monthName(store.liveMonth) }}</span>
        <span class="card-sub mono">{{ rateLine }}</span>
      </div>
      <span v-if="store.savingsRateInfo" class="level" :class="store.savingsRateInfo.level.toLowerCase()">
        {{ store.savingsRateInfo.level.toUpperCase() }}
      </span>
      <span v-else class="level none mono">—</span>
    </section>

    <section class="card">
      <span class="card-title">Milestones</span>
      <ul class="milestones">
        <li
          v-for="row in store.milestoneRows"
          :key="row.amount"
          class="milestone"
          :class="{ reached: row.reached, next: row.next, locked: !row.reached && !row.next }"
        >
          <span class="milestone-name">
            {{ milestoneLabel(row.amount) }}
            <span v-if="row.reached" class="check" aria-hidden="true">✓</span>
          </span>
          <span class="milestone-meta mono">{{ milestoneMeta(row) }}</span>
        </li>
      </ul>
    </section>

    <section v-if="store.underBudgetSweep" class="sweep-card">
      <div class="sweep-text">
        <strong>
          {{ monthName(store.underBudgetSweep.month) }} ended
          {{ pesoWhole(store.underBudgetSweep.leftover) }} under budget.
        </strong>
        <span class="sweep-sub mono">sweep counts ×2 toward streak</span>
      </div>
      <button class="sweep-btn" @click="sweeping = true">Sweep it</button>
    </section>

    <SweepSheet
      v-if="sweeping && store.underBudgetSweep"
      :offer="store.underBudgetSweep"
      @confirm="onSweep"
      @close="sweeping = false"
    />
  </main>
</template>

<style scoped>
.screen {
  max-width: 480px;
  margin: 0 auto;
  padding: 12px 16px calc(104px + var(--safe-bottom));
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
}
.card {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.card-title {
  font-size: 12px;
  font-weight: 700;
}
.card-sub {
  font-size: 9px;
  color: var(--color-textDim);
}
.card-note {
  margin: 0;
  font-size: 8px;
  color: var(--color-textDim);
}
.streak-count {
  font-size: 13px;
  font-weight: 800;
  color: var(--color-accentText);
}
.bars {
  display: flex;
  gap: 5px;
}
.bar {
  position: relative;
  flex: 1;
  max-width: 42px;
  height: 26px;
  border-radius: 6px;
  background: var(--color-accent);
  transform: scaleY(0);
  transform-origin: bottom;
  transition: transform var(--dur-reveal) var(--ease-standard) var(--stagger, 0ms);
}
.bars.revealed .bar {
  transform: scaleY(1);
}
.bar.current {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
.bar-badge {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 700;
  color: #16213a;
}
.empty {
  margin: 0;
  font-size: 10px;
  color: var(--color-textDim);
}
.rate-card {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.rate-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.level {
  flex: none;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 800;
  color: #16213a;
}
.level.gold {
  background: var(--color-accent);
}
.level.silver {
  background: var(--color-muted);
  color: var(--color-text);
}
.level.bronze {
  background: var(--color-muted);
  color: var(--color-textDim);
}
.level.none {
  background: transparent;
  color: var(--color-textDim);
}
.milestones {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.milestone {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
}
.milestone.next .milestone-name {
  font-weight: 700;
}
.milestone.next .milestone-meta {
  color: var(--color-accentText);
}
.milestone.locked {
  color: var(--color-textDim);
  opacity: 0.7;
}
.milestone-meta {
  font-size: 9px;
  color: var(--color-textDim);
}
.check {
  color: #0d7a3f;
}
.sweep-card {
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-accent) 14%, var(--color-surface));
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
:root[data-theme='dark'] .sweep-card {
  background: color-mix(in srgb, var(--color-accent) 22%, var(--color-surface));
}
.sweep-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  line-height: 1.5;
  min-width: 0;
}
.sweep-sub {
  color: var(--color-textDim);
}
.sweep-btn {
  flex: none;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 16px;
  background: var(--color-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
</style>
