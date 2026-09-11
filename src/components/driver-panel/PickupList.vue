<template>
  <div class="pickup-list">
    <button
      v-for="(pickup, index) in pickups"
      :key="index"
      type="button"
      class="pickup-card"
      :class="{ selected: selectedIndex === index }"
      :disabled="isCompletedStatus(pickup.status)"
      @click="$emit('select', index)"
    >
      <span class="pickup-badge">{{ index + 1 }}</span>
      <span class="pickup-main">
        <span class="pickup-name">{{ pickup.partnerName ?? pickup.label }}</span>
        <span class="pickup-meta">{{ metaText(pickup) }}</span>
      </span>
      <span v-if="statusLabel(pickup.status)" class="pickup-status">{{ statusLabel(pickup.status) }}</span>
    </button>
    <p v-if="!pickups.length" class="tagline muted">Finding pickups near you…</p>
  </div>
</template>

<script setup lang="ts">
import { isCompletedStatus, statusLabel } from '@/map/pickupMarkers';
import type { PickupPoint } from '@/types';

withDefaults(
  defineProps<{
    pickups?: PickupPoint[];
    selectedIndex?: number | '';
  }>(),
  {
    pickups: () => [],
    selectedIndex: '',
  }
);

defineEmits<{
  select: [index: number];
}>();

function metaText(pickup: PickupPoint): string {
  const parts = [
    pickup.parcelCount != null ? `${pickup.parcelCount} parcel${pickup.parcelCount === 1 ? '' : 's'}` : null,
    pickup.estimatedDistanceMetersText,
    pickup.estimatedDurationSecondsText,
  ].filter(Boolean);
  return parts.join(' · ');
}
</script>
