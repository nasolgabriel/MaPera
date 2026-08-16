// Shared enter-reveal flag for the statistics charts (§7). Presentation timing only — no
// money math here (§4).
import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { prefersReducedMotion } from './useChartScrub';

/**
 * Flips true only once the chart has something to draw AND the browser has painted at
 * least one frame of the from-state. A single rAF is not enough: it runs before the
 * frame's style recalc, and Vue flushes the resulting patch in the microtask right after
 * it, so the from-state is never computed and the CSS transition is skipped entirely
 * (Vue's own <Transition> uses the same double rAF). Instant under reduced motion.
 *
 * `hasData` is a getter so the reveal waits for an async store load — bars/paths created
 * after the flag is set would be born at their end state and never animate.
 */
export function useReveal(hasData: () => boolean = () => true): Ref<boolean> {
  const revealed = ref(false);
  let raf1 = 0;
  let raf2 = 0;

  function arm(): void {
    if (revealed.value || !hasData()) return;
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

  onMounted(arm); // idempotent, so mount and the watcher can both call it
  watch(hasData, (ok) => {
    if (ok) arm();
  });
  onUnmounted(() => {
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
  });

  return revealed;
}
