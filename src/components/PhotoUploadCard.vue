<script setup lang="ts">
import { ref } from 'vue';

withDefaults(defineProps<{ previewUrl?: string; label?: string }>(), {
  label: 'Upload photo',
});
const emit = defineEmits<{ change: [file: File] }>();

const fileInput = ref<HTMLInputElement | null>(null);

function onPick(): void {
  fileInput.value?.click();
}

function onFileChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) emit('change', file);
}
</script>

<template>
  <button type="button" class="photo-card" @click="onPick">
    <img v-if="previewUrl" :src="previewUrl" alt="" class="photo-preview" />
    <template v-else>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 16V4M12 4l-4 4M12 4l4 4" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </svg>
      <span>{{ label }}</span>
    </template>
  </button>
  <input ref="fileInput" type="file" accept="image/*" capture="environment" class="file-input" @change="onFileChange" />
</template>

<style scoped>
.photo-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 180px;
  padding: 20px;
  border: none;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  color: var(--muted);
  font: 600 0.85rem var(--sans);
  cursor: pointer;
  overflow: hidden;
}
.photo-card svg {
  width: 30px;
  height: 30px;
}
.photo-preview {
  width: 100%;
  height: 180px;
  object-fit: cover;
  border-radius: 12px;
}
.file-input {
  display: none;
}
</style>
