<script setup lang="ts">
import { computed, ref } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import { useSheetGuard } from '../composables/useSheetGuard';
import type { SavedItem } from '../db/repositories/types';

const props = defineProps<{ item: SavedItem | null }>();
const emit = defineEmits<{ save: [item: SavedItem]; remove: [id: string]; close: [] }>();

useSheetGuard();
const store = useLedgerStore();

const name = ref(props.item?.name ?? '');
const description = ref(props.item?.description ?? '');
const priceText = ref(props.item ? centavosToText(props.item.usual_price) : '');
const kind = ref<SavedItem['kind']>(props.item?.kind ?? 'expense');
const categoryId = ref(props.item?.category_id ?? '');

const isEdit = computed(() => props.item !== null);

const categories = computed(() => store.categories.filter((c) => c.kind === kind.value));

const priceCentavos = computed(() => {
  const trimmed = priceText.value.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0;
  const [whole, frac = ''] = trimmed.split('.');
  return parseInt(whole!, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
});

function centavosToText(c: number): string {
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2);
}

function pickKind(k: SavedItem['kind']): void {
  kind.value = k;
  if (!categories.value.some((c) => c.id === categoryId.value)) categoryId.value = '';
}

const canSave = computed(() => name.value.trim() !== '' && priceCentavos.value > 0);

function save(): void {
  if (!canSave.value) return;
  emit('save', {
    id: props.item?.id ?? crypto.randomUUID(),
    name: name.value.trim(),
    description: description.value.trim() === '' ? null : description.value.trim(),
    usual_price: priceCentavos.value,
    last_price: props.item?.last_price ?? null,
    category_id: categoryId.value === '' ? null : categoryId.value,
    kind: kind.value,
    use_count: props.item?.use_count ?? 0,
    last_used_at: props.item?.last_used_at ?? null,
  });
}
</script>

<template>
  <div class="backdrop" @pointerdown.self="emit('close')">
    <section class="sheet" role="dialog" :aria-label="isEdit ? 'Edit saved item' : 'New saved item'">
      <h2 class="title">{{ isEdit ? 'Edit item' : 'New item' }}</h2>

      <label class="field">
        <span class="field-label mono">name</span>
        <input v-model="name" class="text" placeholder="e.g. Ligo Sardines" aria-label="Item name" />
      </label>

      <label class="field">
        <span class="field-label mono">description (optional)</span>
        <input
          v-model="description"
          class="text"
          placeholder="e.g. 155g easy-open"
          aria-label="Item description"
        />
      </label>

      <label class="field">
        <span class="field-label mono">usual price</span>
        <div class="amount-row">
          <span class="peso mono">₱</span>
          <input
            v-model="priceText"
            class="amount mono"
            inputmode="decimal"
            placeholder="0.00"
            aria-label="Usual price"
          />
        </div>
      </label>

      <div class="field">
        <span class="field-label mono">kind</span>
        <div class="kinds">
          <button
            v-for="k in (['expense', 'income'] as const)"
            :key="k"
            :class="['kind', { active: kind === k }]"
            @click="pickKind(k)"
          >
            {{ k === 'expense' ? 'Expense' : 'Income' }}
          </button>
        </div>
      </div>

      <label class="field">
        <span class="field-label mono">category</span>
        <select v-model="categoryId" class="text" aria-label="Category">
          <option value="">Uncategorized</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>

      <div class="actions">
        <button
          v-if="isEdit"
          class="delete"
          aria-label="Delete saved item"
          @click="emit('remove', item!.id)"
        >
          Delete
        </button>
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
.kinds {
  display: flex;
  gap: 6px;
}
.kind {
  flex: 1;
  min-height: 44px;
  border-radius: 10px;
  background: var(--color-muted);
  color: var(--color-text);
  font-size: 12px;
}
.kind.active {
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
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
