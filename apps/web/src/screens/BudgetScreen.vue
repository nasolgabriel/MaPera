<script setup lang="ts">
// recents (tap = edit, swipe-left = delete). Dues card lands in B6.
// All money numbers come from the store's domain-wired computeds.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLedgerStore } from '../stores/ledger';
import DonutChart from '../components/DonutChart.vue';
import type { DonutSlice } from '../components/DonutChart.vue';
import type { Transaction } from '../db/repositories/types';

const router = useRouter();
const store = useLedgerStore();

// Navy shade ramp for slices (wireframe A1); gray = uncategorized; saffron stays a money moment.
const SLICE_COLORS = ['#1E3A6E', '#46689C', '#7FA3E0', '#9DB9E7', '#B7C9E8', '#CEDAF0'];
const UNCATEGORIZED_COLOR = '#A3ACBD';
const UNCAT_KEY = '__uncategorized__';

const categoryName = computed(() => new Map(store.categories.map((c) => [c.id, c.name])));
const accountName = computed(() => new Map(store.accounts.map((a) => [a.id, a.name])));
const activeAccounts = computed(() => store.accounts.filter((a) => !a.archived));

const monthLabel = computed(() => {
  const [y, m] = store.month.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
});

function shiftMonth(delta: number): void {
  const [y, m] = store.month.split('-').map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  filter.value = null;
  void store.setMonth(next);
}

// Ring composition (geometry only — amounts come from store.spendSlices/capTotal).
// Total ring = max(Σ cap, Σ spend) so the track remainder = unspent budget.
const totalSpent = computed(() => store.spendSlices.reduce((sum, s) => sum + s.amount, 0));
const donutSlices = computed<DonutSlice[]>(() => {
  const total = Math.max(store.capTotal, totalSpent.value);
  if (total === 0) return [];
  return store.spendSlices.map((s, i) => ({
    key: s.category_id ?? UNCAT_KEY,
    fraction: s.amount / total,
    color: s.category_id === null ? UNCATEGORIZED_COLOR : SLICE_COLORS[i % SLICE_COLORS.length]!,
    label: `${s.category_id === null ? 'Uncategorized' : categoryName.value.get(s.category_id) ?? '?'} ${pesoWhole(s.amount)}`,
  }));
});

// ── display formatting only (§3: format at display time) ──
function pesoWhole(centavos: number): string {
  const sign = centavos < 0 ? '−' : '';
  const abs = Math.abs(centavos);
  const opts = abs % 100 === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `${sign}₱ ${(abs / 100).toLocaleString('en-PH', opts)}`;
}

function rowAmount(t: Transaction): string {
  const n = (t.amount / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (t.kind === 'expense') return `−${n}`;
  if (t.kind === 'income') return `+${n}`;
  return n; 
}

function rowTitle(t: Transaction): string {
  if (t.note) return t.note;
  if (t.kind === 'transfer') return `→ ${accountName.value.get(t.to_account_id ?? '') ?? 'transfer'}`;
  if (t.category_id) return categoryName.value.get(t.category_id) ?? 'Transaction';
  return t.kind === 'income' ? 'Income' : 'Expense';
}

// ── slice tap → filtered transactions (§6.1) ──
const filter = ref<{ id: string | null } | null>(null);

function onSliceSelect(key: string): void {
  const id = key === UNCAT_KEY ? null : key;
  filter.value = filter.value && filter.value.id === id ? null : { id };
  openId.value = null;
}

const filterLabel = computed(() =>
  filter.value === null
    ? null
    : filter.value.id === null
      ? 'Uncategorized'
      : categoryName.value.get(filter.value.id) ?? '?',
);

const visibleTxns = computed<Transaction[]>(() => {
  if (filter.value === null) return store.recent;
  const f = filter.value;
  return store.transactions.filter(
    (t) => t.kind === 'expense' && t.category_id === f.id && t.date.slice(0, 7) === store.month,
  );
});

// ── recents: swipe-left reveals Delete, tap edits ──
const REVEAL = 88; // px of delete button exposed
const openId = ref<string | null>(null);
const dragId = ref<string | null>(null);
const dragDx = ref(0);
let startX = 0;
let dragged = false;

function rowOffset(id: string): number {
  const base = openId.value === id ? -REVEAL : 0;
  const dx = dragId.value === id ? dragDx.value : 0;
  return Math.max(-REVEAL, Math.min(0, base + dx));
}

function onRowPointerDown(e: PointerEvent, id: string): void {
  dragId.value = id;
  dragDx.value = 0;
  startX = e.clientX;
  dragged = false;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onRowPointerMove(e: PointerEvent): void {
  if (dragId.value === null) return;
  const dx = e.clientX - startX;
  if (Math.abs(dx) > 8) dragged = true;
  dragDx.value = dx;
}

function onRowPointerUp(id: string): void {
  if (dragId.value === null) return;
  openId.value = rowOffset(id) < -REVEAL / 2 ? id : null;
  dragId.value = null;
  dragDx.value = 0;
}

function onRowClick(id: string): void {
  if (dragged) return; // swipe, not a tap
  if (openId.value !== null) {
    openId.value = null;
    return;
  }
  void router.push({ path: '/log', query: { txn: id } });
}

async function remove(id: string): Promise<void> {
  openId.value = null;
  await store.deleteTransaction(id);
}

onMounted(async () => {
  if (!store.loaded) await store.load();
});
</script>

<template>
  <main class="screen">
    <header class="top">
      <div class="month mono">
        <button class="month-arrow" aria-label="Previous month" @click="shiftMonth(-1)">‹</button>
        <span class="month-label">{{ monthLabel }}</span>
        <button class="month-arrow" aria-label="Next month" @click="shiftMonth(1)">›</button>
      </div>
      <button class="avatar" aria-label="Settings" @click="router.push('/more')"></button>
    </header>

    <div class="hero">
      <DonutChart :slices="donutSlices" :size="180" @select="onSliceSelect">
        <!-- Center tap → caps screen (B4). DonutChart's .center is pointer-events:none,
             so the button re-enables them for itself only — slices stay clickable. -->
        <button class="donut-center" aria-label="Budget caps" @click="router.push('/caps')">
          <template v-if="store.capTotal > 0">
            <span class="donut-tag mono">remaining</span>
            <span :class="['donut-value', 'amount', { over: store.remainingBudget < 0 }]">
              {{ pesoWhole(store.remainingBudget) }}
            </span>
            <span class="donut-sub mono">of {{ pesoWhole(store.capTotal) }}</span>
          </template>
          <template v-else>
            <span class="donut-tag mono">spent</span>
            <span class="donut-value amount">{{ pesoWhole(totalSpent) }}</span>
            <span class="donut-sub mono">no caps set</span>
          </template>
        </button>
      </DonutChart>
    </div>

    <div class="chips-scroll">
      <div
        v-for="a in activeAccounts"
        :key="a.id"
        class="acct-chip"
        :style="{ borderLeftColor: a.essence_color }"
      >
        <div class="acct-name">{{ a.name }}</div>
        <div class="acct-balance mono">{{ ((store.accountBalances.get(a.id) ?? 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) }}</div>
      </div>
    </div>

    <div class="list-head">
      <span v-if="filter === null" class="mono list-tag">recent</span>
      <template v-else>
        <span class="mono list-tag filtered">{{ filterLabel }} · {{ monthLabel }}</span>
        <button class="clear-filter" aria-label="Clear filter" @click="filter = null">✕</button>
      </template>
    </div>

    <ul class="txns">
      <li v-for="t in visibleTxns" :key="t.id" class="txn">
        <button class="txn-delete" :aria-label="`Delete ${rowTitle(t)}`" @click="remove(t.id)">Delete</button>
        <div
          class="txn-row"
          :class="{ dragging: dragId === t.id }"
          :style="{ transform: `translateX(${rowOffset(t.id)}px)` }"
          @pointerdown="onRowPointerDown($event, t.id)"
          @pointermove="onRowPointerMove"
          @pointerup="onRowPointerUp(t.id)"
          @pointercancel="onRowPointerUp(t.id)"
          @click="onRowClick(t.id)"
        >
          <span class="txn-title">{{ rowTitle(t) }}</span>
          <span :class="['txn-amount', 'mono', t.kind]">{{ rowAmount(t) }}</span>
        </div>
      </li>
      <li v-if="visibleTxns.length === 0" class="empty">
        {{ filter === null ? 'No transactions yet — tap the hub to log one.' : 'Nothing in this category this month.' }}
      </li>
    </ul>
  </main>
</template>

<style scoped>
.screen {
  max-width: 480px;
  margin: 0 auto;
  padding: 10px 16px 120px; /* bottom clears the fixed hub button */
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.month {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  color: var(--color-textDim);
}
.month-arrow {
  min-width: 44px;
  min-height: 44px;
  font-size: 18px;
  color: var(--color-text);
}
.month-label {
  min-width: 96px;
  text-align: center;
  color: var(--color-text);
}
.avatar {
  min-width: 0;
  min-height: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-muted);
  border: 1px solid var(--color-border);
}
.hero {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}
.donut-center {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 50%;
  background: transparent;
}
.donut-tag {
  font-size: 10px;
  color: var(--color-textDim);
}
.donut-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-text);
}
.donut-value.over {
  color: #c0392b; /* §5 over-budget red */
}
.donut-sub {
  font-size: 10px;
  color: var(--color-accentText);
}
.chips-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.acct-chip {
  flex: 0 0 auto;
  min-width: 96px;
  border-radius: 10px;
  background: var(--color-muted);
  border-left: 4px solid var(--color-primary);
  padding: 8px 10px;
}
.acct-name {
  font-size: 12px;
  font-weight: 700;
}
.acct-balance {
  font-size: 13px;
}
.list-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
}
.list-tag {
  font-size: 11px;
  color: var(--color-textDim);
}
.list-tag.filtered {
  color: var(--color-text);
  font-weight: 600;
}
.clear-filter {
  min-width: 32px;
  min-height: 32px;
  font-size: 12px;
  color: var(--color-textDim);
}
.txns {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.txn {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
}
.txn-delete {
  position: absolute;
  inset: 0 0 0 auto;
  width: 88px;
  border-radius: 8px;
  background: #c0392b;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.txn-row {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-muted);
  cursor: pointer;
  touch-action: pan-y;
  transition: transform 0.18s ease;
}
.txn-row.dragging {
  transition: none;
}
.txn-title {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.txn-amount {
  font-size: 13px;
  flex: 0 0 auto;
}
.txn-amount.income,
.txn-amount.transfer {
  color: var(--color-accentText); 
}
.empty {
  list-style: none;
  padding: 12px 2px;
  font-size: 13px;
  color: var(--color-textDim);
}
@media (prefers-reduced-motion: reduce) {
  .txn-row {
    transition: none;
  }
}
</style>
