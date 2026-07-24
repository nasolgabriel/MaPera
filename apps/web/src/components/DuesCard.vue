<script setup lang="ts">
// §7.5 Monthly dues — collapsed card (wireframe A1): clock + "Dues this month", one
// paid-tick per due (green = paid), total + chevron. Tap opens the breakdown sheet.
// All numbers arrive pre-computed from the store (§4: no money math in the .vue).
defineProps<{ total: number; paidCount: number; dueCount: number }>();
defineEmits<{ open: [] }>();

function pesoWhole(centavos: number): string {
  const opts = centavos % 100 === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `₱ ${(centavos / 100).toLocaleString('en-PH', opts)}`;
}
</script>

<template>
  <button class="dues-card" aria-label="Open monthly dues" @click="$emit('open')">
    <span class="dues-icon" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    </span>

    <span class="dues-body">
      <span class="dues-title">Dues this month</span>
      <span class="dues-progress">
        <span class="ticks" aria-hidden="true">
          <i v-for="i in dueCount" :key="i" :class="['tick', { paid: i <= paidCount }]"></i>
        </span>
        <span class="dues-count mono">{{ paidCount }} of {{ dueCount }} paid</span>
      </span>
    </span>

    <span class="dues-right">
      <span class="dues-total mono">{{ pesoWhole(total) }}</span>
      <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </span>
  </button>
</template>

<style scoped>
.dues-card {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  text-align: left;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  padding: 11px 12px;
}
.dues-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--color-muted);
  color: var(--color-primary);
}
.dues-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dues-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
}
.dues-progress {
  display: flex;
  align-items: center;
  gap: 7px;
}
.ticks {
  display: flex;
  gap: 3px;
}
.tick {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-border);
}
.tick.paid {
  background: #0d7a3f; /* §5 green = paid */
}
.dues-count {
  font-size: 9px;
  color: var(--color-textDim);
}
.dues-right {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
}
.dues-total {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text);
}
.chevron {
  color: var(--color-textDim);
}
</style>
