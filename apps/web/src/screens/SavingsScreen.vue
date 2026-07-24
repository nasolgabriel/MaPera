<script setup lang="ts">
// §6.3 Savings home (C1 wireframe): dark hero (total saved + this-month rate/level),
// savings-account rows, goals (ring + ₱-to-go + projected date + add).
// Streak/milestone = B12, auto-transfer badge = B6, investment value = B8 (all deferred).
// All money numbers come from the store's domain-wired computeds; the two domain helpers
// imported here are pure lookups, not math done in the .vue (§4).
import { computed, onMounted, ref } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import GoalRing from '../components/GoalRing.vue';
import AddToGoalSheet from '../components/AddToGoalSheet.vue';
import GoalEditorSheet from '../components/GoalEditorSheet.vue';
import { goalFraction, goalToGo } from '../domain/savings';
import type { Account, Goal } from '../db/repositories/types';

const store = useLedgerStore();

const TYPE_LABEL: Record<Account['type'], string> = {
  cash: 'cash', ewallet: 'e-wallet', bank: 'bank', investment: 'investment', credit_card: 'credit card',
};

// ── display formatting only (§3: format at display time) ──
function pesoWhole(centavos: number): string {
  const sign = centavos < 0 ? '−' : '';
  const abs = Math.abs(centavos);
  const opts = abs % 100 === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `${sign}₱ ${(abs / 100).toLocaleString('en-PH', opts)}`;
}

function balanceText(centavos: number): string {
  return (centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** 'YYYY-MM' → 'Nov 2026' (null → em dash). */
function monthText(month: string | null): string {
  if (month === null) return '—';
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
}

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`;
}

/** §6.3 auto-transfer badge — `auto ₱2,000 / 30th` from the B6 recurring engine, or null. */
function autoBadge(accountId: string): string | null {
  const t = store.autoTransferByAccount.get(accountId);
  if (!t) return null;
  return `auto ₱${(t.amount / 100).toLocaleString('en-PH', { maximumFractionDigits: 0 })} / ${ordinal(t.dueDay)}`;
}

const liveMonthLabel = new Date().toLocaleDateString('en-PH', { month: 'long' });

/** `15% · Gold` for the hero, or a nudge when there's no rate to show (invariant 5). */
const rateLine = computed(() => {
  const r = store.savingsRateInfo;
  if (r === null) return { text: 'set income to see your rate', muted: true };
  const pct = r.pct.toFixed(r.pct % 1 === 0 ? 0 : 1);
  return { text: `${pct}% of income · ${r.level}${r.capped ? ' (capped)' : ''}`, muted: false };
});

// ── sheets ──
const addingTo = ref<Goal | null>(null);
const editing = ref<Goal | null>(null);
const creating = ref(false);

function openAdd(goal: Goal): void {
  addingTo.value = goal;
}
async function onAddConfirm(sourceId: string, amount: number): Promise<void> {
  if (addingTo.value) await store.addToGoal(addingTo.value.id, sourceId, amount);
  addingTo.value = null;
}
function openEdit(goal: Goal): void {
  editing.value = goal;
}
function openCreate(): void {
  creating.value = true;
}
async function onGoalSave(goal: Goal): Promise<void> {
  await store.saveGoal(goal);
  editing.value = null;
  creating.value = false;
}
async function onGoalRemove(id: string): Promise<void> {
  await store.deleteGoal(id);
  editing.value = null;
}

onMounted(async () => {
  if (!store.loaded) await store.load();
});
</script>

<template>
  <main class="screen">
    <h1 class="title">Savings</h1>

    <!-- Hero: total saved (saffron) + this month's rate/level. Dark in both themes (C1). -->
    <section class="hero">
      <span class="hero-label mono">total saved</span>
      <span class="hero-amount amount">{{ pesoWhole(store.totalSavedAmount) }}</span>
      <span class="hero-rate mono" :class="{ muted: rateLine.muted }">
        Savings rate · {{ liveMonthLabel }}: {{ rateLine.text }}
      </span>
    </section>

    <!-- Savings-flagged accounts. Auto-transfer badge (B6) + investment value (B8) not shown yet. -->
    <ul class="accounts">
      <li
        v-for="row in store.savingsAccountsView"
        :key="row.account.id"
        class="acct"
        :style="{ borderLeftColor: row.account.essence_color }"
      >
        <div class="acct-info">
          <div class="acct-name">{{ row.account.name }}</div>
          <div class="acct-type mono">
            {{ TYPE_LABEL[row.account.type] }}<template v-if="autoBadge(row.account.id)"> · <span class="auto-badge">{{ autoBadge(row.account.id) }}</span></template>
          </div>
        </div>
        <div class="acct-balance" :style="{ color: row.account.essence_color }">
          {{ balanceText(row.balance) }}
        </div>
      </li>
      <li v-if="store.savingsAccountsView.length === 0" class="empty">
        No savings accounts yet.
      </li>
    </ul>

    <!-- Goals -->
    <div class="goals-head">
      <span class="section-label mono">goals</span>
      <button class="new-goal" @click="openCreate">+ New goal</button>
    </div>
    <ul class="goals">
      <li v-for="g in store.goals" :key="g.id" class="goal">
        <button class="goal-main" :aria-label="`Edit ${g.name}`" @click="openEdit(g)">
          <GoalRing :fraction="goalFraction(g)" :size="44" />
          <span class="goal-text">
            <span class="goal-name">{{ g.name }}</span>
            <span class="goal-meta mono">
              {{ pesoWhole(goalToGo(g)) }} to go · est. {{ monthText(store.goalProjections.get(g.id) ?? null) }}
            </span>
          </span>
        </button>
        <button class="goal-add" :aria-label="`Add to ${g.name}`" @click="openAdd(g)">+ add</button>
      </li>
      <li v-if="store.goals.length === 0" class="empty">
        No goals yet — tap “+ New goal”.
      </li>
    </ul>

    <AddToGoalSheet
      v-if="addingTo"
      :goal="addingTo"
      @confirm="onAddConfirm"
      @close="addingTo = null"
    />
    <GoalEditorSheet
      v-if="editing || creating"
      :goal="editing"
      @save="onGoalSave"
      @remove="onGoalRemove"
      @close="editing = null; creating = false"
    />
  </main>
</template>

<style scoped>
.screen {
  max-width: 480px;
  margin: 0 auto;
  /* clear the fixed 64px hub button + safe area, like BudgetScreen */
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
.hero {
  border-radius: 12px;
  background: #16213a; /* dark card both themes (C1, matches PaydaySplitSheet) */
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.hero-label {
  font-size: 9px;
  color: #8b97ad;
}
.hero-amount {
  font-size: 24px;
  font-weight: 800;
  color: #ffc93e; /* saffron money moment (§5) */
}
.hero-rate {
  font-size: 9px;
  color: #b7c2d6;
}
.hero-rate.muted {
  color: #8b97ad;
}
.accounts,
.goals {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.acct {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: 10px;
  padding: 9px 12px;
}
.acct-name {
  font-size: 12px;
  font-weight: 700;
}
.acct-type {
  font-size: 9px;
  color: var(--color-textDim);
}
.auto-badge {
  color: var(--color-accentText); /* saffron-dark: a money moment (§5) */
}
.acct-balance {
  font-family: 'Spline Sans Mono', monospace;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.goals-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
}
.section-label {
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-textDim);
}
.new-goal {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 12px;
  background: var(--color-muted);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 700;
}
.goal {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 9px 12px;
}
.goal-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  text-align: left;
}
.goal-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.goal-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
}
.goal-meta {
  font-size: 9px;
  color: var(--color-textDim);
}
.goal-add {
  flex: none;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 18px;
  background: var(--color-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.empty {
  padding: 12px 2px;
  font-size: 13px;
  color: var(--color-textDim);
}
</style>
