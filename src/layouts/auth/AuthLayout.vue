<script setup lang="ts">
import { useRoute } from 'vue-router';
import BottomNav from '../../components/BottomNav.vue';

const route = useRoute();
</script>

<template>
  <div class="auth-layout">
    <RouterView class="app-view" />
    <BottomNav v-if="!route.meta.hideBottomNav" />
  </div>
</template>

<style scoped>
.auth-layout {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.app-view {
  flex: 1;
}
</style>
