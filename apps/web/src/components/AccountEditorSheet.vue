<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSheetGuard } from '../composables/useSheetGuard';
import { essenceColors } from '../theme/tokens';
import { essenceShades, essenceVars } from '../theme/essence';
import type { Account } from '../db/repositories/types';

const props = defineProps<{ account: Account | null }>();
const emit = defineEmits<{ save: [account: Account]; close: [] }>();

useSheetGuard();

const TYPES: ReadonlyArray<{ id: Account['type']; label: string }> = [
  { id: 'cash', label: 'cash' },
  { id: 'ewallet', label: 'e-wallet' },
  { id: 'bank', label: 'bank' },
  { id: 'investment', label: 'investment' },
  { id: 'credit_card', label: 'credit' },
];

const isEdit = computed(() => props.account !== null);

const name = ref(props.account?.name ?? '');
const type = ref<Account['type']>(props.account?.type ?? 'cash');
const color = ref<string>(props.account?.essence_color ?? essenceColors[0]);
const startingText = ref(props.account ? centavosToText(props.account.starting_balance) : '');
const limitText = ref(props.account?.credit_limit === null || props.account === null ? '' : centavosToText(props.account.credit_limit));
const statementText = ref(props.account?.statement_day === null || props.account === null ? '' : String(props.account.statement_day));
const dueText = ref(props.account?.due_day === null || props.account === null ? '' : String(props.account.due_day));
const pointsText = ref(props.account?.points_rate === null || props.account === null ? '' : centavosToText(props.account.points_rate));

function centavosToText(c: number): string {
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2);
}

function toCentavos(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const negative = trimmed.startsWith('-');
  const [whole, frac = ''] = trimmed.replace('-', '').split('.');
  const centavos = parseInt(whole!, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
  return negative ? -centavos : centavos;
}

function toDay(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const day = parseInt(trimmed, 10);
  return day >= 1 && day <= 31 ? day : null;
}

const isCard = computed(() => type.value === 'credit_card');
const ladder = computed(() => essenceShades(color.value));
const shadeVars = computed(() => essenceVars(color.value));
const canSave = computed(() => name.value.trim() !== '');

function save(): void {
  if (!canSave.value) return;
  emit('save', {
    id: props.account?.id ?? crypto.randomUUID(),
    name: name.value.trim(),
    type: type.value,
    starting_balance: toCentavos(startingText.value) ?? 0,
    essence_color: color.value,
    archived: props.account?.archived ?? false,
    credit_limit: isCard.value ? toCentavos(limitText.value) : null,
    statement_day: isCard.value ? toDay(statementText.value) : null,
    due_day: isCard.value ? toDay(dueText.value) : null,
    points_rate: isCard.value ? toCentavos(pointsText.value) : null,
  });
}
</script>

<template>
  <div class="backdrop" @pointerdown.self="emit('close')">
    <section class="sheet" role="dialog" :aria-label="isEdit ? 'Edit account' : 'New account'">
      <h2 class="title">{{ isEdit ? 'Edit account' : 'New account' }}</h2>

      <label class="field">
        <span class="field-label mono">name</span>
        <input v-model="name" class="text" placeholder="e.g. BPI Savings" aria-label="Account name" />
      </label>

      <div class="field">
        <span class="field-label mono">type</span>
        <div class="types">
          <button
            v-for="t in TYPES"
            :key="t.id"
            class="type"
            :class="{ active: type === t.id }"
            :aria-pressed="type === t.id"
            @click="type = t.id"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <div class="field">
        <span class="field-label mono">essence color · 6 predefined, no free hex</span>
        <div class="swatches">
          <button
            v-for="c in essenceColors"
            :key="c"
            class="swatch"
            :class="{ picked: color === c }"
            :style="{ background: c }"
            :aria-label="`Essence colour ${c}`"
            :aria-pressed="color === c"
            @click="color = c"
          ></button>
        </div>
        <div class="shades" :style="shadeVars">
          <span v-for="(shade, i) in ladder" :key="i" class="shade" :style="{ background: shade }"></span>
        </div>
        <span class="hint mono">derived shades → chips, row accents, chart lines</span>
      </div>

      <label class="field">
        <span class="field-label mono">starting balance</span>
        <div class="amount-row">
          <span class="peso mono">₱</span>
          <input
            v-model="startingText"
            class="amount mono"
            inputmode="decimal"
            placeholder="0.00"
            aria-label="Starting balance"
          />
        </div>
      </label>

      <div v-if="isCard" class="card-block">
        <span class="field-label mono">credit card details</span>
        <label class="row-field">
          <span class="row-label">credit limit</span>
          <span class="row-input mono">₱ <input v-model="limitText" inputmode="decimal" placeholder="0" aria-label="Credit limit" /></span>
        </label>
        <div class="row-pair">
          <label class="row-field">
            <span class="row-label">statement</span>
            <span class="row-input mono"><input v-model="statementText" inputmode="numeric" placeholder="15" aria-label="Statement day" /></span>
          </label>
          <label class="row-field">
            <span class="row-label">due</span>
            <span class="row-input mono"><input v-model="dueText" inputmode="numeric" placeholder="5" aria-label="Due day" /></span>
          </label>
        </div>
        <label class="row-field">
          <span class="row-label">points rate</span>
          <span class="row-input mono">1 pt / ₱ <input v-model="pointsText" inputmode="decimal" placeholder="25" aria-label="Pesos per point" /></span>
        </label>
      </div>

      <div class="actions">
        <button class="cancel" @click="emit('close')">Cancel</button>
        <button class="save" :disabled="!canSave" @click="save">Save account</button>
      </div>
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
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.field-label {
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-textDim);
}
.text {
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
}
.types {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.type {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--color-muted);
  color: var(--color-text);
  font-size: 11px;
}
.type.active {
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
}
.swatches {
  display: flex;
  gap: 10px;
}
.swatch {
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 50%;
  background-clip: content-box;
  border: 5px solid transparent;
  transition: transform var(--dur-press) var(--ease-standard);
}
.swatch.picked {
  outline: 3px solid var(--color-text);
  outline-offset: -3px;
  transform: scale(1.06);
}
.shades {
  display: flex;
  gap: 6px;
}
.shade {
  flex: 1;
  height: 22px;
  border-radius: 6px;
}
.hint {
  font-size: 9px;
  color: var(--color-textDim);
}
.card-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px dashed var(--color-border);
  padding-top: 10px;
}
.row-pair {
  display: flex;
  gap: 6px;
}
.row-pair .row-field {
  flex: 1;
}
.row-field {
  min-height: 44px;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--color-muted);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
}
.row-label {
  color: var(--color-textDim);
}
.row-input {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
}
.row-input input {
  width: 62px;
  min-width: 0;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: right;
}
.row-input input:focus {
  outline: none;
  border-bottom-color: var(--color-primary);
}
.row-input input::placeholder {
  color: var(--color-textDim);
  font-weight: 400;
  opacity: 0.6;
}
.amount-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 4px;
}
.peso {
  font-size: 18px;
  color: var(--color-textDim);
}
.amount {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.amount:focus {
  outline: none;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.cancel {
  flex: 1;
  min-height: 44px;
  border-radius: 22px;
  background: var(--color-muted);
  font-size: 12px;
  font-weight: 600;
}
.save {
  flex: 2;
  min-height: 44px;
  border-radius: 22px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
.save:disabled {
  opacity: 0.4;
}
@media (prefers-reduced-motion: reduce) {
  .swatch {
    transition: none;
  }
}
</style>
