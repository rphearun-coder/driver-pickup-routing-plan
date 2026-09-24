<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { DATE_RANGE_OPTIONS, rangeDatesText, type DateRangeKey } from '../api/dashboard';

const props = defineProps<{ modelValue: DateRangeKey }>();
const emit = defineEmits<{ 'update:modelValue': [key: DateRangeKey] }>();

const open = ref(false);

const HINTS: Record<DateRangeKey, string> = {
  today: 'Since midnight',
  week: 'Monday to today',
  month: 'From the 1st to today',
};

function select(key: DateRangeKey): void {
  open.value = false;
  emit('update:modelValue', key);
}

function close(): void {
  open.value = false;
}

defineExpose({ close });

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}

const previousBodyOverflow = document.body.style.overflow;
watch(open, (isOpen) => {
  document.body.style.overflow = isOpen ? 'hidden' : previousBodyOverflow;
  if (isOpen) window.addEventListener('keydown', onKeydown);
  else window.removeEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow;
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="range-picker">
    <button type="button" class="range-btn" aria-haspopup="dialog" @click="open = true">
      <svg class="range-btn-cal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
      {{ DATE_RANGE_OPTIONS.find((option) => option.key === modelValue)?.label ?? 'Today' }}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <Teleport to="#overlay-root">
      <Transition name="sheet">
        <div v-if="open" class="sheet-backdrop" @click.self="close">
          <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="range-sheet-title">
            <span class="drag-handle"></span>
            <div class="sheet-head">
              <div>
                <h2 id="range-sheet-title" class="sheet-title">Select range</h2>
                <p class="sheet-sub">Choose the period to show</p>
              </div>
              <button type="button" class="close-btn" aria-label="Close" @click="close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                  <path d="M7 7l10 10M17 7 7 17" />
                </svg>
              </button>
            </div>

            <ul class="range-options" role="radiogroup" aria-labelledby="range-sheet-title">
              <li v-for="option in DATE_RANGE_OPTIONS" :key="option.key">
                <button
                  type="button"
                  role="radio"
                  class="range-option"
                  :class="{ active: option.key === props.modelValue }"
                  :aria-checked="option.key === props.modelValue"
                  @click="select(option.key)"
                >
                  <span class="option-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                      <path d="M3.5 10h17M8 3v4M16 3v4" />
                      <path v-if="option.key === 'today'" d="M12 13.5v3" stroke-width="2.6" />
                      <path v-else-if="option.key === 'week'" d="M7.5 15h9" stroke-width="2.6" />
                      <path v-else d="M7.5 13.5h9M7.5 17h6" />
                    </svg>
                  </span>
                  <span class="option-text">
                    <span class="option-label">{{ option.label }}</span>
                    <span class="option-range">{{ rangeDatesText(option.key) }} · {{ HINTS[option.key] }}</span>
                  </span>
                  <span class="option-check" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M6 12.5l4 4 8-9" />
                    </svg>
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </Transition>
    </Teleport>
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
  white-space: nowrap;
  cursor: pointer;
}
.range-btn svg {
  width: 14px;
  height: 14px;
}
.range-btn .range-btn-cal {
  color: var(--green);
}

.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(17, 24, 39, 0.45);
  overscroll-behavior: contain;
}
.sheet {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: 90%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 16px calc(20px + env(safe-area-inset-bottom));
  border-radius: 24px 24px 0 0;
  background: #fff;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.18);
}
.drag-handle {
  display: block;
  width: 40px;
  height: 4px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: var(--line);
}
.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px 14px;
}
.sheet-title {
  margin: 0;
  font: 700 1.1rem var(--heading);
  color: var(--ink);
}
.sheet-sub {
  margin: 2px 0 0;
  color: var(--muted);
  font: 500 0.78rem var(--sans);
}
.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--text-3);
  cursor: pointer;
}
.close-btn svg {
  width: 16px;
  height: 16px;
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
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1.5px solid var(--border);
  border-radius: 16px;
  background: #fff;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
}
.range-option:active {
  background: var(--wash);
}
.option-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--fill);
  color: var(--text-3);
}
.option-icon svg {
  width: 20px;
  height: 20px;
}
.option-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.option-label {
  font: 700 0.92rem var(--sans);
}
.option-range {
  overflow: hidden;
  color: var(--muted);
  font: 500 0.74rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.option-check {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 2px solid var(--border-dashed);
  border-radius: 50%;
  color: transparent;
}
.option-check svg {
  width: 12px;
  height: 12px;
}
.range-option.active {
  border-color: var(--green);
  background: var(--green-tint);
}
.range-option.active .option-icon {
  background: var(--green-soft);
  color: var(--green-strong);
}
.range-option.active .option-label {
  color: var(--green-strong);
}
.range-option.active .option-check {
  border-color: var(--green);
  background: var(--green);
  color: #fff;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: background-color 0.22s ease;
}
.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform 0.22s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  background-color: transparent;
}
.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateY(100%);
}
</style>
