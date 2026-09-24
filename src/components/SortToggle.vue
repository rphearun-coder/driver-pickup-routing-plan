<script setup lang="ts">
import type { SortMode } from '../composables/useRouteSort';

// Single "🕒 Newest ⇅ / 📍 Nearest ⇅" button; tapping switches mode.
defineProps<{ mode: SortMode; locating?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    class="sort-btn"
    :class="{ nearest: mode === 'nearest' }"
    :disabled="locating"
    :aria-label="`Sorted by ${mode}. Tap to sort by ${mode === 'nearest' ? 'newest' : 'nearest'}`"
    @click="emit('toggle')"
  >
    <span v-if="locating" class="sort-spinner" aria-hidden="true"></span>
    <svg v-else-if="mode === 'nearest'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
    </svg>
    <span>{{ locating ? 'Locating' : mode === 'nearest' ? 'Nearest' : 'Newest' }}</span>
    <svg class="sort-swap" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3" />
    </svg>
  </button>
</template>

<style scoped>
.sort-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: #fff;
  color: var(--ink);
  font: 600 0.78rem var(--sans);
  cursor: pointer;
}
.sort-btn svg {
  width: 14px;
  height: 14px;
}
.sort-btn .sort-swap {
  width: 12px;
  height: 12px;
  color: var(--muted);
}
.sort-btn.nearest {
  border-color: var(--blue-border);
  background: var(--blue-soft);
  color: var(--blue-strong);
}
.sort-btn:disabled {
  cursor: progress;
}
.sort-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid var(--blue-border);
  border-top-color: var(--blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
