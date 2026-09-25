<script setup lang="ts">
// Round ✕ button for sheet and dialog headers. Listen with @click.
withDefaults(defineProps<{ label?: string }>(), { label: 'Close' });
</script>

<template>
  <button type="button" class="close-btn" :aria-label="label">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  </button>
</template>

<style scoped>
.close-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--text-3);
  cursor: pointer;
}
.close-btn:active {
  background: var(--fill-strong);
}
.close-btn svg {
  width: 15px;
  height: 15px;
}
</style>
