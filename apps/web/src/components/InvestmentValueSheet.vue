<script setup lang="ts">
// §7.7 "log current value" — the user periodically enters an investment account's market
// value; the app does the returns math (domain/investments via the store). This sheet only
// collects the ₱ figure; store.logInvestmentValue upserts it for the current month.
import { computed, ref } from 'vue';
import { useSheetGuard } from '../composables/useSheetGuard';
import type { Account } from '../db/repositories/types';

const props = defineProps<{
  account: Account;
  /** Latest logged value (centavos) to prefill, or null when none yet. */
  current: number | null;
}>();
const emit = defineEmits<{ confirm: [value: number]; close: [] }>();

useSheetGuard(); // hides the hub button while this sheet is open
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

// Prefill with the last logged value so a re-log is a small tweak, not a re-type.
const amountText = ref(props.current !== null ? (props.current / 100).toFixed(2) : '');
const saving = ref(false);

/** Pesos-as-typed → integer centavos (same 2-decimal converter as AddToGoalSheet). */
const value = computed(() => {
  const trimmed = amountText.value.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0;
  const [whole, frac = ''] = trimmed.split('.');
  return parseInt(whole!, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
});

const canConfirm = computed(() => !saving.value && value.value > 0);

async function confirm(): Promise<void> {
  if (!canConfirm.value) return;
  saving.value = true;
  try {
    emit('confirm', value.value);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="backdrop" @pointerdown.self="emit('close')">
    <section class="sheet" role="dialog" :aria-label="`Log value for ${account.name}`">
      <h2 class="title">{{ account.name }} value</h2>
      <p class="hint mono">Enter the account's current market value.</p>

      <label class="field">
        <span class="field-label mono">current value</span>
        <div class="amount-row">
          <span class="peso mono">₱</span>
          <input
            v-model="amountText"
            class="amount mono"
            inputmode="decimal"
            placeholder="0.00"
            aria-label="Current market value"
          />
        </div>
      </label>

      <p v-if="value > 0" class="preview mono">market value {{ peso.format(value / 100) }}</p>

      <div class="actions">
        <button class="cancel" @click="emit('close')">Cancel</button>
        <button class="save" :disabled="!canConfirm" @click="confirm">{{ saving ? '…' : 'Save value' }}</button>
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
.hint {
  margin: -4px 0 0;
  font-size: 10px;
  color: var(--color-textDim);
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
.amount-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 4px;
}
.peso {
  font-size: 20px;
  color: var(--color-textDim);
}
.amount {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.amount:focus {
  outline: none;
}
.preview {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-accentText); /* saffron money moment */
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
</style>
