<script setup lang="ts">
// §6 hub: tap → log sheet, hold → arc of 4 modules; saffron ring = budget consumed.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLedgerStore } from '../stores/ledger';

const HOLD_MS = 350;

// Arc order + shape are DECIDED (wireframe A2): outer two sit 26px lower.
const DESTINATIONS = [
  { name: 'budget', label: 'Budget', offset: true },
  { name: 'savings', label: 'Savings', offset: false },
  { name: 'stats', label: 'Stats', offset: false },
  { name: 'more', label: 'More', offset: true },
] as const;

const router = useRouter();
const route = useRoute();
const store = useLedgerStore();

const visible = computed(() => ['budget', 'savings', 'stats', 'more'].includes(String(route.name)));

const open = ref(false);
const highlighted = ref<string | null>(null);
const pressing = ref(false);
let holdTimer: number | undefined;
let bloomedThisPress = false;

const gaugeStyle = computed(() => {
  const pct = (store.hubGauge ?? 0) * 100;
  return {
    background: `conic-gradient(var(--color-accent) 0 ${pct}%, var(--color-border) ${pct}% 100%)`,
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
    <Transition name="arc">
      <div v-if="open" class="arc">
        <button
          v-for="(d, i) in DESTINATIONS"
          :key="d.name"
          class="arc-btn"
          :class="{ offset: d.offset }"
          :style="{ '--i': i }"
          :data-route="d.name"
          @click="go(d.name)"
        >
          <span class="arc-circle" :class="{ hot: highlighted === d.name }">{{ d.label }}</span>
        </button>
      </div>
    </Transition>
    <div class="hub-wrap">
      <div class="gauge" :style="gaugeStyle" aria-hidden="true"></div>
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
.arc {
  position: fixed;
  bottom: calc(120px + var(--safe-bottom));
  left: 50%;
  transform: translateX(-50%);
  z-index: 45;
  display: flex;
  gap: 14px;
}
.arc-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 0;
  padding: 0;
}
.arc-btn.offset {
  transform: translateY(26px);
}
/* Bloom: each button springs up with a small stagger (--i set inline). */
.arc-btn > * {
  /* backwards (not both): once done, the keyframe must release `transform`
     so the .hot / hover scale transitions can take over. */
  animation: bloom-in 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
  animation-delay: calc(var(--i) * 45ms);
}
@keyframes bloom-in {
  from {
    opacity: 0;
    transform: translateY(22px) scale(0.4);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.arc-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: var(--color-surface);
  border: 2px solid var(--color-primary);
  color: var(--color-primary);
  font-family: 'Libre Franklin', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: 0 2px 8px rgba(22, 33, 58, 0.18);
  transition:
    transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}
.arc-btn:hover .arc-circle {
  transform: scale(1.08);
}
.arc-circle.hot {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-text);
  font-weight: 700;
  transform: scale(1.18);
  box-shadow: 0 6px 16px rgba(22, 33, 58, 0.35);
}
/* Backdrop fade + arc dismiss */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.arc-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
  transform-origin: bottom center;
}
.arc-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px) scale(0.9);
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
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.hub:active {
  transform: scale(0.92); /* press feedback while the hold timer runs */
}
.hub.open {
  transform: scale(1.06);
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
  .arc-circle,
  .fade-enter-active,
  .fade-leave-active,
  .arc-leave-active {
    transition: none;
  }
  .arc-btn > * {
    animation: none;
  }
}
</style>
