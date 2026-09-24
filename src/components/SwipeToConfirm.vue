<script setup lang="ts">
import { computed, ref, watch } from 'vue';

// Drag the knob to the end to confirm — guards destructive actions (e.g. marking a
// delivery failed) against accidental taps. Enter/Space also confirms, for keyboards.
const props = withDefaults(defineProps<{ label: string; disabled?: boolean; loading?: boolean; color?: string }>(), {
  disabled: false,
  loading: false,
  color: 'var(--red)',
});
const emit = defineEmits<{ confirm: [] }>();

const track = ref<HTMLElement | null>(null);
const offset = ref(0);
const dragging = ref(false);
let startX = 0;
let maxOffset = 0;

const KNOB = 56;
const progress = computed(() => (maxOffset ? offset.value / maxOffset : 0));
const inactive = computed(() => props.disabled || props.loading);

// Snap back once a submit finishes (success navigates away; failure lets them retry).
watch(
  () => props.loading,
  (loading) => {
    if (!loading) offset.value = 0;
  },
);

function onPointerDown(event: PointerEvent): void {
  if (inactive.value || !track.value) return;
  dragging.value = true;
  startX = event.clientX - offset.value;
  maxOffset = track.value.clientWidth - KNOB - 8;
  (event.target as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return;
  offset.value = Math.min(Math.max(event.clientX - startX, 0), maxOffset);
}

function onPointerUp(): void {
  if (!dragging.value) return;
  dragging.value = false;
  if (progress.value > 0.85) {
    offset.value = maxOffset;
    emit('confirm');
  } else {
    offset.value = 0;
  }
}

function onKey(): void {
  if (!inactive.value) emit('confirm');
}
</script>

<template>
  <div
    ref="track"
    class="swipe"
    :class="{ disabled: inactive, dragging }"
    :style="{ '--swipe-color': color }"
    role="button"
    :tabindex="inactive ? -1 : 0"
    :aria-disabled="inactive"
    :aria-label="label"
    @keydown.enter.prevent="onKey"
    @keydown.space.prevent="onKey"
  >
    <span class="fill" :style="{ width: `${offset + KNOB + 4}px` }"></span>
    <span class="label" :style="{ opacity: 1 - progress * 0.8 }">{{ loading ? 'Submitting…' : label }}</span>
    <span
      class="knob"
      :style="{ transform: `translateX(${offset}px)` }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <span v-if="loading" class="spinner" aria-hidden="true"></span>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 12h15M13 6l6 6-6 6" />
      </svg>
    </span>
  </div>
</template>

<style scoped>
.swipe {
  position: relative;
  height: 64px;
  border: 1.5px solid var(--swipe-color);
  border-radius: 999px;
  background: #fff;
  overflow: hidden;
  user-select: none;
  touch-action: none;
}
.swipe:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--swipe-color) 35%, transparent);
  outline-offset: 2px;
}
.swipe.disabled {
  border-color: var(--line);
  background: var(--page);
}
/* The tinted fill behind the knob only makes sense once it can move. */
.swipe.disabled .fill {
  opacity: 0;
}
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--swipe-color) 12%, transparent);
  transition: width 0.25s ease;
}
.swipe.dragging .fill,
.swipe.dragging .knob {
  transition: none;
}
.label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 48px;
  color: var(--swipe-color);
  font: 600 1.05rem var(--sans);
  pointer-events: none;
}
.swipe.disabled .label {
  color: var(--faint);
}
.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 55px;
  border-radius: 50%;
  background: var(--swipe-color);
  color: #fff;
  cursor: grab;
  transition: transform 0.25s ease;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--swipe-color) 40%, transparent);
}
.swipe.disabled .knob {
  background: var(--disabled);
  box-shadow: none;
  cursor: not-allowed;
}
.knob svg {
  width: 28px;
  height: 28px;
}
.spinner {
  width: 22px;
  height: 22px;
  border: 2.5px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
