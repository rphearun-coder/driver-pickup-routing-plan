<script setup lang="ts">
// "Contains … · N found" pill shown above a list while a search is active.
defineProps<{ query: string; count: number }>();
const emit = defineEmits<{ clear: [] }>();
</script>

<template>
  <div class="search-chip">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
    <span>Contains "{{ query }}" · {{ count }} found</span>
    <button type="button" @click="emit('clear')">Clear</button>
  </div>
</template>

<style scoped>
.search-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 9px 14px;
  border-radius: 999px;
  background: var(--blue-soft);
  color: var(--blue-strong);
  font: 600 0.78rem var(--sans);
}
.search-chip svg {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
}
.search-chip span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-chip button {
  flex-shrink: 0;
  border: none;
  background: none;
  color: var(--blue);
  font: 700 0.78rem var(--sans);
  text-decoration: underline;
  cursor: pointer;
}
</style>
