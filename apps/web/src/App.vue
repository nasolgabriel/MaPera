<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useLedgerStore } from './stores/ledger';
import HubButton from './components/HubButton.vue';

const store = useLedgerStore();

function onWake(): void {
  if (document.visibilityState === 'visible') store.refreshToday();
}

onMounted(() => {
  document.addEventListener('visibilitychange', onWake);
  window.addEventListener('focus', onWake);
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onWake);
  window.removeEventListener('focus', onWake);
});
</script>

<template>
  <RouterView />
  <HubButton />
</template>
