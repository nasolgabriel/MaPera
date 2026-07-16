<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLedgerStore } from '../stores/ledger';
import { isSavingsAccount } from '../domain/stats';

type Kind = 'expense' | 'income' | 'saving';

const router = useRouter();
const store = useLedgerStore();

const kind = ref<Kind>('expense');
const amountDigits = ref(''); // digits typed = centavos (12050 → ₱120.50)
const categoryId = ref<string | null>(null);
const accountId = ref<string | null>(null);
const toAccountId = ref<string | null>(null);
const date = ref(new Date().toISOString().slice(0, 10));
const note = ref('');
const saving = ref(false);

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const centavos = computed(() => (amountDigits.value ? parseInt(amountDigits.value, 10) : 0));
const amountLabel = computed(() => peso.format(centavos.value / 100));

const regularAccounts = computed(() => store.accounts.filter((a) => !a.archived && !isSavingsAccount(a)));
const savingsAccounts = computed(() => store.accounts.filter((a) => !a.archived && isSavingsAccount(a)));
const activeAccounts = computed(() => store.accounts.filter((a) => !a.archived));

const gridCategories = computed(() =>
  kind.value === 'saving' ? [] : store.categories.filter((c) => c.kind === kind.value).slice(0, 12),
);

const canSave = computed(() => {
  if (centavos.value <= 0 || saving.value) return false;
  if (kind.value === 'saving') {
    return !!accountId.value && !!toAccountId.value && accountId.value !== toAccountId.value;
  }
  return !!accountId.value;
});

function pickKind(k: Kind): void {
  kind.value = k;
  categoryId.value = null;
  applyDefaults();
}

function applyDefaults(): void {
  if (kind.value === 'saving') {
    accountId.value = regularAccounts.value[0]?.id ?? null;
    toAccountId.value = savingsAccounts.value[0]?.id ?? null;
  } else {
    accountId.value = activeAccounts.value[0]?.id ?? null;
    toAccountId.value = null;
  }
}

function tapKey(d: string): void {
  if (amountDigits.value === '' && parseInt(d, 10) === 0) return;
  if (amountDigits.value.length + d.length > 9) return;
  amountDigits.value += d;
}

function backspace(): void {
  amountDigits.value = amountDigits.value.slice(0, -1);
}

async function save(): Promise<void> {
  if (!canSave.value || !accountId.value) return;
  saving.value = true;
  try {
    const isSaving = kind.value === 'saving';
    const txnKind: 'expense' | 'income' | 'transfer' = kind.value === 'saving' ? 'transfer' : kind.value;
    await store.addTransaction({
      amount: centavos.value,
      kind: txnKind,
      account_id: accountId.value,
      to_account_id: isSaving ? toAccountId.value : null,
      category_id: isSaving ? null : categoryId.value,
      date: date.value,
      note: note.value.trim() || null,
    });
    router.push('/');
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  if (!store.loaded) await store.load();
  applyDefaults();
});
</script>

<template>
  <main class="sheet">
    <button class="close" aria-label="Close" @click="router.push('/')">✕</button>

    <div class="kinds" role="tablist">
      <button
        v-for="k in (['expense', 'income', 'saving'] as const)"
        :key="k"
        role="tab"
        :aria-selected="kind === k"
        :class="['kind', { active: kind === k }]"
        @click="pickKind(k)"
      >
        {{ k === 'expense' ? 'Expense' : k === 'income' ? 'Income' : 'Saving' }}
      </button>
    </div>

    <div :class="['amount-display', { empty: centavos === 0 }]">
      <span class="amount">{{ amountLabel }}</span><span class="cursor" aria-hidden="true">|</span>
    </div>

    <section v-if="kind !== 'saving'" class="cats">
      <button
        v-for="c in gridCategories"
        :key="c.id"
        :class="['cat', { active: categoryId === c.id }]"
        @click="categoryId = categoryId === c.id ? null : c.id"
      >
        {{ c.name }}
      </button>
      <p v-if="gridCategories.length === 0" class="hint">No categories yet.</p>
    </section>

    <!-- Saving logs as a transfer regular→savings account, not an expense (§7.2). -->
    <section v-else class="chips">
      <label class="chip">
        <span class="chip-label">from</span>
        <select v-model="accountId">
          <option v-for="a in regularAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <label class="chip">
        <span class="chip-label">to</span>
        <select v-model="toAccountId">
          <option v-for="a in savingsAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
    </section>

    <section class="chips">
      <label v-if="kind !== 'saving'" class="chip">
        <span class="chip-label">acct:</span>
        <select v-model="accountId">
          <option v-for="a in activeAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <label class="chip">
        <input v-model="date" type="date" aria-label="Date" />
      </label>
    </section>

    <input v-model="note" type="text" class="note" placeholder="note…" />

    <div class="keypad">
      <button v-for="d in ['1','2','3','4','5','6','7','8','9']" :key="d" class="key" @click="tapKey(d)">{{ d }}</button>
      <button class="key key-muted" @click="tapKey('00')">00</button>
      <button class="key" @click="tapKey('0')">0</button>
      <button class="key key-muted" aria-label="Backspace" @click="backspace">⌫</button>
    </div>

    <button class="save" :disabled="!canSave" @click="save">{{ saving ? '…' : 'Save' }}</button>
  </main>
</template>

<style scoped>
.sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
  padding: 14px 16px 16px;
  gap: 10px;
  background: var(--color-bg);
}
.close {
  position: absolute;
  top: 6px;
  left: 8px;
  color: var(--color-textDim);
  font-size: 16px;
}
.kinds {
  display: flex;
  gap: 6px;
  justify-content: center;
}
.kind {
  min-height: 34px;
  padding: 6px 16px;
  border-radius: 999px;
  background: var(--color-muted);
  color: var(--color-text);
  font-size: 13px;
}
.kind.active {
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
}
.amount-display {
  text-align: center;
  padding: 6px 0;
  border-bottom: 2px solid var(--color-primary);
}
.amount-display .amount {
  font-size: 34px;
  color: var(--color-text);
}
.amount-display.empty {
  border-bottom-color: var(--color-border);
}
.amount-display.empty .amount {
  color: var(--color-textDim);
}
.cursor {
  color: var(--color-border);
  font-size: 30px;
  font-weight: 400;
  animation: blink 1.1s step-end infinite;
}
@keyframes blink {
  50% { opacity: 0; }
}
.cats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 7px;
}
.cat {
  min-height: 50px;
  padding: 4px;
  border-radius: 10px;
  background: var(--color-muted);
  color: var(--color-text);
  font-size: 12px;
}
.cat.active {
  background: var(--color-accent); /* saffron, not primary — §5 money-moment rule */
  font-weight: 700;
}
.hint {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-textDim);
}
.chips {
  display: flex;
  gap: 8px;
}
.chip {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--color-muted);
  font-family: 'Spline Sans Mono', monospace;
  font-size: 12px;
  color: var(--color-textDim);
}
.chip select,
.chip input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
}
.chip select:focus,
.chip input:focus {
  outline: none;
}
.note {
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
}
.note::placeholder {
  color: var(--color-textDim);
}
.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: auto;
}
.key {
  min-height: 52px;
  border-radius: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-family: 'Spline Sans Mono', monospace;
  font-size: 20px;
}
.key-muted {
  color: var(--color-textDim);
}
.save {
  min-height: 48px;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
}
.save:disabled {
  opacity: 0.4;
}
</style>
