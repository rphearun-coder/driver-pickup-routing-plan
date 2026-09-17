<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.ts';
import BrandLogo from '../../components/BrandLogo.vue';

const auth = useAuthStore();
const router = useRouter();

// A brief pause so the splash is actually visible instead of flashing by —
// long enough to read the brand, short enough not to feel like a stall.
const MIN_DISPLAY_MS = 900;

onMounted(() => {
  setTimeout(() => {
    router.replace({ name: auth.isAuthenticated ? 'home' : 'login' });
  }, MIN_DISPLAY_MS);
});
</script>

<template>
  <div class="splash">
    <BrandLogo :size="120" />
    <h1>Jalat Logistic</h1>
    <div class="spinner" aria-label="Loading" role="status"></div>
  </div>
</template>

<style scoped>
.splash {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
}
.splash h1 {
  font: 700 1.3rem var(--heading);
  color: var(--ink);
  margin: 0;
}
.spinner {
  width: 28px;
  height: 28px;
  margin-top: 12px;
  border: 3px solid var(--line);
  border-top-color: var(--orange);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
