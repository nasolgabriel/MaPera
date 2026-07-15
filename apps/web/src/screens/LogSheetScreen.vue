<script setup lang="ts">
// §6.2 Log sheet (B1, minus saved-items §7.6 → B10).
// Kind toggle → amount keypad → category grid (or savings from→to). Save writes one row.
// Taxonomy §7.2: expense=−account, income=+account, saving=transfer regular→savings.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLedgerStore } from '../stores/ledger';
import { isSavingsAccount } from '../domain/stats';

type Kind = 'expense' | 'income' | 'saving';

const router = useRouter();
const store = useLedgerStore();

const kind = ref<Kind>('expense');
const amountDigits = ref(''); // digits typed = centavos, ATM-style (12050 → ₱120.50)
const categoryId = ref<string | null>(null);
const accountId = ref<string | null>(null); // expense/income: the account; saving: the source
const toAccountId = ref<string | null>(null); // saving: the destination (savings account)
const date = ref(new Date().toISOString().slice(0, 10));
const note = ref('');
const saving = ref(false);

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const centavos = computed(() => (amountDigits.value ? parseInt(amountDigits.value, 10) : 0));
const amountLabel = computed(() => peso.format(centavos.value / 100));

// Account splits (§7.2): regular = cash/credit_card, savings = bank/ewallet/investment.
const regularAccounts = computed(() => store.accounts.filter((a) => !a.archived && !isSavingsAccount(a)));
const savingsAccounts = computed(() => store.accounts.filter((a) => !a.archived && isSavingsAccount(a)));
const activeAccounts = computed(() => store.accounts.filter((a) => !a.archived));

// Category grid: expense→expense cats, income→income cats. Saving is a transfer, no category.
const gridCategories = computed(() =>
  kind.value === 'saving' ? [] : store.categories.filter((c) => c.kind === kind.value),
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

// Prefill accounts sensibly per kind (§6.2 "account prefilled / last used").
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
  // Cap at 9 digits (₱9,999,999.99) to keep the display sane.
  if (amountDigits.value.length >= 9) return;
  if (amountDigits.value === '' && d === '0') return; // no leading zeros
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
    <header class="top">
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
    </header>

    <div class="amount-display">
      <span class="amount">{{ amountLabel }}</span>
    </div>

    <!-- Category grid for expense/income (§6.2). -->
    <section v-if="kind !== 'saving'" class="cats">
      <button
        v-for="c in gridCategories"
        :key="c.id"
        :class="['cat', { active: categoryId === c.id }]"
        @click="categoryId = categoryId === c.id ? null : c.id"
      >
        <span class="cat-name">{{ c.name }}</span>
      </button>
      <p v-if="gridCategories.length === 0" class="hint">No categories yet.</p>
    </section>

    <!-- Saving = transfer from a regular account into a savings account (§7.2). -->
    <section v-else class="transfer">
      <label class="field">
        <span class="field-label">From</span>
        <select v-model="accountId">
          <option v-for="a in regularAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">To (savings)</span>
        <select v-model="toAccountId">
          <option v-for="a in savingsAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
    </section>

    <section class="meta">
      <label v-if="kind !== 'saving'" class="field">
        <span class="field-label">Account</span>
        <select v-model="accountId">
          <option v-for="a in activeAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">Date</span>
        <input v-model="date" type="date" />
      </label>
      <label class="field field-wide">
        <span class="field-label">Note</span>
        <input v-model="note" type="text" placeholder="Optional note" />
      </label>
    </section>

    <div class="keypad">
      <button v-for="d in ['1','2','3','4','5','6','7','8','9']" :key="d" class="key" @click="tapKey(d)">{{ d }}</button>
      <button class="key key-muted" aria-label="Backspace" @click="backspace">⌫</button>
      <button class="key" @click="tapKey('0')">0</button>
      <button class="key key-save" :disabled="!canSave" @click="save">
        {{ saving ? '…' : 'Save' }}
      </button>
    </div>
  </main>
</template>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 12px 16px 16px;
  gap: 12px;
  background: var(--color-bg);
}
.top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.close {
  color: var(--color-textDim);
  font-size: 18px;
}
.kinds {
  display: flex;
  flex: 1;
  gap: 4px;
  padding: 4px;
  background: var(--color-muted);
  border-radius: 999px;
}
.kind {
  flex: 1;
  min-height: 40px;
  border-radius: 999px;
  color: var(--color-textDim);
  font-weight: 600;
}
.kind.active {
  background: var(--color-primary);
  color: #fff;
}
.amount-display {
  text-align: center;
  padding: 8px 0 4px;
}
.amount-display .amount {
  font-size: 40px;
  color: var(--color-accentText); /* saffron = money moment (§5) */
}
.cats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.cat {
  min-height: 56px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
}
.cat.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
.hint {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-textDim);
}
.transfer,
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 130px;
}
.field-wide {
  flex-basis: 100%;
}
.field-label {
  font-family: 'Spline Sans Mono', monospace;
  font-size: 11px;
  color: var(--color-textDim);
  text-transform: uppercase;
}
.field select,
.field input {
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}
.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: auto;
}
.key {
  min-height: 56px;
  border-radius: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-family: 'Spline Sans Mono', monospace;
  font-size: 20px;
}
.key-muted {
  color: var(--color-textDim);
}
.key-save {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
  font-family: 'Libre Franklin', sans-serif;
  font-weight: 700;
}
.key-save:disabled {
  opacity: 0.4;
}
</style>
