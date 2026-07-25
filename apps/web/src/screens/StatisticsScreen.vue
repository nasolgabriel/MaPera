<script setup lang="ts">
// §6.4 Statistics — segmented Savings / Budget / Net tabs. One question per chart; every
// number comes from the store's domain-wired computeds (§4: no math in the .vue). The live
// partial month is drawn dashed/hollow and excluded from the headline change (§8.7).
import { computed, onMounted, ref } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import LineChart from '../components/LineChart.vue';
import MonthBars from '../components/MonthBars.vue';
import StatCard from '../components/StatCard.vue';

const store = useLedgerStore();

type Tab = 'savings' | 'budget' | 'net';
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'savings', label: 'Savings' },
  { id: 'budget', label: 'Budget' },
  { id: 'net', label: 'Net' },
];
const tab = ref<Tab>('savings'); // §6.4: Savings tab first

// ── display formatting only (§3: format at display time) ──
function pesoWhole(centavos: number): string {
  const sign = centavos < 0 ? '−' : '';
  return `${sign}₱ ${Math.round(Math.abs(centavos) / 100).toLocaleString('en-PH')}`;
}

/** Savings-rate card (§8.2 / §7.4): pct + level, or a nudge when there's no income (invariant 5). */
const rateCard = computed(() => {
  const r = store.savingsRateInfo;
  if (r === null) return { value: '—', sub: 'no income this month' };
  const pct = r.pct.toFixed(r.pct % 1 === 0 ? 0 : 1);
  return { value: `${pct}%`, sub: `${r.level}${r.capped ? ' · capped' : ''}` };
});

/** Spend-vs-budget card (§8.4): "8% over" / "12% under", or "—" without caps. */
const vsBudgetCard = computed(() => {
  const v = store.spendVsBudget;
  if (v === null) return { value: '—', sub: 'no caps set this month' };
  const r = Math.round(v);
  if (r === 0) return { value: 'On budget', sub: 'spent = caps' };
  return { value: `${Math.abs(r)}% ${r > 0 ? 'over' : 'under'}`, sub: r > 0 ? 'over your caps' : 'under your caps' };
});

/** total_saved right now — the Savings line's current figure. */
const totalSavedText = computed(() => pesoWhole(store.totalSavedAmount));

onMounted(async () => {
  if (!store.loaded) await store.load();
});
</script>

<template>
  <main class="screen">
    <h1 class="title">Statistics</h1>

    <!-- Segmented tabs (§6.4) -->
    <div class="tabs" role="tablist" aria-label="Statistics view">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="tab"
        role="tab"
        :aria-selected="tab === t.id"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- SAVINGS tab -->
    <section v-if="tab === 'savings'" class="panel">
      <p class="question mono">Is my money growing?</p>
      <LineChart
        :points="store.savingsTrend"
        :comparison="store.savingsTrendComparison"
        label="Total saved"
        :change-pct="store.savingsTrendChange"
      />
      <p class="figure amount">{{ totalSavedText }} <span class="figure-sub mono">saved now</span></p>

      <div class="cards">
        <StatCard
          label="Savings rate"
          :value="rateCard.value"
          :sub="rateCard.sub"
          :delta="store.savingsRateDelta"
          good-direction="up"
        />
        <StatCard
          label="Spend vs budget"
          :value="vsBudgetCard.value"
          :sub="vsBudgetCard.sub"
        />
      </div>

      <p class="question mono">How much did I spend each month?</p>
      <MonthBars :points="store.expenseTrend" label="Spend by month" :change-pct="store.expenseTrendChange" />
    </section>

    <!-- BUDGET tab -->
    <section v-else-if="tab === 'budget'" class="panel">
      <p class="question mono">Am I over or under budget?</p>
      <StatCard
        label="Spend vs budget"
        :value="vsBudgetCard.value"
        :sub="vsBudgetCard.sub"
      />
      <p class="question mono">How much did I spend each month?</p>
      <MonthBars :points="store.expenseTrend" label="Spend by month" :change-pct="store.expenseTrendChange" />
    </section>

    <!-- NET tab -->
    <section v-else class="panel">
      <p class="question mono">After spending and saving, what's left?</p>
      <MonthBars :points="store.netTrend" label="Free cash flow" :change-pct="store.netTrendChange" />
      <p class="note mono">Free cash flow = income − expenses − savings. Below the line = a month you spent or saved more than you earned.</p>
    </section>
  </main>
</template>

<style scoped>
.screen {
  max-width: 480px;
  margin: 0 auto;
  padding: 12px 16px calc(104px + var(--safe-bottom));
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--color-muted);
  border-radius: 12px;
}
.tab {
  flex: 1;
  min-height: 36px;
  border-radius: 9px;
  background: transparent;
  color: var(--color-textDim);
  font-size: 12px;
  font-weight: 700;
}
.tab.active {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: 0 1px 2px rgba(22, 33, 58, 0.12);
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.question {
  margin: 4px 0 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text);
}
.figure {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--color-accentText); /* saffron money moment (§5) */
}
.figure-sub {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-textDim);
}
.cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.note {
  margin: 2px 0 0;
  font-size: 10px;
  line-height: 1.5;
  color: var(--color-textDim);
}
</style>
