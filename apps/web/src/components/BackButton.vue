<script setup lang="ts">
import { useRouter } from 'vue-router';

const props = defineProps<{ to: string; label: string }>();
const router = useRouter();

function back(): void {
  void router.push(props.to);
}
</script>

<template>
  <button class="back" type="button" :aria-label="label" @click="back">
    <svg
      class="glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  </button>
</template>

<style scoped>
.back {
  flex: none;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  margin-left: -12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 22px;
  background: transparent;
  color: var(--color-primary);
  transition: transform var(--dur-press) var(--ease-standard),
    background-color var(--dur-press) var(--ease-standard);
}
.back:active {
  transform: scale(0.92);
  background: var(--color-muted);
}
.glyph {
  width: 19px;
  height: 19px;
}
@media (prefers-reduced-motion: reduce) {
  .back {
    transition: none;
  }
  .back:active {
    transform: none;
  }
}
</style>
