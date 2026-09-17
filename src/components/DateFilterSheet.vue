<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { DATE_RANGE_OPTIONS, type DateRangeKey } from '../api/dashboard';

const props = defineProps<{ modelValue: DateRangeKey }>();
const emit = defineEmits<{ 'update:modelValue': [key: DateRangeKey] }>();

const open = ref(false);

function select(key: DateRangeKey): void {
  open.value = false;
  emit('update:modelValue', key);
}

const previousBodyOverflow = document.body.style.overflow;
watch(open, (isOpen) => {
  document.body.style.overflow = isOpen ? 'hidden' : previousBodyOverflow;
});
onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <div class="range-picker">
    <button type="button" class="range-btn" @click="open = true">
      {{ DATE_RANGE_OPTIONS.find((option) => option.key === modelValue)?.label ?? 'Today' }}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <div v-if="open" class="sheet-backdrop" @click.self="open = false">
      <div class="sheet">
        <span class="drag-handle"></span>
        <h2 class="sheet-title">Select Range</h2>
        <ul class="range-options">
          <li v-for="option in DATE_RANGE_OPTIONS" :key="option.key">
            <button
              type="button"
              class="range-option"
              :class="{ active: option.key === props.modelValue }"
              @click="select(option.key)"
            >
              {{ option.label }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.range-picker {
  position: relative;
}
.range-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--wash);
  color: var(--ink);
  font: 700 0.75rem var(--sans);
  cursor: pointer;
}
.range-btn svg {
  width: 14px;
  height: 14px;
}

.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  overscroll-behavior: contain;
}
.sheet {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 20px 24px;
  border-radius: 24px 24px 0 0;
  background: #fff;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2);
}
.drag-handle {
  display: block;
  width: 40px;
  height: 4px;
  margin: 0 auto 16px;
  border-radius: 999px;
  background: var(--line);
}
.sheet-title {
  margin: 0 0 16px;
  font: 700 1.05rem var(--heading);
  color: var(--ink);
  text-align: center;
}
.range-options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.range-option {
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-radius: 14px;
  background: var(--wash);
  color: var(--ink);
  font: 600 0.9rem var(--sans);
  text-align: left;
  cursor: pointer;
}
.range-option.active {
  background: var(--green);
  color: #fff;
}
</style>
