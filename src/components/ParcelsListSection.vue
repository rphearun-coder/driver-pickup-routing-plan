<script setup lang="ts">
withDefaults(defineProps<{ parcels: { id: string; label?: string; status?: string }[]; total?: number }>(), {
  total: undefined,
});
</script>

<template>
  <div class="parcels-section">
    <div class="parcels-heading">
      <span>Number of parcels</span>
      <strong>{{ total ?? parcels.length }}</strong>
    </div>
    <ul v-if="parcels.length" class="parcels-list">
      <li v-for="(item, index) in parcels" :key="item.id" class="parcel-row">
        <span class="parcel-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 8l-9-5-9 5v8l9 5 9-5V8Z" /><path d="M3 8l9 5 9-5M12 13v8" />
          </svg>
        </span>
        <span class="parcel-label">{{ item.label || `Parcel ${index + 1}` }}</span>
        <span v-if="item.status" class="parcel-status">{{ item.status }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.parcels-section {
  margin-top: 20px;
}
.parcels-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--muted);
  font: 700 0.78rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.parcels-heading strong {
  color: var(--ink);
  font-size: 0.9rem;
  text-transform: none;
  letter-spacing: normal;
}
.parcels-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.parcel-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--wash);
}
.parcel-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #fff;
  color: var(--muted);
}
.parcel-icon svg {
  width: 16px;
  height: 16px;
}
.parcel-label {
  flex: 1;
  min-width: 0;
  color: var(--ink);
  font: 600 0.85rem var(--sans);
}
.parcel-status {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
}
</style>
