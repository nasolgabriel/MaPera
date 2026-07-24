<script setup lang="ts">
// §6.3 "+ add" on a goal — moves money into the goal's linked savings account.
// The transfer + saved_amount bump happen in the store (store.addToGoal); this sheet just
// collects amount + source. Source is a REGULAR account (regular→savings = an S contribution, §7.2).
import { computed, ref } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import { isSavingsAccount } from '../domain/stats';
import type { Goal } from '../db/repositories/types';

const props = defineProps<{ goal: Goal }>();
const emit = defineEmits<{ confirm: [sourceId: string, amount: number]; close: [] }>();

const store = useLedgerStore();
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

/** Regular (non-savings) active accounts — money to save comes from these. */
const sourceAccounts = computed(() =>
  store.accounts.filter((a) => !a.archived && !isSavingsAccount(a)),
);

const amountText = ref('');
const sourceId = ref(sourceAccounts.value[0]?.id ?? '');
const saving = ref(false);

/** Pesos-as-typed → integer centavos (same 2-decimal converter as PaydaySplitSheet). */
const amount = computed(() => {
  const trimmed = amountText.value.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0;
  const [whole, frac = ''] = trimmed.split('.');
  return parseInt(whole!, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
});

const canConfirm = computed(() => !saving.value && amount.value > 0 && sourceId.value !== '');

async function confirm(): Promise<void> {
  if (!canConfirm.value) return;
  saving.value = true;
  try {
    emit('confirm', sourceId.value, amount.value);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="backdrop" @pointerdown.self="emit('close')">
    <section class="sheet" role="dialog" :aria-label="`Add to ${goal.name}`">
      <h2 class="title">Add to {{ goal.name }}</h2>

      <label class="field">
        <span class="field-label mono">amount</span>
        <div class="amount-row">
          <span class="peso mono">₱</span>
          <input
            v-model="amountText"
            class="amount mono"
            inputmode="decimal"
            placeholder="0.00"
            aria-label="Amount to add"
          />
        </div>
      </label>

      <label class="field">
        <span class="field-label mono">from</span>
        <select v-model="sourceId" class="source" aria-label="Source account">
          <option v-for="a in sourceAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>

      <p v-if="amount > 0" class="preview mono">{{ peso.format(amount / 100) }} → {{ goal.name }}</p>

      <div class="actions">
        <button class="cancel" @click="emit('close')">Cancel</button>
        <button class="add" :disabled="!canConfirm" @click="confirm">{{ saving ? '…' : 'Add' }}</button>
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
.source {
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
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
.add {
  flex: 2;
  min-height: 44px;
  border-radius: 22px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
.add:disabled {
  opacity: 0.4;
}
</style>
