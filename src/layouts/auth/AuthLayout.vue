<script setup lang="ts">
import BottomNav from '../../components/BottomNav.vue';
</script>

<template>
  <div class="auth-layout">
    <RouterView class="app-view" />
    <BottomNav />
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
