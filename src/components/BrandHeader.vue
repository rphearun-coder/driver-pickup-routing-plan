<script setup lang="ts">
import BrandLogo from './BrandLogo.vue';

// Green "Jalat Logistic" header shared by the main tabs (Home styling). Actions
// (date picker, search, QR…) go in the default slot; use <HeaderIconButton> for icons.
</script>

<template>
  <header class="brand-header">
    <div class="header-brand">
      <BrandLogo :size="38" />
      <span class="brand-text">
        <strong>Jalat</strong>
        <em>Logistic</em>
      </span>
    </div>
    <div class="header-actions">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.brand-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 20px 90px;
  background: var(--green);
  border-radius: 0 0 32px 32px;
}
.header-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #000;
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.brand-text strong {
  font: 700 1.05rem var(--heading);
}
.brand-text em {
  font: 600 0.64rem var(--sans);
  font-style: normal;
  opacity: 0.7;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
