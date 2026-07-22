<script setup lang="ts">
// Budget caps screen (wireframe B1): safe-spend/day, per-category bars, caps editor.
// All amounts come from the store's domain-wired computeds — no money math here.
import { computed, onMounted, ref } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import BudgetBar from '../components/BudgetBar.vue';

const store = useLedgerStore();

const editing = ref(false);
/** Draft cap inputs while editing, keyed by category id, in pesos-as-typed text. */
const drafts = ref(new Map<string, string>());

const monthLabel = computed(() => {
  const [y, m] = store.month.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-PH', { month: 'long' });
});

const expenseCategories = computed(() => store.categories.filter((c) => c.kind === 'expense'));

/** View mode shows only capped categories (wireframe B1); edit mode shows all so caps can be added. */
const rows = computed(() =>
  editing.value ? expenseCategories.value : expenseCategories.value.filter((c) => store.capsByCategory.has(c.id)),
);

const uncategorizedSpent = computed(
  () => store.spendSlices.find((s) => s.category_id === null)?.amount ?? 0,
);

function pesoWhole(centavos: number): string {
  const sign = centavos < 0 ? '−' : '';
  return `${sign}₱ ${Math.floor(Math.abs(centavos) / 100).toLocaleString('en-PH')}`;
}

// ── caps editing (boundary conversion only: typed pesos text ⇄ integer centavos) ──
function centavosFromText(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (trimmed === '') return 0; // cleared → remove cap
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null; // invalid → ignore
  const [whole, frac = ''] = trimmed.split('.');
  return parseInt(whole!, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
}

function textFromCentavos(centavos: number): string {
  return centavos % 100 === 0 ? String(centavos / 100) : (centavos / 100).toFixed(2);
}

function startEditing(): void {
  drafts.value = new Map(
    expenseCategories.value.map((c) => {
      const cap = store.capsByCategory.get(c.id);
      return [c.id, cap === undefined ? '' : textFromCentavos(cap)];
    }),
  );
  editing.value = true;
}

async function saveEdits(): Promise<void> {
  for (const c of expenseCategories.value) {
    const draft = drafts.value.get(c.id) ?? '';
    const centavos = centavosFromText(draft);
    if (centavos === null) continue; // invalid input — leave that cap untouched
    const current = store.capsByCategory.get(c.id) ?? 0;
    if (centavos !== current) await store.setCap(c.id, centavos);
  }
  editing.value = false;
}

function setDraft(id: string, e: Event): void {
  drafts.value.set(id, (e.target as HTMLInputElement).value);
}

onMounted(async () => {
  if (!store.loaded) await store.load();
});
</script>

<template>
  <main class="screen">
    <h1 class="title">Budgets · {{ monthLabel }}</h1>

    <div v-if="store.safeSpendToday !== null" class="safe-card">
      <span class="safe-label">safe to spend today</span>
      <span class="safe-value amount">
        {{ pesoWhole(store.safeSpendToday) }}/day
        <span class="safe-days mono">· {{ store.daysLeft }} {{ store.daysLeft === 1 ? 'day' : 'days' }} left</span>
      </span>
    </div>

    <div class="bars">
      <template v-for="c in rows" :key="c.id">
        <div v-if="editing" class="edit-row">
          <span class="edit-label">{{ c.name }}</span>
          <label class="edit-field mono">
            ₱
            <input
              inputmode="decimal"
              :value="drafts.get(c.id) ?? ''"
              :aria-label="`${c.name} cap`"
              placeholder="no cap"
              @input="setDraft(c.id, $event)"
            />
          </label>
        </div>
        <BudgetBar
          v-else
          :label="c.name"
          :spent="store.spentByCappedCategory.get(c.id) ?? 0"
          :cap="store.capsByCategory.get(c.id) ?? 0"
          :used="store.usedByCategory.get(c.id) ?? null"
        />
      </template>
      <p v-if="rows.length === 0" class="empty">No caps set — tap Edit caps to add some.</p>
    </div>

    <div v-if="uncategorizedSpent > 0" class="uncat mono">
      <span>uncategorized</span><span>{{ pesoWhole(uncategorizedSpent) }}</span>
    </div>

    <button v-if="!editing" class="edit-btn" @click="startEditing">Edit caps</button>
    <div v-else class="edit-actions">
      <button class="cancel-btn" @click="editing = false">Cancel</button>
      <button class="save-btn" @click="saveEdits">Save caps</button>
    </div>
  </main>
</template>

<style scoped>
.screen {
  max-width: 480px;
  margin: 0 auto;
  padding: 14px 16px 120px; /* bottom clears the fixed hub button */
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
}
.safe-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 10px;
  background: var(--color-muted);
  padding: 10px 12px;
}
.safe-label {
  font-size: 11px;
}
.safe-value {
  font-size: 14px;
  font-weight: 800;
  color: var(--color-accentText); /* saffron money moment (§5) */
}
.safe-days {
  font-size: 9px;
  font-weight: 400;
  color: var(--color-textDim);
}
.bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.empty {
  margin: 0;
  font-size: 13px;
  color: var(--color-textDim);
}
.edit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.edit-label {
  font-size: 12px;
  font-weight: 700;
}
.edit-field {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  font-size: 12px;
  color: var(--color-textDim);
}
.edit-field input {
  width: 90px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: right;
}
.edit-field input:focus {
  outline: none;
}
.uncat {
  display: flex;
  justify-content: space-between;
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--color-textDim);
}
.edit-btn {
  min-height: 36px;
  border-radius: 18px;
  border: 2px solid var(--color-primary);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
}
.edit-actions {
  display: flex;
  gap: 8px;
}
.cancel-btn {
  flex: 1;
  min-height: 36px;
  border-radius: 18px;
  background: var(--color-muted);
  font-size: 12px;
  font-weight: 600;
}
.save-btn {
  flex: 2;
  min-height: 36px;
  border-radius: 18px;
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
</style>
