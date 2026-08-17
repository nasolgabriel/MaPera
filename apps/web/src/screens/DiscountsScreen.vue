<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import { isSavingsAccount } from '../domain/stats';
import { applyDiscount, findRule, ratePercent } from '../domain/discounts';
import type { DiscountRole, FareMode } from '../domain/discounts';

const store = useLedgerStore();

const ROLES: { id: DiscountRole; label: string }[] = [
  { id: 'student', label: 'Student' },
  { id: 'senior', label: 'Senior' },
  { id: 'pwd', label: 'PWD' },
];
const MODES: { id: FareMode; label: string }[] = [
  { id: 'jeepney', label: 'Jeepney' },
  { id: 'bus_train', label: 'Bus / Train' },
];

const role = ref<DiscountRole>('student');
const mode = ref<FareMode>('jeepney');
const baseText = ref('');
const accountId = ref<string | null>(null);
const categoryId = ref<string | null>(null);
const logging = ref(false);
const logged = ref(false);

const payAccounts = computed(() => store.accounts.filter((a) => !a.archived && !isSavingsAccount(a)));
const expenseCategories = computed(() => store.categories.filter((c) => c.kind === 'expense'));

const rule = computed(() => findRule(store.discountRules, role.value, mode.value));

const baseCentavos = computed(() => {
  const trimmed = baseText.value.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0;
  const [whole, frac = ''] = trimmed.split('.');
  return parseInt(whole!, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
});

const result = computed(() =>
  rule.value === null || baseCentavos.value <= 0 ? null : applyDiscount(baseCentavos.value, rule.value),
);

const ruleLine = computed(() =>
  rule.value === null ? '' : `${rule.value.label} · ${ratePercent(rule.value)}% off · rounds to ₱0.25`,
);

const canLog = computed(() => result.value !== null && accountId.value !== null && !logging.value);

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

function pesoWhole(centavos: number): string {
  return `₱ ${Math.round(centavos / 100).toLocaleString('en-PH')}`;
}

function pickRole(next: DiscountRole): void {
  role.value = next;
  logged.value = false;
}

function pickMode(next: FareMode): void {
  mode.value = next;
  logged.value = false;
}

async function logIt(): Promise<void> {
  if (!canLog.value || result.value === null || rule.value === null || accountId.value === null) return;
  logging.value = true;
  try {
    await store.logDiscountedFare({
      ruleId: rule.value.id,
      baseCentavos: result.value.base,
      discountedCentavos: result.value.discounted,
      accountId: accountId.value,
      categoryId: categoryId.value,
      note: rule.value.label,
    });
    baseText.value = '';
    logged.value = true;
  } finally {
    logging.value = false;
  }
}

onMounted(async () => {
  if (!store.loaded) await store.load();
  accountId.value = payAccounts.value[0]?.id ?? null;
  categoryId.value =
    expenseCategories.value.find((c) => /transport|fare|commute/i.test(c.name))?.id ?? null;
});
</script>

<template>
  <main class="screen">
    <h1 class="title">Fare discounts</h1>

    <div class="roles">
      <button
        v-for="r in ROLES"
        :key="r.id"
        :class="['role', { active: role === r.id }]"
        :aria-pressed="role === r.id"
        @click="pickRole(r.id)"
      >
        {{ r.label }}
      </button>
    </div>

    <div class="modes">
      <button
        v-for="m in MODES"
        :key="m.id"
        :class="['mode', { active: mode === m.id }]"
        :aria-pressed="mode === m.id"
        @click="pickMode(m.id)"
      >
        {{ m.label }}
      </button>
    </div>

    <label class="base">
      <span class="peso-mark mono">₱</span>
      <input
        v-model="baseText"
        class="base-input mono"
        inputmode="decimal"
        placeholder="0.00"
        aria-label="Base fare"
      />
    </label>

    <section v-if="result" class="result">
      <span class="rule-line mono">{{ ruleLine }}</span>
      <span class="discounted amount">{{ peso.format(result.discounted / 100) }}</span>
      <span class="kept mono">you keep {{ peso.format(result.kept / 100) }}</span>
    </section>
    <p v-else class="hint">Enter the regular fare to see the discounted price.</p>

    <div class="chips">
      <label class="chip">
        <span class="chip-label mono">pay from</span>
        <select v-model="accountId" aria-label="Account">
          <option v-for="a in payAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <label class="chip">
        <span class="chip-label mono">category</span>
        <select v-model="categoryId" aria-label="Category">
          <option :value="null">Uncategorized</option>
          <option v-for="c in expenseCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
    </div>

    <button class="log-btn" :disabled="!canLog" @click="logIt">
      {{ logging ? '…' : 'Log it as expense' }}
    </button>
    <p v-if="logged" class="logged mono" role="status">Logged.</p>

    <p class="yearly mono">
      saved {{ pesoWhole(store.discountSavedThisYear) }} with discounts this year
    </p>
    <p class="footnote mono">
      rules = versioned JSON (v{{ store.discountRulesVersion }}) — groceries/meds/restaurants can
      ship later without an app update
    </p>
  </main>
</template>

<style scoped>
.screen {
  max-width: 480px;
  margin: 0 auto;
  padding: 14px 16px 120px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
}
.roles {
  display: flex;
  gap: 6px;
}
.role {
  min-height: 44px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--color-muted);
  color: var(--color-text);
  font-size: 11px;
}
.role.active {
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
}
.modes {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.mode {
  min-height: 56px;
  border-radius: 10px;
  background: var(--color-muted);
  color: var(--color-text);
  font-size: 11px;
}
.mode.active {
  background: var(--color-accent);
  color: #16213a;
  font-weight: 700;
}
.base {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 2px solid var(--color-primary);
  border-radius: 10px;
}
.peso-mark {
  font-size: 16px;
  color: var(--color-textDim);
}
.base-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 16px;
  font-weight: 800;
}
.base-input:focus {
  outline: none;
}
.result {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 16px;
  border-radius: 12px;
  background: #16213a;
}
.rule-line {
  font-size: 9px;
  color: #8b97ad;
}
.discounted {
  font-size: 26px;
  font-weight: 800;
  color: #ffc93e;
}
.kept {
  font-size: 10px;
  color: #8b97ad;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-textDim);
}
.chips {
  display: flex;
  gap: 8px;
}
.chip {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
}
.chip-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-textDim);
}
.chip select {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
}
.log-btn {
  min-height: 44px;
  border-radius: 22px;
  background: var(--color-accent);
  color: #16213a;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(246, 181, 30, 0.35);
}
.log-btn:disabled {
  opacity: 0.4;
  box-shadow: none;
}
.logged {
  margin: 0;
  font-size: 10px;
  text-align: center;
  color: var(--color-textDim);
}
.yearly {
  margin: 0;
  font-size: 10px;
  text-align: center;
  color: var(--color-accentText);
}
.footnote {
  margin: 0;
  font-size: 8px;
  line-height: 1.5;
  text-align: center;
  color: var(--color-textDim);
}
</style>
