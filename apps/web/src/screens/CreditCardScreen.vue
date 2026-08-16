<script setup lang="ts">
// §7.8 Credit-card health (wireframe D3). One panel per active credit card, for the month
// the Budget home is showing — income_share and paid_in_full are both month-scoped (§8.6).
// Every figure comes from the store's domain-wired creditCardsView (§4: no math in the .vue).
import { computed, onMounted } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import CreditCardHealth from '../components/CreditCardHealth.vue';

const store = useLedgerStore();

/** 'YYYY-MM' → 'July' — the month every figure on this screen is scoped to. */
const monthLabel = computed(() => {
  const [y, m] = store.month.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-PH', { month: 'long' });
});

onMounted(async () => {
  if (!store.loaded) await store.load();
});
</script>

<template>
  <main class="screen">
    <h1 class="title">Card health · {{ monthLabel }}</h1>

    <CreditCardHealth
      v-for="card in store.creditCardsView"
      :key="card.account.id"
      :card="card"
      :month-label="monthLabel"
    />

    <p v-if="store.creditCardsView.length === 0" class="empty">
      No credit cards yet. Add one from More → Accounts to track utilization, spend share and points.
    </p>
  </main>
</template>

<style scoped>
.screen {
  max-width: 480px;
  margin: 0 auto;
  /* clear the fixed 64px hub button + safe area, like the other screens */
  padding: 12px 16px calc(104px + var(--safe-bottom));
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
}
.empty {
  margin: 0;
  padding: 12px 2px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-textDim);
}
</style>
