<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import BackButton from '../components/BackButton.vue';
import { suggestedPrice } from '../domain/savedItems';
import SavedItemSheet from '../components/SavedItemSheet.vue';
import type { SavedItem } from '../db/repositories/types';

const store = useLedgerStore();

const editing = ref<SavedItem | 'new' | null>(null);

const categoryNames = computed(() => new Map(store.categories.map((c) => [c.id, c.name])));

function categoryLabel(item: SavedItem): string {
  return item.category_id === null ? 'Uncategorized' : categoryNames.value.get(item.category_id) ?? 'Uncategorized';
}

function peso(centavos: number): string {
  const pesos = centavos / 100;
  return `₱ ${pesos.toLocaleString('en-PH', { minimumFractionDigits: pesos % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

async function onSave(item: SavedItem): Promise<void> {
  await store.saveSavedItem(item);
  editing.value = null;
}

async function onRemove(id: string): Promise<void> {
  await store.deleteSavedItem(id);
  editing.value = null;
}

onMounted(async () => {
  if (!store.loaded) await store.load();
});
</script>

<template>
  <main class="screen">
    <header class="screen-head">
      <BackButton to="/more" label="Back to More" />
      <h1 class="title">Saved items</h1>
    </header>
    <p class="lede">
      Your quick-log library. Start typing a name in the log sheet's note field and these
      suggest themselves — tap one to fill in price, category and kind.
    </p>

    <ul class="items">
      <li v-for="item in store.savedItems" :key="item.id">
        <button class="item" @click="editing = item">
          <span class="left">
            <span class="name">{{ item.name }}</span>
            <span class="meta mono">
              <template v-if="item.description">{{ item.description }} · </template>
              {{ categoryLabel(item) }} · used {{ item.use_count }}×
            </span>
          </span>
          <span class="right">
            <span class="price amount">{{ peso(suggestedPrice(item)) }}</span>
            <span v-if="item.last_price !== null && item.last_price !== item.usual_price" class="usual mono">
              usually {{ peso(item.usual_price) }}
            </span>
          </span>
        </button>
      </li>
    </ul>

    <p v-if="store.savedItems.length === 0" class="empty">
      No saved items yet. Add the things you buy often — or flip “save this log as an item”
      when you log one.
    </p>

    <button class="new-btn" @click="editing = 'new'">New item</button>

    <SavedItemSheet
      v-if="editing !== null"
      :item="editing === 'new' ? null : editing"
      @save="onSave"
      @remove="onRemove"
      @close="editing = null"
    />
  </main>
</template>

<style scoped>
.screen {
  max-width: 480px;
  margin: 0 auto;
  padding: 14px 16px 120px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
}
.lede {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--color-textDim);
}
.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  width: 100%;
  min-height: 56px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
}
.left {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.name {
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 10px;
  color: var(--color-textDim);
}
.right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex: none;
}
.price {
  font-size: 14px;
  font-weight: 800;
  color: var(--color-accentText);
}
.usual {
  font-size: 9px;
  color: var(--color-textDim);
}
.empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--color-textDim);
}
.new-btn {
  min-height: 44px;
  border-radius: 22px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
</style>
