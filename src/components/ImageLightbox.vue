<script setup lang="ts">
// Full-screen photo viewer; tap anywhere to close.
withDefaults(defineProps<{ src: string; alt?: string; caption?: string }>(), { alt: 'Photo', caption: '' });
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="#overlay-root">
    <div class="lightbox" role="dialog" aria-modal="true" @click="emit('close')">
      <img :src="src" :alt="alt" />
      <p v-if="caption" class="lightbox-caption">{{ caption }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px 16px;
  background: rgba(0, 0, 0, 0.9);
  cursor: zoom-out;
}
.lightbox img {
  max-width: 100%;
  max-height: 80%;
  border-radius: 12px;
  object-fit: contain;
}
.lightbox-caption {
  margin: 0;
  color: rgba(255, 255, 255, 0.8);
  font: 600 0.8rem var(--sans);
}
</style>
