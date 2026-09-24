<script setup lang="ts">
// Round translucent icon button for <BrandHeader>. `active` = white with a dot
// (e.g. a search is applied).
withDefaults(defineProps<{ label: string; active?: boolean }>(), { active: false });
</script>

<template>
  <button type="button" class="icon-btn" :class="{ active }" :aria-label="label">
    <slot />
    <span v-if="active" class="icon-dot" aria-hidden="true"></span>
  </button>
</template>

<style scoped>
.icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  cursor: pointer;
}
.icon-btn.active {
  background: #fff;
  color: var(--green-strong);
}
.icon-btn :deep(svg) {
  width: 18px;
  height: 18px;
}
.icon-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 9px;
  height: 9px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #f59e0b;
}
</style>
