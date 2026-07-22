<script setup lang="ts">
// §7.3 payday split sheet (wireframe A5) — offered after logging income, never forced.
// Allocation amounts come from domain allocateSplit (same precedent as LogSheet's
// isSavingsAccount import); persistence goes through the store.
import { computed, ref } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import { allocateSplit, parsePresetBuckets } from '../domain/split';
import { isSavingsAccount } from '../domain/stats';
import type { SplitBucket } from '../domain/split';
import type { Transaction } from '../db/repositories/types';

const props = defineProps<{ txn: Transaction }>();
const emit = defineEmits<{ done: [] }>();

const store = useLedgerStore();

/** Editable bucket rows + the value as typed (pesos or %), converted at the boundary. */
interface Row {
  bucket: SplitBucket;
  text: string;
}

const rows = ref<Row[]>([]);
const activePresetId = ref<string | null>(null);
const namingPreset = ref(false);
const presetName = ref('');
const applying = ref(false);

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const categoryName = computed(() => new Map(store.categories.map((c) => [c.id, c.name])));
const accountName = computed(() => new Map(store.accounts.map((a) => [a.id, a.name])));
const expenseCategories = computed(() => store.categories.filter((c) => c.kind === 'expense'));
const savingsAccounts = computed(() => store.accounts.filter((a) => !a.archived && isSavingsAccount(a)));

const headline = computed(() => {
  const cat = props.txn.category_id ? categoryName.value.get(props.txn.category_id) ?? 'Income' : 'Income';
  const acct = accountName.value.get(props.txn.account_id) ?? '?';
  return `${cat} → ${acct}`;
});

const result = computed(() => allocateSplit(props.txn.amount, rows.value.map((r) => r.bucket)));

const canApply = computed(
  () => !applying.value && rows.value.length > 0 && !result.value.overAllocated,
);

/** `50% · ₱10,000` for percent rows, `₱2,000 fixed` for fixed rows (wireframe A5). */
function rowAmount(index: number): string {
  const alloc = result.value.allocations[index];
  if (!alloc) return '';
  const amount = peso.format(alloc.amount / 100);
  return alloc.bucket.mode === 'percent'
    ? `${(alloc.bucket.value / 100).toLocaleString('en-PH', { maximumFractionDigits: 2 })}% · ${amount}`
    : `${amount} fixed`;
}

// ── boundary conversion: typed text ⇄ integer bucket value (bp or centavos) ──
// Percent → basis points and pesos → centavos are both ×100 at 2-decimal precision,
// so one converter serves both modes.
function valueFromText(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  return parseInt(whole!, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
}

function textFromValue(value: number): string {
  return value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2);
}

function onValueInput(row: Row, e: Event): void {
  row.text = (e.target as HTMLInputElement).value;
  const value = valueFromText(row.text);
  if (value !== null) row.bucket.value = value;
  activePresetId.value = null;
}

function toggleMode(row: Row): void {
  row.bucket.mode = row.bucket.mode === 'percent' ? 'fixed' : 'percent';
  row.bucket.value = valueFromText(row.text) ?? 0;
  activePresetId.value = null;
}

function onTargetChange(row: Row, e: Event): void {
  const [type, id] = (e.target as HTMLSelectElement).value.split(':', 2);
  row.bucket.target =
    type === 'budget' ? { type: 'budget', category_id: id! } : { type: 'account', account_id: id! };
  activePresetId.value = null;
}

function targetValue(bucket: SplitBucket): string {
  return bucket.target.type === 'budget'
    ? `budget:${bucket.target.category_id}`
    : `account:${bucket.target.account_id}`;
}

function addRow(): void {
  const target: SplitBucket['target'] = expenseCategories.value[0]
    ? { type: 'budget', category_id: expenseCategories.value[0].id }
    : { type: 'account', account_id: savingsAccounts.value[0]?.id ?? '' };
  rows.value.push({ bucket: { target, mode: 'percent', value: 0 }, text: '0' });
  activePresetId.value = null;
}

function removeRow(index: number): void {
  rows.value.splice(index, 1);
  activePresetId.value = null;
}

function pickPreset(id: string): void {
  const preset = store.presets.find((p) => p.id === id);
  const buckets = preset ? parsePresetBuckets(preset.buckets) : null;
  if (!buckets) return; // malformed preset JSON — ignore rather than crash (§ B6 note style)
  rows.value = buckets.map((bucket) => ({ bucket, text: textFromValue(bucket.value) }));
  activePresetId.value = id;
}

async function saveAsPreset(): Promise<void> {
  const name = presetName.value.trim();
  if (!name || rows.value.length === 0) return;
  await store.savePreset(name, rows.value.map((r) => r.bucket));
  namingPreset.value = false;
  presetName.value = '';
}

async function apply(): Promise<void> {
  if (!canApply.value) return;
  applying.value = true;
  try {
    await store.applySplit(props.txn, rows.value.map((r) => r.bucket));
    emit('done');
  } finally {
    applying.value = false;
  }
}
</script>

<template>
  <div class="backdrop">
    <section class="split-sheet" role="dialog" aria-label="Split this income">
      <h2 class="title">Split this income?</h2>

      <div class="income-card">
        <span class="income-label">{{ headline }}</span>
        <span class="income-amount amount">{{ peso.format(txn.amount / 100) }}</span>
      </div>

      <div class="presets">
        <button
          v-for="p in store.presets"
          :key="p.id"
          :class="['preset', { active: activePresetId === p.id }]"
          @click="pickPreset(p.id)"
        >
          {{ p.name }}
        </button>
        <button v-if="!namingPreset" class="preset" @click="namingPreset = true">+ new</button>
        <template v-else>
          <input v-model="presetName" class="preset-name" placeholder="preset name" @keyup.enter="saveAsPreset" />
          <button class="preset" :disabled="rows.length === 0 || !presetName.trim()" @click="saveAsPreset">save</button>
        </template>
      </div>

      <div class="buckets">
        <div v-for="(row, i) in rows" :key="i" class="bucket">
          <select class="bucket-target" :value="targetValue(row.bucket)" :aria-label="`Bucket ${i + 1} target`" @change="onTargetChange(row, $event)">
            <optgroup label="Budget caps">
              <option v-for="c in expenseCategories" :key="c.id" :value="`budget:${c.id}`">{{ c.name }} cap</option>
            </optgroup>
            <optgroup label="Savings">
              <option v-for="a in savingsAccounts" :key="a.id" :value="`account:${a.id}`">{{ a.name }}</option>
            </optgroup>
          </select>
          <button class="bucket-mode mono" :aria-label="`Bucket ${i + 1} mode`" @click="toggleMode(row)">
            {{ row.bucket.mode === 'percent' ? '%' : '₱' }}
          </button>
          <input
            class="bucket-value mono"
            inputmode="decimal"
            :value="row.text"
            :aria-label="`Bucket ${i + 1} value`"
            @input="onValueInput(row, $event)"
          />
          <span class="bucket-amount mono">{{ rowAmount(i) }}</span>
          <button class="bucket-remove" :aria-label="`Remove bucket ${i + 1}`" @click="removeRow(i)">✕</button>
        </div>
        <button class="add-bucket" @click="addRow">+ bucket</button>
        <div :class="['left-free', 'mono', { over: result.overAllocated }]">
          <span>{{ result.overAllocated ? 'over-allocated' : 'left free' }}</span>
          <span>{{ peso.format(result.leftFree / 100) }}</span>
        </div>
      </div>

      <p class="hint mono">any buckets · ₱ or % · always editable before apply</p>

      <div class="actions">
        <button class="skip" @click="emit('done')">Skip</button>
        <button class="apply" :disabled="!canApply" @click="apply">{{ applying ? '…' : 'Apply split' }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45); /* §6 dim */
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 30;
}
.split-sheet {
  width: 100%;
  max-width: 480px;
  max-height: calc(100dvh - var(--safe-top) - 24px);
  overflow-y: auto;
  border-radius: 16px 16px 0 0; /* sheet radius (§5) */
  background: var(--color-surface);
  padding: 16px 16px calc(16px + var(--safe-bottom));
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
}
.income-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 12px;
  background: #16213a; /* dark card per wireframe A5, both themes */
  padding: 12px 14px;
}
.income-label {
  font-size: 12px;
  color: #e7ecf5;
}
.income-amount {
  font-size: 16px;
  font-weight: 800;
  color: #ffc93e; /* saffron money moment */
}
.presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.preset {
  padding: 5px 12px;
  border-radius: 12px;
  background: var(--color-muted);
  font-size: 11px;
}
.preset.active {
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
}
.preset:disabled {
  opacity: 0.4;
}
.preset-name {
  flex: 1;
  min-width: 0;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 11px;
}
.buckets {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bucket {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 6px 8px;
}
.bucket-target {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
}
.bucket-mode {
  min-width: 32px;
  min-height: 32px;
  border-radius: 8px;
  background: var(--color-muted);
  font-size: 12px;
}
.bucket-value {
  width: 64px;
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 12px;
  text-align: right;
}
.bucket-amount {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 600;
  color: var(--color-accentText);
}
.bucket-remove {
  min-width: 28px;
  min-height: 28px;
  color: var(--color-textDim);
  font-size: 11px;
}
.add-bucket {
  min-height: 32px;
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  color: var(--color-textDim);
  font-size: 11px;
}
.left-free {
  display: flex;
  justify-content: space-between;
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 11px;
  color: var(--color-textDim);
}
.left-free.over {
  border-color: var(--color-danger);
  color: var(--color-danger);
  font-weight: 600;
}
.hint {
  margin: 0;
  font-size: 9px;
  color: var(--color-textDim);
}
.actions {
  display: flex;
  gap: 8px;
}
.skip {
  flex: 1;
  min-height: 44px;
  border-radius: 22px;
  background: var(--color-muted);
  font-size: 12px;
  font-weight: 600;
}
.apply {
  flex: 2;
  min-height: 44px;
  border-radius: 22px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
.apply:disabled {
  opacity: 0.4;
}
</style>
