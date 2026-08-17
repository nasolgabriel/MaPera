<script setup lang="ts">
import { computed, ref } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import { isSavingsAccount } from '../domain/stats';
import { useSheetGuard } from '../composables/useSheetGuard';
import type { SweepOffer } from '../domain/gamification';

const props = defineProps<{ offer: SweepOffer }>();
const emit = defineEmits<{ confirm: [sourceId: string, destinationId: string]; close: [] }>();

useSheetGuard();
const store = useLedgerStore();
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

const sourceAccounts = computed(() =>
  store.accounts.filter((a) => !a.archived && !isSavingsAccount(a)),
);
const destinationAccounts = computed(() =>
  store.accounts.filter((a) => !a.archived && isSavingsAccount(a)),
);

const sourceId = ref(sourceAccounts.value[0]?.id ?? '');
const destinationId = ref(destinationAccounts.value[0]?.id ?? '');
const sweeping = ref(false);

const monthLabel = computed(() => {
  const [y, m] = props.offer.month.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-PH', { month: 'long' });
});

const canConfirm = computed(
  () =>
    !sweeping.value &&
    sourceId.value !== '' &&
    destinationId.value !== '' &&
    sourceId.value !== destinationId.value,
);

function confirm(): void {
  if (!canConfirm.value) return;
  sweeping.value = true;
  try {
    emit('confirm', sourceId.value, destinationId.value);
  } finally {
    sweeping.value = false;
  }
}
</script>

<template>
  <div class="backdrop" @pointerdown.self="emit('close')">
    <section class="sheet" role="dialog" :aria-label="`Sweep ${monthLabel} leftover`">
      <h2 class="title">Sweep {{ monthLabel }} leftover</h2>

      <div class="figure">
        <span class="figure-label mono">moving into savings</span>
        <span class="figure-amount amount">{{ peso.format(offer.leftover / 100) }}</span>
        <span class="figure-note mono">counts ×2 toward your streak</span>
      </div>

      <label class="field">
        <span class="field-label mono">from</span>
        <select v-model="sourceId" class="picker" aria-label="Source account">
          <option v-for="a in sourceAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>

      <label class="field">
        <span class="field-label mono">into</span>
        <select v-model="destinationId" class="picker" aria-label="Destination savings account">
          <option v-for="a in destinationAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>

      <p v-if="destinationAccounts.length === 0" class="warn mono">
        No savings account to sweep into yet.
      </p>

      <div class="actions">
        <button class="cancel" @click="emit('close')">Cancel</button>
        <button class="sweep" :disabled="!canConfirm" @click="confirm">
          {{ sweeping ? '…' : 'Sweep it' }}
        </button>
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
.figure {
  display: flex;
  flex-direction: column;
  gap: 3px;
  border-radius: 12px;
  background: var(--color-muted);
  padding: 12px;
}
.figure-label {
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-textDim);
}
.figure-amount {
  font-size: 24px;
  font-weight: 800;
  color: var(--color-accentText);
}
.figure-note {
  font-size: 9px;
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
.picker {
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
}
.warn {
  margin: 0;
  font-size: 10px;
  color: #b3282d;
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
.sweep {
  flex: 2;
  min-height: 44px;
  border-radius: 22px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
.sweep:disabled {
  opacity: 0.4;
}
</style>
