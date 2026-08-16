<script setup lang="ts">
// §6.4 Statistics — segmented Savings / Budget / Net tabs. One question per chart; every
// number comes from the store's domain-wired computeds (§4: no math in the .vue). The live
// partial month is drawn dashed/hollow and excluded from the headline change (§8.7).
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLedgerStore } from '../stores/ledger';
import { hasFailingCheck } from '../domain/credit';
import LineChart from '../components/LineChart.vue';
import MonthBars from '../components/MonthBars.vue';
import StatCard from '../components/StatCard.vue';

const store = useLedgerStore();
const router = useRouter();

type Tab = 'savings' | 'budget' | 'net';
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'savings', label: 'Savings' },
  { id: 'budget', label: 'Budget' },
  { id: 'net', label: 'Net' },
];
const tab = ref<Tab>('savings'); // §6.4: Savings tab first
const activeIndex = computed(() => TABS.findIndex((t) => t.id === tab.value));
// Panels slide in the direction of travel (forward = from the right) for spatial continuity (§7).
const dir = ref<'slide-next' | 'slide-prev'>('slide-next');
function selectTab(id: Tab): void {
  const to = TABS.findIndex((t) => t.id === id);
  dir.value = to >= activeIndex.value ? 'slide-next' : 'slide-prev';
  tab.value = id;
}

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

/** §7.8 card-health link on the Budget tab (the module map files card health under Statistics;
 *  the §6.4 tab set is DECIDED at three, so this is a row into the D3 screen, not a 4th tab). */
const cardLink = computed(() => {
  const cards = store.creditCardsView;
  if (cards.length === 0) return null;
  const failing = cards.filter(hasFailingCheck).length;
  if (cards.length === 1) {
    const c = cards[0]!;
    return { name: c.account.name, status: failing > 0 ? 'needs attention' : c.healthy ? 'card healthy' : 'needs data', bad: failing > 0 };
  }
  return {
    name: `${cards.length} cards`,
    status: failing > 0 ? `${failing} need attention` : 'all healthy',
    bad: failing > 0,
  };
});

onMounted(async () => {
  if (!store.loaded) await store.load();
});
</script>

<template>
  <main class="screen">
    <h1 class="title">Statistics</h1>

    <!-- Segmented tabs (§6.4) — a sliding pill tracks the active tab -->
    <div class="tabs" role="tablist" aria-label="Statistics view">
      <span class="tab-indicator" :style="{ '--i': activeIndex }" aria-hidden="true"></span>
      <button
        v-for="t in TABS"
        :key="t.id"
        class="tab"
        role="tab"
        :aria-selected="tab === t.id"
        :class="{ active: tab === t.id }"
        @click="selectTab(t.id)"
      >
        {{ t.label }}
      </button>
    </div>

    <Transition :name="dir" mode="out-in">
      <section class="panel" :key="tab">
        <!-- SAVINGS tab -->
        <template v-if="tab === 'savings'">
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
        </template>

        <!-- BUDGET tab -->
        <template v-else-if="tab === 'budget'">
          <p class="question mono">Am I over or under budget?</p>
          <StatCard
            label="Spend vs budget"
            :value="vsBudgetCard.value"
            :sub="vsBudgetCard.sub"
          />
          <p class="question mono">How much did I spend each month?</p>
          <MonthBars :points="store.expenseTrend" label="Spend by month" :change-pct="store.expenseTrendChange" />

          <!-- §7.8 credit-card health lives in this module — the panel itself is the D3 screen. -->
          <button v-if="cardLink" class="card-link" :class="{ bad: cardLink.bad }" @click="router.push('/card')">
            <span class="card-link-text">
              <span class="card-link-name">Card health · {{ cardLink.name }}</span>
              <span class="card-link-status mono">{{ cardLink.status }}</span>
            </span>
            <span class="card-link-chevron" aria-hidden="true">›</span>
          </button>
        </template>

        <!-- NET tab -->
        <template v-else>
          <p class="question mono">After spending and saving, what's left?</p>
          <MonthBars :points="store.netTrend" label="Free cash flow" :change-pct="store.netTrendChange" />
          <p class="note mono">Free cash flow = income − expenses − savings. Below the line = a month you spent or saved more than you earned.</p>
        </template>
      </section>
    </Transition>
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
  position: relative;
  display: flex;
  padding: 3px;
  background: var(--color-muted);
  border-radius: 12px;
}
/* The pill slides between the three equal slots — one shared element, not a fade per tab. */
.tab-indicator {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 6px) / 3);
  border-radius: 9px;
  background: var(--color-surface);
  box-shadow: 0 1px 2px rgba(22, 33, 58, 0.12);
  transform: translateX(calc(var(--i) * 100%));
  transition: transform var(--dur-open) var(--ease-spring);
}
.tab {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 36px;
  border-radius: 9px;
  background: transparent;
  color: var(--color-textDim);
  font-size: 12px;
  font-weight: 700;
  transition:
    color var(--dur-move) var(--ease-standard),
    transform var(--dur-press) var(--ease-standard);
}
.tab:active {
  transform: scale(0.96); /* press feedback (§7 scale-feedback) */
}
.tab.active {
  color: var(--color-primary);
}
/* Panel swap: slide in the travel direction + crossfade, exit faster than enter (§7). */
.slide-next-enter-active,
.slide-prev-enter-active {
  transition:
    opacity 240ms var(--ease-standard),
    transform 240ms var(--ease-standard);
}
.slide-next-leave-active,
.slide-prev-leave-active {
  transition:
    opacity 150ms var(--ease-standard),
    transform 150ms var(--ease-standard);
}
.slide-next-enter-from {
  opacity: 0;
  transform: translateX(14px);
}
.slide-next-leave-to {
  opacity: 0;
  transform: translateX(-14px);
}
.slide-prev-enter-from {
  opacity: 0;
  transform: translateX(-14px);
}
.slide-prev-leave-to {
  opacity: 0;
  transform: translateX(14px);
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
.card-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  text-align: left;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  padding: 9px 12px;
}
.card-link.bad {
  border-color: var(--color-danger); /* §7.8: a red check follows the card everywhere */
}
.card-link-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.card-link-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
}
.card-link-status {
  font-size: 9px;
  color: var(--color-textDim);
}
.card-link.bad .card-link-status {
  color: var(--color-danger);
}
.card-link-chevron {
  flex: none;
  font-size: 15px;
  color: var(--color-textDim);
}
</style>
