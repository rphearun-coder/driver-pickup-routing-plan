<script setup lang="ts">
import type { ToastType } from '../composables/useToast';

// Pill message floating above the bottom nav (or the page's bottom bar, via `offset`).
withDefaults(defineProps<{ message: string; type?: ToastType; offset?: string }>(), {
  type: 'success',
  offset: 'calc(var(--bottom-nav-h) + 20px)',
});
</script>

<template>
  <Teleport to="#overlay-root">
    <Transition name="toast">
      <p v-if="message" class="toast" :class="type" :style="{ '--toast-offset': offset }" role="status">{{ message }}</p>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: calc(var(--toast-offset) + env(safe-area-inset-bottom));
  z-index: 300;
  max-width: calc(100% - 32px);
  margin: 0;
  padding: 10px 16px;
  border-radius: 999px;
  color: #fff;
  font: 600 0.82rem var(--sans);
  text-align: center;
  transform: translateX(-50%);
  box-shadow: 0 8px 24px rgba(17, 24, 39, 0.2);
}
.toast.success {
  background: var(--green-strong);
}
.toast.error {
  background: var(--red-strong);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
