import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { prefersReducedMotion } from './useChartScrub';

export function useReveal(hasData: () => boolean = () => true): Ref<boolean> {
  const revealed = ref(false);
  let armed = false;
  let raf1 = 0;
  let raf2 = 0;

  function arm(): void {
    if (armed || revealed.value || !hasData()) return;
    armed = true;
    if (prefersReducedMotion()) {
      revealed.value = true;
      return;
    }
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        revealed.value = true;
      });
    });
  }

  onMounted(arm);
  watch(hasData, (ok) => {
    if (ok) arm();
  });
  onUnmounted(() => {
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
  });

  return revealed;
}
