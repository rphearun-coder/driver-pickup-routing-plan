<script setup lang="ts">
defineProps<{
  imageUrl?: string;
  name: string;
  address?: string;
  status?: string;
  statusColor?: string;
}>();
</script>

<template>
  <div class="detail-info-card">
    <div class="thumb">
      <img v-if="imageUrl" :src="imageUrl" alt="" />
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="3" width="16" height="18" rx="2" /><rect x="7" y="6" width="6" height="6" rx="1" /><path d="M7 15h4M7 18h7" />
      </svg>
    </div>
    <div class="info">
      <p class="name">{{ name }}</p>
      <p v-if="address" class="address">{{ address }}</p>
    </div>
    <span v-if="status" class="status-badge" :style="{ background: statusColor || '#6c756f' }">{{ status }}</span>
  </div>
</template>

<style scoped>
.detail-info-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  background: var(--wash);
  margin-bottom: 16px;
}
.thumb {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: var(--muted);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb svg {
  width: 26px;
  height: 26px;
}
.info {
  flex: 1;
  min-width: 0;
}
.name {
  margin: 0 0 2px;
  font: 700 0.95rem var(--sans);
  color: var(--ink);
}
.address {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-badge {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  color: #fff;
  font: 700 0.65rem var(--sans);
  letter-spacing: 0.02em;
}
</style>
