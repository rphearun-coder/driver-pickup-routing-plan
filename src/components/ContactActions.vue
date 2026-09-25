<script setup lang="ts">
// Call + Directions buttons for a person or shop. Each is greyed out when its value is missing.
defineProps<{ phone?: string; mapUrl?: string }>();
</script>

<template>
  <div class="contact-actions">
    <a class="contact-btn call" :class="{ disabled: !phone }" :href="phone ? `tel:${phone}` : undefined">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z" />
      </svg>
      {{ phone || 'No phone' }}
    </a>
    <a class="contact-btn map" :class="{ disabled: !mapUrl }" :href="mapUrl || undefined" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 11l18-8-8 18-2-8z" />
      </svg>
      Directions
    </a>
  </div>
</template>

<style scoped>
.contact-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}
.contact-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  height: 42px;
  padding: 0 10px;
  border-radius: 12px;
  font: 700 0.82rem var(--sans);
  text-decoration: none;
  overflow: hidden;
  white-space: nowrap;
}
.contact-btn svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}
.contact-btn.call {
  background: var(--green-soft);
  color: var(--green-strong);
}
.contact-btn.map {
  background: var(--blue-soft);
  color: var(--blue);
}
.contact-btn.disabled {
  opacity: 0.4;
  pointer-events: none;
}
</style>
