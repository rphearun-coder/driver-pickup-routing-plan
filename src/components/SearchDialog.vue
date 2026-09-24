<script setup lang="ts">
import { ref } from 'vue';

// Small centred search dialog opened from a page header's search icon. Edits a
// draft copy and only hands the (trimmed) query back on Search.
const props = withDefaults(
  defineProps<{ initialQuery?: string; title: string; hint: string; placeholder?: string; maxLength?: number }>(),
  { initialQuery: '', placeholder: '', maxLength: 50 },
);
const emit = defineEmits<{ apply: [query: string]; close: [] }>();

const draft = ref(props.initialQuery);

function apply(): void {
  emit('apply', draft.value.replace(/\s+/g, ' ').trim());
}
</script>

<template>
  <Teleport to="#overlay-root">
    <div class="search-backdrop" @click.self="emit('close')">
      <form class="search-modal" @submit.prevent="apply">
        <button type="button" class="search-close" aria-label="Close" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2>{{ title }}</h2>
        <p class="search-hint">{{ hint }}</p>
        <input
          v-model="draft"
          type="search"
          class="search-input"
          :maxlength="maxLength"
          autocomplete="off"
          enterkeyhint="search"
          :placeholder="placeholder"
          :aria-label="title"
          autofocus
        />
        <button type="submit" class="search-submit">Search</button>
        <button v-if="initialQuery" type="button" class="search-clear" @click="emit('apply', '')">Clear search</button>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.search-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(17, 24, 39, 0.55);
}
.search-modal {
  position: relative;
  width: 100%;
  max-width: 340px;
  padding: 44px 20px 22px;
  border-radius: 24px;
  background: #fff;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}
.search-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--ink);
  cursor: pointer;
}
.search-close svg {
  width: 16px;
  height: 16px;
}
.search-modal h2 {
  margin: 0 0 6px;
  color: var(--ink);
  font: 700 1.05rem var(--heading);
}
.search-hint {
  margin: 0 0 16px;
  color: var(--muted);
  font-size: 0.82rem;
}
.search-input {
  display: block;
  width: 100%;
  padding: 13px 16px;
  border: 1.5px solid var(--border-strong);
  border-radius: 14px;
  background: #fff;
  color: var(--ink);
  font: 500 16px var(--sans); /* iOS Safari auto-zooms on focus if an input's font-size is under 16px */
  outline: none;
}
.search-input:focus {
  border-color: var(--green);
}
.search-submit {
  width: 100%;
  margin-top: 12px;
  padding: 13px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 0.88rem var(--sans);
  cursor: pointer;
}
.search-clear {
  width: 100%;
  margin-top: 8px;
  padding: 11px;
  border: none;
  border-radius: 12px;
  background: var(--fill);
  color: var(--ink);
  font: 700 0.85rem var(--sans);
  cursor: pointer;
}
</style>
