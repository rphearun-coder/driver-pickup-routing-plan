<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { resolveParcelImageUrl } from '../api/parcels';
import { useOrderDetailStore } from '../stores/orderDetail';

const router = useRouter();
const store = useOrderDetailStore();
const order = computed(() => store.order);

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f4a340',
  REGISTERED: '#f4a340',
  PRINTED: '#f4a340',
  IN_PROGRESS: '#21a366',
  ON_ROUTE: '#21a366',
  PICKED_UP: '#21a366',
  ABORT_PICK_UP: '#e0433b',
  CANCELLED: '#e0433b',
  DELETED: '#e0433b',
};

const statusColor = computed(() => STATUS_COLORS[order.value?.status ?? ''] ?? '#6c756f');

function formatDistance(): string {
  const item = order.value;
  if (!item) return '';
  if (item.estimatedDistanceMetersText && item.estimatedDurationSecondsText) {
    return `${item.estimatedDistanceMetersText} | ${item.estimatedDurationSecondsText}`;
  }
  const km = (item.estimatedDistanceMeters ?? 0) / 1000;
  const min = Math.round((item.estimatedDurationSeconds ?? 0) / 60);
  return `${km.toFixed(1)} km | ${min} min`;
}

function formatDateTime(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

const mapUrl = computed(() => {
  const item = order.value;
  if (!item || item.pickupLatitude == null || item.pickupLongitude == null) return '#';
  return `https://www.google.com/maps?q=${item.pickupLatitude},${item.pickupLongitude}`;
});

const shopImageUrl = computed(() => resolveParcelImageUrl(order.value?.partner?.shop?.shopImage));
</script>

<template>
  <div class="detail-page">
    <header class="page-header">
      <button type="button" class="back" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h1>Order Details</h1>
    </header>

    <div v-if="!order" class="hint">
      <p>This order couldn't be found — it may have expired from the list you came from.</p>
      <button type="button" class="back-link" @click="router.back()">Go back</button>
    </div>

    <div v-else class="detail-body">
      <div class="shop-card">
        <div class="shop-thumb">
          <img v-if="shopImageUrl" :src="shopImageUrl" alt="" />
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7l9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" />
          </svg>
        </div>
        <div class="shop-info">
          <p class="shop-name">{{ order.partner?.shop?.shopName || order.partner?.fullName || 'Unknown' }}</p>
          <p class="shop-address">{{ order.partner?.shop?.address || order.pickupAddress || '—' }}</p>
        </div>
        <span class="status-badge" :style="{ background: statusColor }">{{ order.status }}</span>
      </div>

      <div class="info-list">
        <div class="info-row">
          <span>Contact</span>
          <a v-if="order.partner?.phoneNumber" :href="`tel:${order.partner.phoneNumber}`">{{ order.partner.phoneNumber }}</a>
          <strong v-else>—</strong>
        </div>
        <div class="info-row">
          <span>Pickup address</span>
          <strong>{{ order.pickupAddress || '—' }}</strong>
        </div>
        <div class="info-row">
          <span>Distance / ETA</span>
          <strong>{{ formatDistance() }}</strong>
        </div>
        <div class="info-row">
          <span>Parcels</span>
          <strong>{{ order.estimatedTotalParcel ?? 0 }}</strong>
        </div>
        <div class="info-row">
          <span>Pickup time</span>
          <strong>{{ formatDateTime(order.pickupAt) }}</strong>
        </div>
        <div class="info-row">
          <span>Created</span>
          <strong>{{ formatDateTime(order.createdAt) }}</strong>
        </div>
      </div>

      <div class="detail-actions">
        <a class="action-btn" :href="mapUrl" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" />
          </svg>
          <span>Open in Maps</span>
        </a>
        <a v-if="order.partner?.phoneNumber" class="action-btn call" :href="`tel:${order.partner.phoneNumber}`">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
          </svg>
          <span>Call</span>
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  padding-bottom: 40px;
}
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid var(--line);
}
.back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--wash);
  color: var(--ink);
  cursor: pointer;
}
.back svg {
  width: 18px;
  height: 18px;
}
.page-header h1 {
  margin: 0;
  font: 700 1.15rem var(--heading);
  color: var(--ink);
}
.hint {
  padding: 60px 24px;
  text-align: center;
  color: var(--muted);
}
.back-link {
  margin-top: 12px;
  padding: 10px 20px;
  border: none;
  border-radius: 999px;
  background: var(--wash);
  color: var(--ink);
  font: 700 0.85rem var(--sans);
  cursor: pointer;
}
.detail-body {
  padding: 32px 16px 40px;
}
.shop-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  background: var(--wash);
  margin-bottom: 16px;
}
.shop-thumb {
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
.shop-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.shop-thumb svg {
  width: 26px;
  height: 26px;
}
.shop-info {
  flex: 1;
  min-width: 0;
}
.shop-name {
  margin: 0 0 2px;
  font: 700 0.95rem var(--sans);
  color: var(--ink);
}
.shop-address {
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
.info-list {
  border-radius: 16px;
  border: 1px solid var(--line);
  overflow: hidden;
}
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
.detail-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}
.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 0.85rem var(--sans);
  text-decoration: none;
}
.action-btn.call {
  background: var(--orange);
}
.action-btn svg {
  width: 18px;
  height: 18px;
}
</style>
