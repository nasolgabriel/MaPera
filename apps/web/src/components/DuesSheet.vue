<script setup lang="ts">
// §7.5 Monthly dues — expanded breakdown (wireframe B2), a bottom sheet like the other
// sheets. Dark hero (due total + still-due), one row per due (name, due date, loan count,
// paid ✓ or "Log it"), next-month projection + diff note. No charts. Numbers come from the
// store's domain-wired computeds (§4); "Log it" is the only thing that makes a due hit E.
import { useSheetGuard } from '../composables/useSheetGuard';
import type { DueRow, NextMonthDues } from '../domain/dues';

const props = defineProps<{
  rows: DueRow[];
  total: number;
  stillDue: number;
  month: string; // 'YYYY-MM'
  nextMonth: NextMonthDues;
}>();
const emit = defineEmits<{ logDue: [id: string]; close: [] }>();

useSheetGuard();

const KIND_LABEL: Record<DueRow['kind'], string> = {
  subscription: 'subscription', loan: 'loan', bill: 'bill', transfer: 'transfer',
};

function pesoWhole(centavos: number): string {
  const sign = centavos < 0 ? '−' : '';
  const abs = Math.abs(centavos);
  const opts = abs % 100 === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `${sign}₱ ${(abs / 100).toLocaleString('en-PH', opts)}`;
}

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-PH', { month: 'long' });
}

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`;
}

/** "due 15th · subscription" or "due 30th · loan · 14 of 24". */
function subtitle(row: DueRow): string {
  let s = `due ${ordinal(row.dueDay)} · ${KIND_LABEL[row.kind]}`;
  if (row.loanTotal !== null && row.loanRemaining !== null) {
    s += ` · ${row.loanTotal - row.loanRemaining} of ${row.loanTotal}`;
  }
  return s;
}

const diffNote = (): string | null => {
  if (props.nextMonth.reason === null) return null;
  const sign = props.nextMonth.delta >= 0 ? '+' : '−';
  return `${sign}${pesoWhole(Math.abs(props.nextMonth.delta)).replace('₱ ', '₱')} — ${props.nextMonth.reason}`;
};
</script>

<template>
  <div class="backdrop" @pointerdown.self="emit('close')">
    <section class="sheet" role="dialog" aria-label="Monthly dues">
      <!-- Dark hero (both themes) — due this month + still due. -->
      <div class="hero">
        <span class="hero-label mono">due this month · {{ monthName(month) }}</span>
        <span class="hero-amount amount">{{ pesoWhole(total) }}</span>
        <span class="hero-sub mono">{{ pesoWhole(stillDue) }} still due</span>
      </div>

      <ul class="rows">
        <li v-for="row in rows" :key="row.id" class="row">
          <span class="row-info">
            <span class="row-name">{{ row.name }}</span>
            <span class="row-sub mono">{{ subtitle(row) }}</span>
          </span>
          <span class="row-amount mono">{{ pesoWhole(row.amount) }}</span>
          <span v-if="row.paid" class="paid-pill" aria-label="Paid">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          <button v-else class="log-it" @click="emit('logDue', row.id)">Log it</button>
        </li>
        <li v-if="rows.length === 0" class="empty">No dues this month.</li>
      </ul>

      <div class="next">
        <div class="next-head">
          <span class="next-label mono">Next month</span>
          <span class="next-amount mono">{{ pesoWhole(nextMonth.total) }}</span>
        </div>
        <span v-if="diffNote()" class="next-diff mono">{{ diffNote() }}</span>
      </div>

      <p class="foot mono">no charts · paid ✓ = the real logged transaction, never double-counted.</p>

      <button class="close" @click="emit('close')">Close</button>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 30;
}
.sheet {
  width: 100%;
  max-width: 480px;
  max-height: calc(100dvh - var(--safe-top) - 24px);
  overflow-y: auto;
  border-radius: 16px 16px 0 0;
  background: var(--color-surface);
  padding: 16px 16px calc(16px + var(--safe-bottom));
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hero {
  border-radius: 12px;
  background: #16213a; /* dark card both themes (matches Savings hero / PaydaySplitSheet) */
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
.hero-sub {
  font-size: 10px;
  color: #b7c2d6;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 2px;
  border-bottom: 1px solid var(--color-muted);
}
.row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
}
.row-sub {
  font-size: 9px;
  color: var(--color-textDim);
}
.row-amount {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text);
}
.paid-pill {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #0d7a3f;
  color: #fff;
}
.log-it {
  flex: none;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 15px;
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
.next {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.next-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.next-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-textDim);
}
.next-amount {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text);
}
.next-diff {
  font-size: 10px;
  color: var(--color-accentText);
}
.foot {
  margin: 0;
  font-size: 9px;
  color: var(--color-textDim);
}
.close {
  min-height: 44px;
  border-radius: 22px;
  background: var(--color-muted);
  font-size: 12px;
  font-weight: 600;
}
</style>
