<script setup lang="ts">
import { onUnmounted, ref } from 'vue';

// Copies `text` and shows "Copied" for a moment. Style it from the parent with `class`;
// pass slot content to replace the default icon + label (the slot gets `copied`).
const props = withDefaults(defineProps<{ text: string; label?: string; copiedLabel?: string }>(), {
  label: 'Copy',
  copiedLabel: 'Copied',
});
// `failed`: the clipboard is blocked (non-HTTPS, permission) — the text is still on screen.
const emit = defineEmits<{ copied: []; failed: [] }>();

const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy(): Promise<void> {
  if (!props.text) return;
  try {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied.value = false), 1800);
    emit('copied');
  } catch {
    emit('failed');
  }
}

onUnmounted(() => clearTimeout(timer));
</script>

<template>
  <button type="button" :class="{ done: copied }" :disabled="!text" @click="copy">
    <slot :copied="copied">
      <svg v-if="copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
      </svg>
      {{ copied ? copiedLabel : label }}
    </slot>
  </button>
</template>

<style scoped>
/* Default size; a parent can override with `.its-class :deep(svg)`. */
svg {
  flex-shrink: 0;
  width: 1.15em;
  height: 1.15em;
}
</style>
