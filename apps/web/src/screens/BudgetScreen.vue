<script setup lang="ts">
// Budget home — wireframes A1 (donut + legend + chips + recents + graph peek),
// A1b (month banner calendar) and A1c (sticky condensed header + expanded graph).
// Dues card is B6. All money numbers come from the store's domain-wired computeds.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLedgerStore } from '../stores/ledger';
import DonutChart from '../components/DonutChart.vue';
import MonthBanner from '../components/MonthBanner.vue';
import SpendGraph from '../components/SpendGraph.vue';
import type { DonutSlice } from '../components/DonutChart.vue';
import type { Transaction } from '../db/repositories/types';

const router = useRouter();
const store = useLedgerStore();

// Navy shade ramp for slices (wireframe A1); gray = uncategorized; saffron stays a money moment.
const SLICE_COLORS = ['#1E3A6E', '#46689C', '#7FA3E0', '#9DB9E7', '#B7C9E8', '#CEDAF0'];
const UNCATEGORIZED_COLOR = '#A3ACBD';
const UNSPENT_COLOR = '#E6EAF1';
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
  bannerOpen.value = false;
  void store.setMonth(next);
}

// Ring composition (geometry only — amounts come from store.spendSlices/capTotal).
// Total ring = max(Σ cap, Σ spend) so the track remainder = unspent budget.
const totalSpent = computed(() => store.spendSlices.reduce((sum, s) => sum + s.amount, 0));

function sliceColor(categoryId: string | null, index: number): string {
  return categoryId === null ? UNCATEGORIZED_COLOR : SLICE_COLORS[index % SLICE_COLORS.length]!;
}

function sliceName(categoryId: string | null): string {
  return categoryId === null ? 'Uncategorized' : categoryName.value.get(categoryId) ?? '?';
}

const donutSlices = computed<DonutSlice[]>(() => {
  const total = Math.max(store.capTotal, totalSpent.value);
  if (total === 0) return [];
  return store.spendSlices.map((s, i) => ({
    key: s.category_id ?? UNCAT_KEY,
    fraction: s.amount / total,
    color: sliceColor(s.category_id, i),
    label: `${sliceName(s.category_id)} ${pesoWhole(s.amount)}`,
  }));
});

/** A1 legend: one swatch per slice, plus Unspent while the ring still has track showing. */
const legend = computed(() => {
  const items = store.spendSlices.map((s, i) => ({
    key: s.category_id ?? UNCAT_KEY,
    name: sliceName(s.category_id),
    color: sliceColor(s.category_id, i),
  }));
  if (store.capTotal > totalSpent.value) items.push({ key: '__unspent__', name: 'Unspent', color: UNSPENT_COLOR });
  return items;
});

/** Colour dot on a recents row — same ramp as the donut so rows read against slices. */
const categoryColor = computed(() => {
  const map = new Map<string, string>();
  store.spendSlices.forEach((s, i) => {
    if (s.category_id !== null) map.set(s.category_id, SLICE_COLORS[i % SLICE_COLORS.length]!);
  });
  return map;
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

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

// ── A1b month banner ──
const bannerOpen = ref(false);
const selectedDay = ref<string | null>(null);

function toggleBanner(): void {
  bannerOpen.value = !bannerOpen.value;
  if (bannerOpen.value) selectedDay.value = filter.value?.kind === 'day' ? filter.value.date : null;
}

function onDaySelect(date: string): void {
  if (selectedDay.value !== date) {
    selectedDay.value = date; // first tap picks, the sheet's button (or a second tap) applies
    return;
  }
  filter.value = { kind: 'day', date };
  openId.value = null;
  bannerOpen.value = false;
}

function onWholeMonth(): void {
  selectedDay.value = null;
  filter.value = null;
  bannerOpen.value = false;
}

function onDocumentPointerDown(): void {
  bannerOpen.value = false;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') bannerOpen.value = false;
}

// ── A1c: condense the month row into a sticky bar + expand the graph once scrolled ──
const scrolled = ref(false);
const graphVisible = ref(false);
/** Tapping the peek strip opens the chart too — on a short month the page may never scroll. */
const graphTapped = ref(false);
const graphExpanded = computed(() => graphTapped.value || (scrolled.value && graphVisible.value));
const headerSentinel = ref<HTMLElement | null>(null);
const graphSentinel = ref<HTMLElement | null>(null);
let headerObserver: IntersectionObserver | null = null;
let graphObserver: IntersectionObserver | null = null;

function observe(target: HTMLElement, onChange: (visible: boolean) => void): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null; // jsdom / old WebViews
  const observer = new IntersectionObserver(([entry]) => onChange(entry?.isIntersecting ?? false));
  observer.observe(target);
  return observer;
}

// ── slice / day filter (§6.1) ──
type Filter = { kind: 'category'; id: string | null } | { kind: 'day'; date: string };
const filter = ref<Filter | null>(null);

function onSliceSelect(key: string): void {
  const id = key === UNCAT_KEY ? null : key;
  const current = filter.value;
  filter.value = current?.kind === 'category' && current.id === id ? null : { kind: 'category', id };
  openId.value = null;
}

const filterLabel = computed(() => {
  const f = filter.value;
  if (f === null) return null;
  if (f.kind === 'day') return shortDate(f.date);
  return f.id === null ? 'Uncategorized' : categoryName.value.get(f.id) ?? '?';
});

const visibleTxns = computed<Transaction[]>(() => {
  const f = filter.value;
  if (f === null) return store.recent;
  if (f.kind === 'day') return store.transactions.filter((t) => t.date === f.date);
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
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onKeydown);
  if (headerSentinel.value) headerObserver = observe(headerSentinel.value, (v) => (scrolled.value = !v));
  if (graphSentinel.value) graphObserver = observe(graphSentinel.value, (v) => (graphVisible.value = v));
  if (!store.loaded) await store.load();
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onKeydown);
  headerObserver?.disconnect();
  graphObserver?.disconnect();
});
</script>

<template>
  <main class="screen">
    <header :class="['top', { condensed: scrolled }]">
      <div class="month-nav">
        <button class="month-arrow" aria-label="Previous month" @click="shiftMonth(-1)">‹</button>
        <div class="chip-wrap" @pointerdown.stop>
          <button
            class="month-chip"
            :class="{ open: bannerOpen }"
            :aria-expanded="bannerOpen"
            aria-label="Open month calendar"
            @click="toggleBanner"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span class="month-label">{{ monthLabel }}</span>
            <svg
              v-if="bannerOpen"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>
        </div>
        <button class="month-arrow" aria-label="Next month" @click="shiftMonth(1)">›</button>
      </div>

      <!-- Anchored to the header, NOT to the chip: A1b spans the full screen width. -->
      <MonthBanner
        v-if="bannerOpen"
        :cells="store.monthCells"
        :selected-date="selectedDay"
        @select="onDaySelect"
        @whole-month="onWholeMonth"
        @dismiss="bannerOpen = false"
      />

      <span v-if="scrolled && store.capTotal > 0" class="condensed-remaining mono">
        {{ pesoWhole(store.remainingBudget) }} left
      </span>
      <button class="avatar" aria-label="Settings" @click="router.push('/more')">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </button>
    </header>
    <div ref="headerSentinel" class="sentinel" aria-hidden="true"></div>

    <div class="hero">
      <DonutChart :slices="donutSlices" :size="180" @select="onSliceSelect">
        <!-- Center tap → caps screen (B4). DonutChart's .center is pointer-events:none,
             so the button re-enables them for itself only — slices stay clickable. -->
        <button class="donut-center" aria-label="Budget caps" @click="router.push('/caps')">
          <template v-if="store.capTotal > 0">
            <span class="donut-tag mono">REMAINING</span>
            <span :class="['donut-value', 'amount', { over: store.remainingBudget < 0 }]">
              {{ pesoWhole(store.remainingBudget) }}
            </span>
            <span class="donut-sub mono">of {{ pesoWhole(store.capTotal) }}</span>
            <span v-if="store.safeSpendToday !== null" class="donut-safe mono">
              {{ pesoWhole(store.safeSpendToday) }}/day left
            </span>
          </template>
          <template v-else>
            <span class="donut-tag mono">SPENT</span>
            <span class="donut-value amount">{{ pesoWhole(totalSpent) }}</span>
            <span class="donut-sub mono">no caps set</span>
          </template>
        </button>
      </DonutChart>
    </div>

    <div v-if="legend.length > 0" class="legend">
      <span v-for="item in legend" :key="item.key" class="legend-item">
        <i class="legend-swatch" :style="{ background: item.color }"></i>{{ item.name }}
      </span>
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
          :class="{ dragging: dragId === t.id, transfer: t.kind === 'transfer' }"
          :style="{ transform: `translateX(${rowOffset(t.id)}px)` }"
          @pointerdown="onRowPointerDown($event, t.id)"
          @pointermove="onRowPointerMove"
          @pointerup="onRowPointerUp(t.id)"
          @pointercancel="onRowPointerUp(t.id)"
          @click="onRowClick(t.id)"
        >
          <span class="txn-main">
            <svg
              v-if="t.kind === 'transfer'"
              class="txn-arrow"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M4 12h16M14 6l6 6-6 6" />
            </svg>
            <i
              v-else
              class="txn-dot"
              :style="{ background: (t.category_id && categoryColor.get(t.category_id)) || UNCATEGORIZED_COLOR }"
              aria-hidden="true"
            ></i>
            <span class="txn-title">{{ rowTitle(t) }}</span>
          </span>
          <span class="txn-meta">
            <span class="txn-date mono">{{ shortDate(t.date) }}</span>
            <span :class="['txn-amount', 'mono', t.kind]">{{ rowAmount(t) }}</span>
          </span>
        </div>
      </li>
      <li v-if="visibleTxns.length === 0" class="empty">
        {{ filter === null ? 'No transactions yet — tap the hub to log one.' : 'Nothing here for this filter.' }}
      </li>
    </ul>

    <!-- A1: the graph PEEKS in the dead zone above the hub; scrolling to it expands
         into the A1c chart. Sentinel sits above so the expansion starts a touch early. -->
    <div ref="graphSentinel" class="sentinel" aria-hidden="true"></div>
    <SpendGraph
      class="graph-slot"
      role="button"
      :aria-expanded="graphExpanded"
      tabindex="0"
      @click="graphTapped = !graphTapped"
      @keyup.enter="graphTapped = !graphTapped"
      :days="store.weekDays"
      :average="store.weekAverage"
      :change-pct="store.weekChange"
      :day-cap="store.dayCap"
      :today-date="store.weekDays[store.weekDays.length - 1]?.date ?? ''"
      :expanded="graphExpanded"
    />
  </main>
</template>

<style scoped>
.screen {
  max-width: 480px;
  margin: 0 auto;
  /* bottom clears the fixed 64px hub button (bottom: 24px + safe area) + the gesture bar */
  padding: 10px 16px calc(104px + var(--safe-bottom));
  /* full height so the graph peek can sit in the dead zone above the hub (A1) */
  min-height: calc(100dvh - var(--safe-top) - var(--safe-bottom));
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* Sticky, and the positioning context for the A1b banner (an absolute child), so the
   calendar spans the screen instead of the month chip. */
.top {
  position: sticky;
  top: var(--safe-top);
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  background: var(--color-bg);
  padding: 4px 0;
}
/* A1c: scrolled state condenses to month + remaining under a hairline — the stepper
   arrows drop out, the chip stays so the calendar is still one tap away. */
.top.condensed {
  border-bottom: 1px solid var(--color-muted);
  padding-bottom: 9px;
}
.top.condensed .month-arrow {
  display: none;
}
.sentinel {
  height: 1px;
  margin: 0;
}
.month-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}
.chip-wrap {
  position: relative;
}
.month-arrow {
  min-width: 44px;
  min-height: 44px;
  font-size: 18px;
  color: var(--color-textDim);
}
.month-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 44px;
  padding: 5px 8px;
  border-radius: 8px;
  background: var(--color-muted);
  color: var(--color-primary);
}
.month-chip.open {
  background: var(--color-primary);
  color: #fff;
}
.month-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--color-text);
}
.month-chip.open .month-label {
  color: #fff;
}
.condensed-remaining {
  margin-left: auto;
  font-size: 10px;
  color: var(--color-textDim);
}
.avatar {
  min-width: 0;
  min-height: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-muted);
  border: 1px solid var(--color-border);
  color: var(--color-textDim);
  display: flex;
  align-items: center;
  justify-content: center;
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
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--color-textDim);
}
.donut-value {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--color-text);
}
.donut-value.over {
  color: var(--color-danger);
}
.donut-sub {
  font-size: 9px;
  color: var(--color-textDim);
}
.donut-safe {
  margin-top: 2px;
  font-size: 9px;
  font-weight: 600;
  color: var(--color-accentText); /* saffron money moment (§5) */
}
.legend {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 9px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  color: var(--color-textDim);
}
.legend-swatch {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  display: block;
}
.chips-scroll {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.acct-chip {
  flex: 1 0 auto;
  min-width: 92px;
  border-radius: 10px;
  background: var(--color-muted);
  border-left: 3px solid var(--color-primary);
  padding: 7px 9px;
}
.acct-name {
  font-size: 9px;
  font-weight: 700;
  color: var(--color-textDim);
}
.acct-balance {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.list-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
}
.list-tag {
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-textDim);
}
.list-tag.filtered {
  color: var(--color-text);
  font-weight: 600;
  text-transform: none;
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
  gap: 4px;
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
  background: var(--color-danger);
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
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--color-muted);
  cursor: pointer;
  touch-action: pan-y;
  transition: transform 0.18s ease;
}
/* Transfers are money moments, never spend (§7.2) — warm cream in light mode. */
.txn-row.transfer {
  background: #fff8e4;
  color: var(--color-text);
}
/* An inverted cream blows out on dark; a warm dark reads as the same treatment. */
:global(html[data-theme='dark']) .txn-row.transfer {
  background: #2a2418;
}
.txn-row.dragging {
  transition: none;
}
.txn-main {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.txn-dot {
  width: 6px;
  height: 6px;
  border-radius: 2px;
  flex: none;
  display: block;
}
.txn-arrow {
  flex: none;
  color: var(--color-accentText);
}
.txn-title {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.txn-meta {
  display: flex;
  align-items: baseline;
  gap: 7px;
  flex: none;
}
.txn-date {
  font-size: 8px;
  color: var(--color-textDim);
}
.txn-amount {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.txn-amount.income,
.txn-amount.transfer {
  color: var(--color-accentText);
  font-weight: 700;
}
.empty {
  list-style: none;
  padding: 12px 2px;
  font-size: 13px;
  color: var(--color-textDim);
}
.graph-slot {
  margin-top: auto;
}
@media (prefers-reduced-motion: reduce) {
  .txn-row {
    transition: none;
  }
}
</style>
