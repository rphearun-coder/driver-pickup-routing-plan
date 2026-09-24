<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getOrderById } from '../api/pickup-orders';
import { resolveParcelImageUrl } from '../api/parcels';
import { useOrderDetailStore } from '../stores/orderDetail';
import type { PickupOrderStatus } from '../types/api';

// Read-only view of a finished pickup (opened from PickupHistoryPage) — the live
// pickup workflow (parcel count, photos, confirm) lives in OrderDetailPage.vue.
const route = useRoute();
const router = useRouter();
const store = useOrderDetailStore();
const order = computed(() => store.order);
const loading = ref(false);
const loadError = ref('');
const previewIndex = ref<number | null>(null);

const STATUS_LABELS: Partial<Record<PickupOrderStatus, string>> = {
  PICKED_UP: 'Picked Up',
  ABORT_PICK_UP: 'Aborted',
  CANCELLED: 'Cancelled',
  DELETED: 'Deleted',
  REGISTERED: 'Registered',
  PRINTED: 'Printed',
};

const name = computed(() => order.value?.partner?.fullName || order.value?.partner?.shop?.shopName || '—');
const shopName = computed(() => order.value?.partner?.shop?.shopName || '');
const shopImageUrl = computed(() => resolveParcelImageUrl(order.value?.partner?.shop?.shopImage));
const initial = computed(() => name.value.trim().charAt(0).toUpperCase() || '?');
const phoneNumber = computed(() => order.value?.partner?.phoneNumber || '');
const address = computed(() => order.value?.pickupAddress || order.value?.partner?.shop?.address || '');
const isPicked = computed(() => order.value?.status === 'PICKED_UP');
const statusLabel = computed(() => (order.value ? STATUS_LABELS[order.value.status] ?? order.value.status : ''));
const mapUrl = computed(() => {
  const lat = order.value?.pickupLatitude || order.value?.partner?.shop?.latitude;
  const lng = order.value?.pickupLongitude || order.value?.partner?.shop?.longitude;
  if (lat && lng) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (address.value) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.value)}`;
  return '';
});

const pickupDate = computed(() => {
  const value = order.value?.pickupAt || order.value?.createdAt;
  return value ? new Date(value) : null;
});
const dateText = computed(() =>
  pickupDate.value ? pickupDate.value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
);
const timeText = computed(() =>
  pickupDate.value ? pickupDate.value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—',
);

const parcels = computed(() =>
  (order.value?.parcels ?? []).map((parcel, index) => ({
    id: parcel.id,
    label: parcel.parcelUID || `Parcel ${index + 1}`,
    url: resolveParcelImageUrl(parcel.parcelImage),
  })),
);
const parcelCount = computed(() => parcels.value.length || order.value?.estimatedTotalParcel || 0);
const photos = computed(() => parcels.value.filter((parcel) => parcel.url));
const preview = computed(() => (previewIndex.value === null ? null : photos.value[previewIndex.value] ?? null));

function stepPreview(delta: number): void {
  if (previewIndex.value === null || !photos.value.length) return;
  previewIndex.value = (previewIndex.value + delta + photos.value.length) % photos.value.length;
}

async function loadOrder(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    store.setOrder(await getOrderById(String(route.params.id)));
  } catch (err: any) {
    loadError.value = err.message ?? 'Failed to load this pickup';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  // PickupHistoryPage stashes the order before navigating; a reload or direct link doesn't.
  if (store.order?.id !== route.params.id) loadOrder();
});
</script>

<template>
  <div class="detail-page">
    <header class="page-header">
      <button type="button" class="header-btn" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <div class="header-title">
        <h1>Pickup Details</h1>
      </div>
      <span class="header-spacer" aria-hidden="true"></span>
    </header>

    <div v-if="!order" class="state">
      <template v-if="loading">
        <span class="spinner" aria-hidden="true"></span>
        <p>Loading pickup…</p>
      </template>
      <template v-else>
        <p>{{ loadError || "This pickup couldn't be found." }}</p>
        <button type="button" class="state-btn" @click="loadError ? loadOrder() : router.back()">
          {{ loadError ? 'Try again' : 'Go back' }}
        </button>
      </template>
    </div>

    <div v-else class="detail-body">
      <section class="card sender-card">
        <div class="sender-top">
          <div class="avatar" :class="{ failed: !isPicked }">
            <img v-if="shopImageUrl" :src="shopImageUrl" alt="" />
            <span v-else>{{ initial }}</span>
          </div>
          <div class="sender-meta">
            <p class="sender-label">Sender</p>
            <p class="sender-name">{{ name }}</p>
            <p v-if="shopName && shopName !== name" class="sender-shop">{{ shopName }}</p>
          </div>
          <span class="status-badge" :class="{ failed: !isPicked }">{{ statusLabel }}</span>
        </div>

        <div class="sender-rows">
          <div class="sender-row">
            <span class="row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z" />
              </svg>
            </span>
            <div class="row-text">
              <span class="row-label">Phone number</span>
              <span class="row-value">{{ phoneNumber || '—' }}</span>
            </div>
            <a v-if="phoneNumber" class="row-action call" :href="`tel:${phoneNumber}`">Call</a>
          </div>
          <div class="sender-row">
            <span class="row-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
            </span>
            <div class="row-text">
              <span class="row-label">Pickup location</span>
              <span class="row-value">{{ address || '—' }}</span>
            </div>
            <a v-if="mapUrl" class="row-action" :href="mapUrl" target="_blank" rel="noopener">Map</a>
          </div>
        </div>
      </section>

      <section class="stats">
        <div class="stat">
          <span class="stat-value">{{ parcelCount }}</span>
          <span class="stat-label">Parcels</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ timeText }}</span>
          <span class="stat-label">{{ isPicked ? 'Picked up at' : 'Time' }}</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ dateText }}</span>
          <span class="stat-label">Date</span>
        </div>
      </section>

      <section class="photos-section">
        <div class="section-heading">
          <h2>Parcel photos</h2>
          <span v-if="photos.length" class="count-pill">{{ photos.length }}</span>
        </div>

        <div v-if="photos.length" class="photo-grid">
          <button v-for="(photo, i) in photos" :key="photo.id" type="button" class="photo-thumb" @click="previewIndex = i">
            <img :src="photo.url" alt="" loading="lazy" />
            <span class="photo-label">{{ photo.label }}</span>
          </button>
        </div>
        <div v-else class="photo-empty">
          <span class="photo-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
              <circle cx="9" cy="10" r="1.8" />
              <path d="M20.5 16l-5-5-8.5 8" />
            </svg>
          </span>
          <p class="photo-empty-title">No photos</p>
          <p class="photo-empty-text">No parcel photos were recorded for this pickup.</p>
        </div>
      </section>

      <section v-if="parcels.length" class="parcels-section">
        <div class="section-heading">
          <h2>Parcels</h2>
          <span class="count-pill">{{ parcels.length }}</span>
        </div>
        <ul class="parcel-list">
          <li v-for="(parcel, index) in parcels" :key="parcel.id" class="parcel-row">
            <span class="parcel-number">{{ index + 1 }}</span>
            <span class="parcel-code">{{ parcel.label }}</span>
            <span class="parcel-photo" :class="{ done: parcel.url }">{{ parcel.url ? '✓ Photo' : 'No photo' }}</span>
          </li>
        </ul>
      </section>
    </div>

    <Teleport to="#overlay-root">
      <div v-if="preview" class="lightbox" @click.self="previewIndex = null">
        <button type="button" class="lightbox-close" aria-label="Close" @click="previewIndex = null">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <img :src="preview.url" alt="Parcel photo" />
        <div class="lightbox-bar">
          <button v-if="photos.length > 1" type="button" class="lightbox-nav" aria-label="Previous" @click="stepPreview(-1)">‹</button>
          <span class="lightbox-caption">{{ preview.label }} · {{ (previewIndex ?? 0) + 1 }}/{{ photos.length }}</span>
          <button v-if="photos.length > 1" type="button" class="lightbox-nav" aria-label="Next" @click="stepPreview(1)">›</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.detail-page {
  min-height: 100%;
  background: var(--page);
}
.page-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid var(--track);
}
/* Native-style header: the title sits left beside the back button, so it never collides
   with the right-side control and truncates on narrow phones (e.g. iPhone 12, 390px). */
.page-header > * {
  flex-shrink: 0;
}
.header-title {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 12px;
}
.header-title h1 {
  margin: 0;
  overflow: hidden;
  color: var(--ink);
  font: 700 1.1rem var(--sans);
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-sub {
  overflow: hidden;
  color: var(--muted);
  font: 500 0.74rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--ink);
  cursor: pointer;
}
.header-btn svg {
  width: 22px;
  height: 22px;
}
.header-spacer {
  width: 40px;
}
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 72px 24px;
  color: var(--muted);
  text-align: center;
}
.state p {
  margin: 0;
}
.state-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 999px;
  background: #fff;
  color: var(--ink);
  font: 700 0.85rem var(--sans);
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.08);
  cursor: pointer;
}
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-dashed);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.detail-body {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px 16px 32px;
}
.card {
  padding: 16px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(17, 24, 39, 0.05);
}
.sender-top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--divider);
}
.avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 700 1.2rem var(--sans);
}
.avatar.failed {
  background: var(--red-soft);
  color: var(--red-strong);
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sender-meta {
  flex: 1;
  min-width: 0;
}
.sender-label {
  margin: 0;
  color: var(--muted);
  font: 600 0.7rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sender-name {
  margin: 1px 0 0;
  color: var(--ink);
  font: 700 1rem var(--sans);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sender-shop {
  margin: 1px 0 0;
  color: var(--muted);
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-badge {
  flex-shrink: 0;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 700 0.66rem var(--sans);
  white-space: nowrap;
}
.status-badge.failed {
  background: var(--red-soft);
  color: var(--red-strong);
}
.sender-rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
}
.sender-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.row-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--fill);
  color: var(--text-3);
}
.row-icon svg {
  width: 18px;
  height: 18px;
}
.row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.row-label {
  color: var(--muted);
  font-size: 0.72rem;
}
.row-value {
  color: var(--ink);
  font: 500 0.9rem var(--sans);
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.row-action {
  flex-shrink: 0;
  padding: 7px 14px;
  border-radius: 999px;
  background: var(--blue-soft);
  color: var(--blue);
  font: 700 0.78rem var(--sans);
  text-decoration: none;
}
.row-action.call {
  background: var(--green-soft);
  color: var(--green-strong);
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-top: 12px;
  padding: 14px 6px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(17, 24, 39, 0.05);
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  padding: 0 6px;
  text-align: center;
}
.stat + .stat {
  border-left: 1px solid var(--divider);
}
.stat-value {
  max-width: 100%;
  overflow: hidden;
  color: var(--ink);
  font: 700 0.98rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stat-label {
  color: var(--muted);
  font: 500 0.7rem var(--sans);
}
.photos-section,
.parcels-section {
  margin-top: 22px;
}
.section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 2px 12px;
}
.section-heading h2 {
  margin: 0;
  color: var(--ink);
  font: 700 1rem var(--sans);
}
.count-pill {
  min-width: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--blue-soft);
  color: var(--blue);
  font: 700 0.75rem var(--sans);
  text-align: center;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.photo-thumb {
  position: relative;
  aspect-ratio: 1;
  padding: 0;
  border: none;
  border-radius: 12px;
  overflow: hidden;
  background: var(--input);
  cursor: pointer;
}
.photo-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.photo-label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 6px 5px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
  color: #fff;
  font: 600 0.62rem var(--sans);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.photo-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 20px;
  border: 1.5px dashed var(--border-dashed);
  border-radius: 16px;
  background: #fff;
  text-align: center;
}
.photo-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  margin-bottom: 10px;
  border-radius: 50%;
  background: var(--input);
  color: var(--muted);
}
.photo-empty-icon svg {
  width: 26px;
  height: 26px;
}
.photo-empty-title {
  margin: 0 0 4px;
  color: var(--ink);
  font: 700 0.9rem var(--sans);
}
.photo-empty-text {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
}
.parcel-list {
  list-style: none;
  margin: 0;
  padding: 4px 14px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.04);
}
.parcel-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 0;
}
.parcel-row + .parcel-row {
  border-top: 1px solid var(--divider);
}
.parcel-number {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--fill);
  color: var(--text-3);
  font: 700 0.75rem var(--sans);
}
.parcel-code {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font: 600 0.85rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.parcel-photo {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--fill);
  color: var(--muted);
  font: 600 0.68rem var(--sans);
}
.parcel-photo.done {
  background: var(--green-soft);
  color: var(--green-strong);
}
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px 16px;
  background: rgba(0, 0, 0, 0.9);
}
.lightbox img {
  max-width: 100%;
  max-height: 72%;
  border-radius: 12px;
  object-fit: contain;
}
.lightbox-close {
  position: absolute;
  top: calc(16px + env(safe-area-inset-top));
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  cursor: pointer;
}
.lightbox-close svg {
  width: 18px;
  height: 18px;
}
.lightbox-bar {
  display: flex;
  align-items: center;
  gap: 16px;
}
.lightbox-nav {
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font: 400 1.8rem/1 var(--sans);
  cursor: pointer;
}
.lightbox-caption {
  color: #fff;
  font: 600 0.85rem var(--sans);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
