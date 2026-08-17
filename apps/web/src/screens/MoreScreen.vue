<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <main class="screen">
    <h1 class="title">More</h1>

    <nav class="list">
      <RouterLink class="row" to="/items">
        <span>Saved items library</span>
        <span class="chevron" aria-hidden="true">›</span>
      </RouterLink>
      <RouterLink class="row accent" to="/discounts">
        <span>Fare discounts</span>
        <span class="chevron" aria-hidden="true">›</span>
      </RouterLink>
    </nav>

    <p class="placeholder">Accounts, lock, theme and backup land in later sessions.</p>
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
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row {
  min-height: 44px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
  text-decoration: none;
}
.row.accent {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #16213a;
  font-weight: 700;
}
.row.accent .chevron {
  color: #16213a;
}
.chevron {
  color: var(--color-textDim);
}
.placeholder {
  margin: 0;
  font-size: 12px;
  color: var(--color-textDim);
}
</style>
