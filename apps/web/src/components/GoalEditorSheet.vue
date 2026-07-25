<script setup lang="ts">
// §6.3 goal editor — create (goal=null) or edit an existing goal. No wireframe of its own,
// so it stays minimal + on-brand. Persistence goes through store.saveGoal / store.deleteGoal.
import { computed, ref } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import { isSavingsAccount } from '../domain/stats';
import { useSheetGuard } from '../composables/useSheetGuard';
import type { Goal } from '../db/repositories/types';

const props = defineProps<{ goal: Goal | null }>();
const emit = defineEmits<{ save: [goal: Goal]; remove: [id: string]; close: [] }>();

useSheetGuard();
const store = useLedgerStore();

/** A goal saves into a savings-flagged account (§8.1). */
const savingsAccounts = computed(() =>
  store.accounts.filter((a) => !a.archived && isSavingsAccount(a)),
);

const name = ref(props.goal?.name ?? '');
const targetText = ref(props.goal ? centavosToText(props.goal.target_amount) : '');
const deadline = ref(props.goal?.deadline ?? '');
const accountId = ref(props.goal?.account_id ?? savingsAccounts.value[0]?.id ?? '');

const isEdit = computed(() => props.goal !== null);

/** Pesos-as-typed → integer centavos (2-decimal). */
const targetCentavos = computed(() => {
  const trimmed = targetText.value.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0;
  const [whole, frac = ''] = trimmed.split('.');
  return parseInt(whole!, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
});

function centavosToText(c: number): string {
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2);
}

const canSave = computed(
  () => name.value.trim() !== '' && targetCentavos.value > 0 && accountId.value !== '',
);

function save(): void {
  if (!canSave.value) return;
  emit('save', {
    id: props.goal?.id ?? crypto.randomUUID(),
    name: name.value.trim(),
    target_amount: targetCentavos.value,
    deadline: deadline.value.trim() === '' ? null : deadline.value,
    account_id: accountId.value,
    saved_amount: props.goal?.saved_amount ?? 0, // progress survives an edit
  });
}
</script>

<template>
  <div class="backdrop" @pointerdown.self="emit('close')">
    <section class="sheet" role="dialog" :aria-label="isEdit ? 'Edit goal' : 'New goal'">
      <h2 class="title">{{ isEdit ? 'Edit goal' : 'New goal' }}</h2>

      <label class="field">
        <span class="field-label mono">name</span>
        <input v-model="name" class="text" placeholder="e.g. Laptop fund" aria-label="Goal name" />
      </label>

      <label class="field">
        <span class="field-label mono">target</span>
        <div class="amount-row">
          <span class="peso mono">₱</span>
          <input
            v-model="targetText"
            class="amount mono"
            inputmode="decimal"
            placeholder="0.00"
            aria-label="Target amount"
          />
        </div>
      </label>

      <label class="field">
        <span class="field-label mono">save into</span>
        <select v-model="accountId" class="text" aria-label="Linked savings account">
          <option v-for="a in savingsAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>

      <label class="field">
        <span class="field-label mono">deadline (optional)</span>
        <input v-model="deadline" type="date" class="text" aria-label="Deadline" />
      </label>

      <div class="actions">
        <button v-if="isEdit" class="delete" aria-label="Delete goal" @click="emit('remove', goal!.id)">Delete</button>
        <button class="cancel" @click="emit('close')">Cancel</button>
        <button class="save" :disabled="!canSave" @click="save">Save</button>
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
.delete {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 22px;
  background: transparent;
  border: 1px solid var(--color-danger);
  color: var(--color-danger);
  font-size: 12px;
  font-weight: 700;
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
