<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 96 });
</script>

<template>
  <svg
    class="brand-logo"
    :style="{ width: `${size}px` }"
    viewBox="0 0 100 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M50 2C24 2 4 22 4 47c0 33 46 71 46 71s46-38 46-71C96 22 76 2 50 2Z" fill="url(#pin-gradient)" />
    <path d="M50 30 72 42v24L50 78 28 66V42Z" stroke="#1d2422" stroke-width="4" stroke-linejoin="round" fill="none" />
    <path d="M50 54 72 42M50 54 28 42M50 54v24" stroke="#1d2422" stroke-width="4" stroke-linejoin="round" />
    <defs>
      <linearGradient id="pin-gradient" x1="4" y1="2" x2="96" y2="118" gradientUnits="userSpaceOnUse">
        <stop stop-color="#ffcf6b" /><stop offset="1" stop-color="#f4a340" />
      </linearGradient>
    </defs>
  </svg>
</template>

<style scoped>
.brand-logo {
  height: auto;
}
</style>
