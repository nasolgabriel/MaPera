<script setup lang="ts">
// §7.8 credit-card health panel (wireframe D3): dark owed hero + healthy badge, the three
// checks (utilization bar with the 30% marker · card spend vs income · statement paid in
// full), the points strip, and the interest warning when the statement was not cleared.
// Every figure arrives pre-computed from domain/credit via the store (§4: no math in the .vue).
import { computed } from 'vue';
import { INCOME_SHARE_LIMIT, UTILIZATION_LIMIT, hasFailingCheck } from '../domain/credit';
import type { CardHealth } from '../domain/credit';

const props = defineProps<{ card: CardHealth; monthLabel: string }>();

// ── display formatting only (§3: format at display time) ──
function pesoWhole(centavos: number): string {
  const sign = centavos < 0 ? '−' : '';
  const abs = Math.abs(centavos);
  const opts = abs % 100 === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `${sign}₱ ${(abs / 100).toLocaleString('en-PH', opts)}`;
}

function pctText(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(Math.abs(value) % 1 === 0 ? 0 : 1)}%`;
}

/** 'YYYY-MM' → 'June' for the statement row's label. */
const previousMonthLabel = computed(() => {
  const [y, m] = props.card.previousMonth.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-PH', { month: 'long' });
});

/** Bar width for the utilization track — clamped to the track, an overpaid card reads 0. */
const utilWidth = computed(() => {
  const u = props.card.utilization;
  if (u === null) return '0%';
  return `${Math.min(Math.max(u, 0), 100)}%`;
});

const limitText = computed(() =>
  props.card.creditLimit === null ? 'no limit set' : `of ${pesoWhole(props.card.creditLimit)}`,
);

const pointsText = computed(() => {
  const p = props.card.points;
  return p === null ? '—' : `${p.toLocaleString('en-PH')} pts`;
});

/** `1 pt / ₱25` from the account's points_rate, or null when the card earns none. */
const pointsRateText = computed(() =>
  props.card.pointsRate === null ? null : `1 pt / ${pesoWhole(props.card.pointsRate)}`,
);

const MARK = { ok: '✓', bad: '✕', unknown: '·' } as const;
</script>

<template>
  <section class="card-health" :class="{ unhealthy: hasFailingCheck(card) }">
    <h2 class="card-name">
      {{ card.account.name }} <span class="card-kind mono">credit card</span>
    </h2>

    <!-- Owed hero + the §7.8 badge. Dark in both themes, like the savings hero. -->
    <div class="hero">
      <div class="hero-owed">
        <span class="hero-label mono">{{ card.owed < 0 ? 'in credit' : 'owed' }}</span>
        <span class="hero-amount amount">{{ pesoWhole(Math.abs(card.owed)) }}</span>
      </div>
      <span v-if="card.healthy" class="badge good">CARD HEALTHY</span>
      <span v-else-if="card.checks.utilization === 'unknown' || card.checks.incomeShare === 'unknown'" class="badge unknown">NEEDS DATA</span>
      <span v-else class="badge bad">NEEDS ATTENTION</span>
    </div>

    <!-- Check 1 · utilization, with the healthy-at-30% marker on the track -->
    <div class="check" :class="card.checks.utilization">
      <div class="check-head">
        <span><span class="mark" aria-hidden="true">{{ MARK[card.checks.utilization] }}</span> utilization</span>
        <span class="check-value mono">{{ pctText(card.utilization) }} {{ limitText }}</span>
      </div>
      <div class="track">
        <div class="fill" :style="{ width: utilWidth }"></div>
        <i class="limit-mark" :style="{ left: `${UTILIZATION_LIMIT}%` }"></i>
      </div>
      <div class="check-note mono">keep ≤ {{ UTILIZATION_LIMIT }}%</div>
    </div>

    <!-- Check 2 · card spend vs income this month -->
    <div class="check row" :class="card.checks.incomeShare">
      <span><span class="mark" aria-hidden="true">{{ MARK[card.checks.incomeShare] }}</span> card spend vs income</span>
      <span class="check-value mono">
        {{ pctText(card.incomeShare) }}
        <template v-if="card.incomeShare !== null">(≤{{ INCOME_SHARE_LIMIT }}%)</template>
        <template v-else>no income in {{ monthLabel }}</template>
      </span>
    </div>

    <!-- Check 3 · last statement cleared -->
    <div class="check row" :class="card.checks.paidInFull">
      <span>
        <span class="mark" aria-hidden="true">{{ MARK[card.checks.paidInFull] }}</span>
        {{ previousMonthLabel }} statement {{ card.paidInFull ? 'paid in full' : 'not cleared' }}
      </span>
      <span class="check-value mono">
        {{ pesoWhole(card.previousStatement) }}<template v-if="!card.paidInFull"> · paid {{ pesoWhole(card.payments) }}</template>
      </span>
    </div>

    <!-- Points earned on this month's card spend -->
    <div class="points">
      <span class="points-label">points in {{ monthLabel }}</span>
      <span class="points-value">
        {{ pointsText }}
        <span v-if="pointsRateText" class="points-rate mono">{{ pointsRateText }}</span>
      </span>
    </div>

    <!-- §7.8: when the statement was not cleared, interest is what the rewards cost. -->
    <p v-if="card.estimatedInterest !== null" class="warning mono">
      Carrying {{ pesoWhole(card.owed) }} costs about {{ pesoWhole(card.estimatedInterest) }} in interest this month —
      more than the points are worth. Clear the statement to keep the rewards.
    </p>

    <p class="footnote mono">
      Bill payment is a transfer, never an expense · statement snapshots on
      {{ card.account.statement_day === null ? 'the last day of the month' : `day ${card.account.statement_day}` }}
    </p>
  </section>
</template>

<style scoped>
.card-health {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  padding: 12px;
}
/* §7.8: any red check tints the card. */
.card-health.unhealthy {
  border-color: var(--color-danger);
}
.card-name {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
}
.card-kind {
  font-size: 9px;
  font-weight: 400;
  color: var(--color-textDim);
}
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 12px;
  background: #16213a; /* dark in both themes (matches the savings hero) */
  padding: 12px 14px;
}
.hero-owed {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.hero-label {
  font-size: 9px;
  color: #8b97ad;
}
.hero-amount {
  font-size: 20px;
  font-weight: 800;
  color: #e7ecf5;
}
.badge {
  flex: none;
  padding: 6px 11px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #fff;
}
.badge.good {
  background: #0d7a3f; /* §5 green = all clear */
}
.badge.bad {
  background: var(--color-danger);
}
.badge.unknown {
  background: #3a465f;
  color: #b7c2d6;
}
.check {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 9px 11px;
  font-size: 11px;
}
.check.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.check-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.check-value {
  font-weight: 600;
  text-align: right;
}
.mark {
  font-weight: 800;
  color: #0d7a3f;
}
.check.bad .mark {
  color: var(--color-danger);
}
.check.unknown .mark {
  color: var(--color-textDim);
}
.track {
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: var(--color-muted);
  margin-top: 6px;
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 3px;
  background: #0d7a3f;
  transition: width var(--dur-reveal) var(--ease-standard);
}
.check.bad .fill {
  background: var(--color-danger);
}
/* The healthy-at-30% line the bar must stay left of. */
.limit-mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1.5px;
  background: var(--color-text);
}
.check-note {
  margin-top: 3px;
  font-size: 8px;
  color: var(--color-textDim);
}
.points {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 10px;
  background: var(--color-muted);
  padding: 9px 11px;
  font-size: 11px;
}
.points-value {
  font-size: 14px;
  font-weight: 800;
  color: var(--color-accentText); /* points are a money moment (§5) */
}
.points-rate {
  font-size: 8px;
  font-weight: 400;
  color: var(--color-textDim);
}
.warning {
  margin: 0;
  border-radius: 10px;
  border: 1px solid var(--color-danger); /* an outline, not a tinted fill — safe in both themes */
  padding: 9px 11px;
  font-size: 9px;
  line-height: 1.6;
  color: var(--color-danger);
}
.footnote {
  margin: 0;
  font-size: 8px;
  line-height: 1.6;
  color: var(--color-textDim);
}
</style>
