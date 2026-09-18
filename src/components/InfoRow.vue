<script setup lang="ts">
defineProps<{ label: string; value?: string; href?: string }>();
</script>

<template>
  <div class="info-row">
    <span>{{ label }}</span>
    <a v-if="href && value" :href="href">{{ value }}</a>
    <strong v-else>{{ value || '—' }}</strong>
  </div>
</template>

<style scoped>
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  font-size: 0.85rem;
}
.info-row + .info-row {
  border-top: 1px solid var(--line);
}
.info-row span {
  color: var(--muted);
}
.info-row strong,
.info-row a {
  color: var(--ink);
  font-weight: 700;
  text-align: right;
}
.info-row a {
  color: var(--green);
  text-decoration: none;
}
</style>
