<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useLedgerStore } from '../stores/ledger';
import BackButton from '../components/BackButton.vue';
import AccountEditorSheet from '../components/AccountEditorSheet.vue';
import { essenceShades, essenceVars } from '../theme/essence';
import type { Account } from '../db/repositories/types';

const store = useLedgerStore();

const editing = ref<Account | 'new' | null>(null);

const TYPE_LABEL: Record<Account['type'], string> = {
  cash: 'cash',
  ewallet: 'e-wallet',
  bank: 'bank',
  investment: 'investment',
  credit_card: 'credit card',
};

const rows = computed(() => store.accounts.filter((a) => !a.archived));

function peso(centavos: number): string {
  const sign = centavos < 0 ? '−' : '';
  const pesos = Math.abs(centavos) / 100;
  return `${sign}₱ ${pesos.toLocaleString('en-PH', { minimumFractionDigits: pesos % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function balanceText(account: Account): string {
  return peso(store.accountBalances.get(account.id) ?? 0);
}

async function onSave(account: Account): Promise<void> {
  await store.saveAccount(account);
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
      <h1 class="title">Accounts</h1>
    </header>
    <p class="lede">
      Each account carries one of six essence colours (§5). The app derives four shades of
      your pick and uses them for that account's row accent, balance and chart line.
    </p>

    <ul class="accounts">
      <li v-for="a in rows" :key="a.id">
        <button class="acct essence" :style="essenceVars(a.essence_color)" @click="editing = a">
          <span class="left">
            <span class="name">{{ a.name }}</span>
            <span class="meta mono">{{ TYPE_LABEL[a.type] }}</span>
          </span>
          <span class="right">
            <span class="balance amount">{{ balanceText(a) }}</span>
            <span class="ladder" aria-hidden="true">
              <i v-for="(shade, i) in essenceShades(a.essence_color)" :key="i" :style="{ background: shade }"></i>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <p v-if="rows.length === 0" class="empty">No accounts yet. Add the first one below.</p>

    <button class="new-btn" @click="editing = 'new'">New account</button>

    <AccountEditorSheet
      v-if="editing !== null"
      :account="editing === 'new' ? null : editing"
      @save="onSave"
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
.accounts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.acct {
  width: 100%;
  min-height: 56px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--essence);
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
}
.meta {
  font-size: 10px;
  color: var(--color-textDim);
}
.right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}
.balance {
  font-size: 13px;
  color: var(--essence);
}
.ladder {
  display: flex;
  gap: 2px;
}
.ladder i {
  width: 14px;
  height: 5px;
  border-radius: 2px;
}
.empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-textDim);
}
.new-btn {
  align-self: flex-start;
  padding: 0 16px;
  border-radius: 22px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
</style>
