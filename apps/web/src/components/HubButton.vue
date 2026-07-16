<script setup lang="ts">
// §6 hub: tap → log sheet, hold → arc of 4 modules; saffron ring = budget consumed.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLedgerStore } from '../stores/ledger';

const HOLD_MS = 350;

// Arc order + shape are DECIDED (wireframe A2): outer two sit 26px lower.
const DESTINATIONS = [
  { name: 'budget', short: 'Bud', label: 'Budget', offset: true },
  { name: 'savings', short: 'Sav', label: 'Savings', offset: false },
  { name: 'stats', short: 'Sta', label: 'Stats', offset: false },
  { name: 'more', short: 'More', label: 'More', offset: true },
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
    <div v-if="open" class="backdrop" @click="close" />
    <div v-if="open" class="arc">
      <button
        v-for="d in DESTINATIONS"
        :key="d.name"
        class="arc-btn"
        :class="{ offset: d.offset }"
        :data-route="d.name"
        @click="go(d.name)"
      >
        <span class="arc-circle" :class="{ hot: highlighted === d.name }">{{ d.short }}</span>
        <span class="arc-label">{{ d.label }}</span>
      </button>
    </div>
    <div class="hub-wrap">
      <div class="gauge" :style="gaugeStyle" aria-hidden="true"></div>
      <button
        class="hub"
        aria-label="Log a transaction. Hold for module navigation."
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @click="onClick"
        @contextmenu.prevent
      >
        {{ open ? '✕' : '+' }}
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
  bottom: 110px;
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
.arc-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--color-surface);
  border: 2px solid var(--color-primary);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 700;
}
.arc-circle.hot {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-text);
}
.arc-label {
  font-family: 'Spline Sans Mono', monospace;
  font-size: 9px;
  color: #fff;
}
.hub-wrap {
  position: fixed;
  bottom: 14px;
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
}
</style>
