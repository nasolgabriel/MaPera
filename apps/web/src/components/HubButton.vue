<script setup lang="ts">
// §6 hub: tap → log sheet, hold → arc of 4 modules; saffron ring = budget consumed.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLedgerStore } from '../stores/ledger';
import { sheetOpen } from '../composables/useSheetGuard';

const HOLD_MS = 350;

// Arc order + shape are DECIDED (wireframe A2): outer two sit 26px lower.
// `icon` holds Lucide path geometry inlined at 24x24 — no icon package in this app.
const DESTINATIONS = [
  {
    name: 'budget',
    label: 'Budget',
    offset: true,
    icon: '<path d="M21 12a9 9 0 1 1-9-9"/><path d="M12 12V3a9 9 0 0 1 9 9z"/>',
  },
  {
    name: 'savings',
    label: 'Savings',
    offset: false,
    icon: '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/>',
  },
  {
    name: 'stats',
    label: 'Stats',
    offset: false,
    icon: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  },
  {
    name: 'more',
    label: 'More',
    offset: true,
    icon: '<circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/><circle cx="5" cy="12" r="1.4"/>',
  },
] as const;

const router = useRouter();
const route = useRoute();
const store = useLedgerStore();

const visible = computed(
  () => !sheetOpen.value && ['budget', 'savings', 'stats', 'more', 'caps', 'card', 'items', 'discounts'].includes(String(route.name)),
);

const open = ref(false);
const highlighted = ref<string | null>(null);
const pressing = ref(false);
let holdTimer: number | undefined;
let bloomedThisPress = false;

const gaugeStyle = computed(() => {
  const pct = (store.hubGauge ?? 0) * 100;
  return {
    background: `conic-gradient(var(--color-accent) 0 ${pct}%, transparent ${pct}% 100%)`,
  };
});

function destinationAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-route]');
  return el?.getAttribute('data-route') ?? null;
}

function go(name: string): void {
  open.value = false;
  highlighted.value = null;
  void router.push({ name });
}

function close(): void {
  open.value = false;
  highlighted.value = null;
}

function onPointerDown(e: PointerEvent): void {
  pressing.value = true;
  bloomedThisPress = false;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  holdTimer = window.setTimeout(() => {
    open.value = true;
    bloomedThisPress = true;
  }, HOLD_MS);
}

function onPointerMove(e: PointerEvent): void {
  if (!pressing.value || !open.value) return;
  highlighted.value = destinationAt(e.clientX, e.clientY);
}

function onPointerUp(e: PointerEvent): void {
  window.clearTimeout(holdTimer);
  if (!pressing.value) return;
  pressing.value = false;
  if (bloomedThisPress) {
    // Release on a module navigates; release elsewhere leaves the arc open (§6).
    const target = destinationAt(e.clientX, e.clientY);
    if (target) go(target);
    else highlighted.value = null;
  } else if (open.value) {
    close();
  } else {
    void router.push('/log');
  }
}

function onPointerCancel(): void {
  window.clearTimeout(holdTimer);
  pressing.value = false;
}

/** Keyboard activation (Enter/Space) arrives as a click with detail 0. */
function onClick(e: MouseEvent): void {
  if (e.detail !== 0) return; // pointer path already handled at pointerup
  if (open.value) close();
  else void router.push('/log');
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && open.value) close();
}

watch(visible, (v) => {
  if (!v) close();
});

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  if (!store.loaded) void store.load();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.clearTimeout(holdTimer);
});
</script>

<template>
  <div v-if="visible">
    <Transition name="fade">
      <div v-if="open" class="backdrop" @click="close" />
    </Transition>
    <!-- The arc stays mounted so its buttons can sit collapsed ON the hub and
         emerge from it; `open` drives the whole transition. `inert` keeps the
         collapsed dots out of the tab order and off screen readers. -->
    <div class="arc" :class="{ open }" :inert="!open">
      <button
        v-for="d in DESTINATIONS"
        :key="d.name"
        class="arc-btn"
        :class="[`at-${d.name}`, { hot: highlighted === d.name }]"
        :data-route="d.name"
        :aria-label="d.label"
        @click="go(d.name)"
      >
        <svg
          class="arc-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          v-html="d.icon"
        />
        <span class="arc-label">{{ d.label }}</span>
      </button>
    </div>
    <div class="hub-wrap">
      <div class="gauge" aria-hidden="true">
        <div class="gauge-arc" :style="gaugeStyle"></div>
      </div>
      <button
        class="hub"
        :class="{ open }"
        aria-label="Log a transaction. Hold for module navigation."
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @click="onClick"
        @contextmenu.prevent
      >
        <span class="hub-icon">+</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(22, 33, 58, 0.45); /* §6: dims 45% */
}
/* --- Arc: emerge-from-hub ------------------------------------------------
   Zero-size origin pinned to the hub's exact center (hub is 64px tall at
   bottom 24px + safe-bottom, so its center is 56px + safe-bottom). Buttons
   are absolutely placed here, start as 8px dots, then travel out while
   inflating. Keep this bottom value in sync with .hub-wrap. */
.arc {
  position: fixed;
  bottom: calc(56px + var(--safe-bottom));
  left: 50%;
  width: 0;
  height: 0;
  z-index: 45;
}
.arc-btn {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  padding: 0;
  min-width: 0;
  min-height: 0;
  border-radius: 50%;
  background: var(--color-primary);
  border: 2px solid var(--color-primary);
  box-sizing: border-box;
  color: var(--color-primary);
  /* NOT overflow:hidden — the label is positioned outside the button box and
     would be clipped. The icon is held at scale(0) while closed instead. */
  box-shadow: 0 2px 8px rgba(22, 33, 58, 0.3);
  /* Reference curve: the negative first control point dips back before
     springing past the target, which is what sells the "pop out". */
  transition:
    transform 0.3s cubic-bezier(0.41, -0.86, 0.76, 1.89),
    width 0.3s cubic-bezier(0.41, -0.86, 0.76, 1.89),
    height 0.3s cubic-bezier(0.41, -0.86, 0.76, 1.89),
    margin 0.3s cubic-bezier(0.41, -0.86, 0.76, 1.89),
    background-color 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.18s ease;
}
.arc.open .arc-btn {
  width: 44px;
  height: 44px;
  margin: -22px 0 0 -22px;
  background: var(--color-surface);
}
/* Arc endpoints match the original navigation-model cluster: 44px circles,
   8px gaps (centers at ±26 / ±78), outer two sitting 12px lower. Tight, not
   spread — see the "navigation model" card in the wireframes. */
.arc.open .at-budget {
  transform: translate(-78px, -76px);
}
.arc.open .at-savings {
  transform: translate(-26px, -88px);
}
.arc.open .at-stats {
  transform: translate(26px, -88px);
}
.arc.open .at-more {
  transform: translate(78px, -76px);
}
.arc-icon {
  width: 19px;
  height: 19px;
  flex: none;
  transform: scale(0);
  /* Late overshoot: icon pops after its circle has arrived. */
  transition:
    transform 0.5s cubic-bezier(0.41, -2, 0.76, 2),
    stroke-width 0.18s ease;
}
.arc.open .arc-icon {
  transform: scale(1);
}
.arc-btn.hot .arc-icon {
  stroke-width: 1.9;
}
.arc-label {
  position: absolute;
  top: calc(100% + 5px);
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Spline Sans Mono', monospace;
  font-size: 9px;
  color: #fff;
  letter-spacing: 0.02em;
  white-space: nowrap;
  opacity: 0;
  /* labels sit on the 45%-dim backdrop, not a solid surface */
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
  transition: opacity 0.2s ease 0.12s;
}
.arc.open .arc-label {
  opacity: 1;
}
/* .hot must repeat each endpoint: `transform` is one property, so a bare
   scale() here would discard the translate and snap the circle to the hub. */
.arc.open .arc-btn.hot {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-text);
  box-shadow: 0 6px 16px rgba(22, 33, 58, 0.35);
}
.arc.open .at-budget.hot {
  transform: translate(-78px, -76px) scale(1.14);
}
.arc.open .at-savings.hot {
  transform: translate(-26px, -88px) scale(1.14);
}
.arc.open .at-stats.hot {
  transform: translate(26px, -88px) scale(1.14);
}
.arc.open .at-more.hot {
  transform: translate(78px, -76px) scale(1.14);
}
/* Backdrop fade */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.hub-wrap {
  position: fixed;
  bottom: calc(24px + var(--safe-bottom));
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  width: 64px;
  height: 64px;
}
.gauge {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  box-shadow: 0 4px 12px rgba(30, 58, 110, 0.35);
}
.gauge::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--color-accent);
  opacity: 0.28;
}
.gauge-arc {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}
.hub {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border-radius: 50%;
  background: var(--color-primary);
  border: 3px solid var(--color-surface);
  color: #fff;
  font-size: 28px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.3s cubic-bezier(0.41, -0.86, 0.76, 1.89);
}
.hub:active {
  transform: scale(0.92); /* press feedback while the hold timer runs */
}
/* Reference shrinks the FAB hard (60→40); owner asked for far less, so this
   is a 64→58 equivalent — it reacts without looking like it deflates. */
.hub.open {
  transform: scale(0.91);
}
.hub-icon {
  display: block;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.hub.open .hub-icon {
  transform: rotate(135deg); /* + spins into ✕ */
}
@media (prefers-reduced-motion: reduce) {
  .hub,
  .hub-icon,
  .arc-btn,
  .arc-icon,
  .arc-label,
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
}
</style>
