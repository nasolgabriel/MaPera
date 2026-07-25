import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef } from 'vue';

const openCount = ref(0);

export const sheetOpen: ComputedRef<boolean> = computed(() => openCount.value > 0);

export function useSheetGuard(): void {
  onMounted(() => {
    openCount.value += 1;
  });
  onBeforeUnmount(() => {
    openCount.value -= 1;
  });
}
