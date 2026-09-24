<script setup lang="ts">
// Error / empty / no-match placeholder for list pages. `tone` picks the icon:
// error → "!", success → ✓, neutral → the default slot (or nothing).
withDefaults(
  defineProps<{
    tone?: 'error' | 'success' | 'neutral';
    title: string;
    text?: string;
    actionLabel?: string;
    actionStyle?: 'primary' | 'secondary';
  }>(),
  { tone: 'neutral', text: '', actionLabel: '', actionStyle: 'primary' },
);
const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <div class="state">
    <div v-if="tone === 'error'" class="state-icon red">!</div>
    <div v-else-if="tone === 'success'" class="state-icon green">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </div>
    <div v-else-if="$slots.icon" class="state-icon"><slot name="icon" /></div>
    <p class="state-title">{{ title }}</p>
    <p v-if="text" class="state-text">{{ text }}</p>
    <button v-if="actionLabel" type="button" class="state-btn" :class="actionStyle" @click="emit('action')">
      {{ actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 4px;
  padding: 36px 20px;
  border-radius: 18px;
  background: #fff;
  text-align: center;
}
.state-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 12px;
  border-radius: 50%;
  background: var(--input);
  color: var(--muted);
  font: 700 1.4rem var(--sans);
}
.state-icon.red {
  background: var(--red-soft);
  color: var(--red-strong);
}
.state-icon.green {
  background: var(--green-soft);
  color: var(--green);
}
.state-icon :deep(svg),
.state-icon > svg {
  width: 28px;
  height: 28px;
}
.state-title {
  margin: 0 0 4px;
  color: var(--ink);
  font: 700 0.95rem var(--sans);
}
.state-text {
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
}
.state-btn {
  margin-top: 16px;
  padding: 10px 20px;
  border: none;
  border-radius: 999px;
  background: var(--green);
  color: #fff;
  font: 700 0.85rem var(--sans);
  cursor: pointer;
}
.state-btn.secondary {
  background: var(--fill);
  color: var(--ink);
}
</style>
