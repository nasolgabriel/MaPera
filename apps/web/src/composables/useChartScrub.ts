// Shared scrub interaction for the statistics charts (E3). Press-drag a marker across a
// chart to select a month; the host renders a tooltip at the selected point. Keyboard
// (Arrow/Home/End) drives the same selection — the accessibility path, and the only path
// jsdom can test (getBoundingClientRect returns zeros there, so clientX mapping can't be
// asserted). No money math here (§4); this is pure UI state.
import { computed, ref, type Ref } from 'vue';

/** True when the OS asks to minimize motion — reveal charts instantly then (§7). */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Map a pointer clientX to the nearest data index, clamped to 0..n-1. */
export function nearestIndex(clientX: number, rect: { left: number; width: number }, n: number): number {
  if (n <= 1) return 0;
  if (rect.width <= 0) return 0;
  const fraction = (clientX - rect.left) / rect.width;
  const idx = Math.round(fraction * (n - 1));
  return Math.min(n - 1, Math.max(0, idx));
}

export interface ChartScrub {
  /** Selected index, or null before any interaction. Sticky: it persists after release. */
  selected: Ref<number | null>;
  /** aria-valuenow for the role="slider" plot (0 when nothing selected yet). */
  valueNow: Ref<number>;
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onKeydown: (e: KeyboardEvent) => void;
  clear: () => void;
}

/** `count` is a getter so the composable follows a reactive series length. */
export function useChartScrub(count: () => number): ChartScrub {
  const selected = ref<number | null>(null);
  let scrubbing = false;

  function pick(e: PointerEvent): void {
    const el = e.currentTarget as Element | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    selected.value = nearestIndex(e.clientX, rect, count());
  }

  function onPointerDown(e: PointerEvent): void {
    const n = count();
    if (n === 0) return;
    scrubbing = true;
    (e.currentTarget as Element)?.setPointerCapture?.(e.pointerId);
    pick(e);
  }
  function onPointerMove(e: PointerEvent): void {
    if (scrubbing) pick(e);
  }
  function onPointerUp(): void {
    scrubbing = false; // selection persists (sticky readout)
  }

  function step(delta: number): void {
    const n = count();
    if (n === 0) return;
    const from = selected.value ?? (delta > 0 ? -1 : n);
    selected.value = Math.min(n - 1, Math.max(0, from + delta));
  }

  function onKeydown(e: KeyboardEvent): void {
    const n = count();
    if (n === 0) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        step(1);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        step(-1);
        break;
      case 'Home':
        selected.value = 0;
        break;
      case 'End':
        selected.value = n - 1;
        break;
      default:
        return; // let other keys through
    }
    e.preventDefault();
  }

  function clear(): void {
    selected.value = null;
    scrubbing = false;
  }

  const valueNow = computed(() => selected.value ?? 0);

  return { selected, valueNow, onPointerDown, onPointerMove, onPointerUp, onKeydown, clear };
}
