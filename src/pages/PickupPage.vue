<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BrandLogo from '../components/BrandLogo.vue';
import RangePicker from '../components/RangePicker.vue';
import { getOrderListByUser, updateOnRoute } from '../api/pickup-orders';
import { DATE_RANGE_OPTIONS, todayRange, type DateRangeKey } from '../api/dashboard';
import { useOrderDetailStore } from '../stores/orderDetail';
import type { PickupOrderItem, PickupOrderListResult } from '../types/api';

const router = useRouter();
const orderDetail = useOrderDetailStore();

function viewDetail(item: PickupOrderItem): void {
  orderDetail.setOrder(item);
  router.push({ name: 'order-detail', params: { id: item.id } });
}

const loading = ref(true);
const error = ref('');
const orderData = ref<PickupOrderListResult | null>(null);
const departingIds = ref<Set<string>>(new Set());
const showSearch = ref(false);
const orderNoQuery = ref('');
const selectedRangeKey = ref<DateRangeKey>('today');

const PICKED_UP_STATUSES = new Set(['PICKED_UP']);
const FAILED_STATUSES = new Set(['ABORT_PICK_UP', 'CANCELLED', 'DELETED']);

const stops = computed(() => orderData.value?.results ?? []);

// No backend search-by-order-number filter exists for this list yet, so this
// filters the already-loaded page of stops client-side by their order id.
// Kept separate from `stops` so the summary card's counts stay based on the
// full day's totals regardless of an active search.
const visibleStops = computed(() => {
  const query = orderNoQuery.value.trim().toLowerCase();
  if (!query) return stops.value;
  return stops.value.filter((item) => item.id.toLowerCase().includes(query));
});

function clearSearch(): void {
  orderNoQuery.value = '';
}

const summary = computed(() => {
  const results = stops.value;
  return {
    locationsToPickUp: orderData.value?.metadata.total ?? results.length,
    pickedUp: results.filter((item) => PICKED_UP_STATUSES.has(item.status)).length,
    notYetPickedUp: results.filter(
      (item) => !PICKED_UP_STATUSES.has(item.status) && !FAILED_STATUSES.has(item.status),
    ).length,
    failed: results.filter((item) => FAILED_STATUSES.has(item.status)).length,
  };
});

// Prefers the backend's own pre-formatted text; falls back to computing from
// the raw meters/seconds when that text isn't populated, instead of silently
// showing a fake "0.0 km | 0 min" placeholder.
function formatDistance(meters?: number, seconds?: number, metersText?: string, secondsText?: string): string {
  if (metersText && secondsText) return `${metersText} | ${secondsText}`;
  const km = (meters ?? 0) / 1000;
  const min = Math.round((seconds ?? 0) / 60);
  return `${km.toFixed(1)} km | ${min} min`;
}

const routeSummaryText = computed(() => {
  const extra = orderData.value?.extraData;
  return formatDistance(
    extra?.totalEstimatedDistanceMeters,
    extra?.totalEstimatedDurationSeconds,
    extra?.totalEstimatedDistanceMetersText,
    extra?.totalEstimatedDurationSecondsText,
  );
});

function stopName(item: PickupOrderItem): string {
  return item.partner?.fullName || item.partner?.shop?.shopName || 'Unknown';
}

function stopPhone(item: PickupOrderItem): string {
  return item.partner?.phoneNumber || '';
}

function stopDistance(item: PickupOrderItem): string {
  return formatDistance(
    item.estimatedDistanceMeters,
    item.estimatedDurationSeconds,
    item.estimatedDistanceMetersText,
    item.estimatedDurationSecondsText,
  );
}

function mapUrl(item: PickupOrderItem): string {
  if (item.pickupLatitude == null || item.pickupLongitude == null) return '#';
  return `https://www.google.com/maps?q=${item.pickupLatitude},${item.pickupLongitude}`;
}

async function toggleDeparted(item: PickupOrderItem): Promise<void> {
  if (departingIds.value.has(item.id)) return;
  const previousOnRoute = item.onRoute;
  item.onRoute = !item.onRoute;
  departingIds.value.add(item.id);
  try {
    await updateOnRoute(item.id);
  } catch {
    item.onRoute = previousOnRoute;
  } finally {
    departingIds.value.delete(item.id);
  }
}

async function loadPickups(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const range = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
    orderData.value = await getOrderListByUser(range);
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load pickups';
  } finally {
    loading.value = false;
  }
}

function selectRange(key: DateRangeKey): void {
  selectedRangeKey.value = key;
  loadPickups();
}

onMounted(loadPickups);
</script>

<template>
  <div class="pickup-page">
    <header class="page-header">
      <div class="header-brand">
        <BrandLogo :size="38" />
        <span class="brand-text">
          <strong>Jalat</strong>
          <em>Logistic</em>
        </span>
      </div>
      <div class="header-actions">
        <RangePicker :model-value="selectedRangeKey" @update:model-value="selectRange" />
        <button type="button" class="icon-btn" aria-label="Search by order number" @click="showSearch = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
        </button>
      </div>
    </header>

    <section class="summary-card">
      <div class="summary-main">
        <div class="summary-stats">
          <div class="stat-row">
            <span>Locations To Pick Up</span>
            <strong>{{ summary.locationsToPickUp }}</strong>
          </div>
          <div class="stat-row">
            <span>Picked Up</span>
            <strong>{{ summary.pickedUp }}</strong>
          </div>
          <div class="stat-row">
            <span>Not Yet Picked Up</span>
            <strong>{{ summary.notYetPickedUp }}</strong>
          </div>
          <div class="stat-row">
            <span>Failed</span>
            <strong>{{ summary.failed }}</strong>
          </div>
        </div>
      </div>
      <svg class="summary-illustration" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="58" fill="var(--wash)" />
        <path d="M60 28 92 44v34L60 94 28 78V44Z" stroke="var(--green)" stroke-width="3" stroke-linejoin="round" />
        <path d="M28 44 60 60 92 44M60 60v34" stroke="var(--green)" stroke-width="3" stroke-linejoin="round" />
      </svg>
    </section>

    <main class="page-body">
      <div class="section-heading">
        <h2>Locations To Pick Up</h2>
        <a href="#" class="history-link" @click.prevent="router.push({ name: 'pickup-history' })">Pickup History</a>
      </div>

      <div v-if="orderNoQuery" class="search-chip">
        <span>Order no. contains "{{ orderNoQuery }}"</span>
        <button type="button" @click="clearSearch">Clear</button>
      </div>

      <div class="route-bar">{{ routeSummaryText }}</div>

      <p v-if="loading" class="hint">Loading…</p>
      <p v-else-if="error" class="hint error">{{ error }}</p>

      <ul v-else class="stop-list">
        <li v-for="(stop, index) in visibleStops" :key="stop.id" class="stop-card">
          <div class="stop-badge">{{ index + 1 }}</div>
          <div class="stop-body">
            <div class="stop-top">
              <div class="stop-identity" role="button" tabindex="0" @click="viewDetail(stop)" @keydown.enter="viewDetail(stop)">
                <p class="stop-name">{{ stopName(stop) }}</p>
                <p class="stop-phone">{{ stopPhone(stop) }}</p>
              </div>
              <a href="#" class="chat-pill" @click.prevent>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1.3-3.9a8.4 8.4 0 0 1-1.2-4.4A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
                </svg>
                <span>Chat with Shop</span>
              </a>
            </div>

            <div class="stop-meta">
              <span class="distance-pill">{{ stopDistance(stop) }}</span>
              <span class="parcel-count">Parcels: {{ stop.estimatedTotalParcel ?? 0 }}</span>
            </div>

            <div class="stop-actions">
              <a class="action-item" :href="mapUrl(stop)" target="_blank" rel="noopener">
                <span class="action-icon map">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" />
                  </svg>
                </span>
                <span>Map</span>
              </a>
              <a class="action-item" :href="`tel:${stopPhone(stop)}`">
                <span class="action-icon call">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
                  </svg>
                </span>
                <span>Call</span>
              </a>
              <button type="button" class="action-item depart-item" :class="{ on: stop.onRoute }" @click="toggleDeparted(stop)">
                <span class="action-icon depart" :class="{ on: stop.onRoute }">{{ stop.onRoute ? 'ON' : 'OFF' }}</span>
                <span>{{ stop.onRoute ? 'Departed' : 'Depart' }}</span>
              </button>
            </div>
          </div>
        </li>
      </ul>
      <p v-if="!loading && !error && !stops.length" class="empty-hint">No pickup stops right now.</p>
      <p v-else-if="!loading && !error && stops.length && !visibleStops.length" class="empty-hint">
        No stops match "{{ orderNoQuery }}".
      </p>
    </main>

    <div v-if="showSearch" class="search-backdrop" @click.self="showSearch = false">
      <div class="search-modal">
        <button type="button" class="search-close" aria-label="Close" @click="showSearch = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2>Search Pickup</h2>
        <p class="search-hint">Enter the order number to search.</p>
        <input
          v-model="orderNoQuery"
          type="text"
          class="order-search-input"
          placeholder="Order no."
          autofocus
          @keyup.enter="showSearch = false"
        />
        <button type="button" class="search-submit-btn" @click="showSearch = false">Search</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header {
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
  color: #fff;
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
  font: 600 0.72rem var(--sans);
  font-style: normal;
  opacity: 0.85;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.icon-btn {
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
.icon-btn svg {
  width: 18px;
  height: 18px;
}

.summary-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: calc(100% - 40px);
  max-width: 440px;
  margin: -58px auto 20px;
  padding: 20px;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}
.summary-main {
  flex: 1;
  min-width: 0;
}
.summary-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stat-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  color: var(--ink);
  font-size: 0.85rem;
}
.stat-row strong {
  font: 700 1rem var(--heading);
}
.summary-illustration {
  flex-shrink: 0;
  width: 88px;
  height: 88px;
}

.page-body {
  padding: 32px 16px 40px;
  max-width: 480px;
  margin: 0 auto;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-heading h2 {
  margin: 0;
  font: 700 0.9rem var(--sans);
  color: var(--ink);
}
.history-link {
  color: var(--green);
  font: 700 0.78rem var(--sans);
  text-decoration: underline;
}

.route-bar {
  padding: 14px;
  margin-bottom: 16px;
  border-radius: 14px;
  background: var(--wash);
  color: var(--ink);
  text-align: right;
  font: 700 1rem var(--heading);
}

.stop-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.stop-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
/* Connects this stop's badge to the next one's, spanning through the list's
   gap regardless of how tall this card's body ends up (variable content). */
.stop-card:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 13px;
  top: 26px;
  bottom: -16px;
  width: 0;
  border-left: 2px dashed var(--green);
}
.stop-badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
  font: 700 0.8rem var(--sans);
}
.stop-body {
  flex: 1;
  min-width: 0;
  border-radius: 16px;
  background: var(--wash);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}
.stop-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 12px 0;
  margin-bottom: 10px;
}
.stop-identity {
  cursor: pointer;
}
.stop-name {
  margin: 0;
  font: 700 0.92rem var(--sans);
  color: var(--ink);
}
.stop-phone {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 0.8rem;
}
.chat-pill {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--green);
  border-radius: 999px;
  color: var(--green);
  font: 700 0.66rem var(--sans);
  text-decoration: none;
  white-space: nowrap;
}
.chat-pill svg {
  width: 13px;
  height: 13px;
}
.stop-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px 12px;
}
.distance-pill {
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--green);
  color: #fff;
  font: 700 0.78rem var(--sans);
}
.parcel-count {
  color: var(--muted);
  font-size: 0.8rem;
}
.stop-actions {
  display: flex;
  border-top: 1px solid #fff;
  padding: 10px 6px;
}
.action-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 4px 6px;
  border: none;
  background: none;
  color: var(--muted);
  font: 600 0.68rem var(--sans);
  text-decoration: none;
  cursor: pointer;
}
.action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
.action-icon svg {
  width: 17px;
  height: 17px;
}
.action-icon.map {
  color: #e0433b;
}
.action-icon.call {
  color: var(--green);
}
.action-icon.depart {
  background: #e0433b;
  color: #fff;
  font: 700 0.6rem var(--sans);
  transition: background-color 0.15s ease;
}
.action-icon.depart.on {
  background: var(--green);
}
.depart-item.on {
  color: var(--green);
}
.empty-hint,
.hint {
  padding: 24px 0;
  text-align: center;
  color: var(--muted);
}
.hint.error {
  color: #e33;
}

.search-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 12px;
  border-radius: 999px;
  background: var(--wash);
  color: var(--ink);
  font: 600 0.78rem var(--sans);
}
.search-chip button {
  flex-shrink: 0;
  border: none;
  background: none;
  color: var(--green);
  font: 700 0.78rem var(--sans);
  text-decoration: underline;
  cursor: pointer;
}

.search-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 16px;
}
.search-modal {
  position: relative;
  width: 100%;
  max-width: 320px;
  padding: 44px 20px 24px;
  border-radius: 24px;
  background: #fff;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}
.search-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: var(--wash);
  color: var(--ink);
  cursor: pointer;
}
.search-close svg {
  width: 16px;
  height: 16px;
}
.search-modal h2 {
  margin: 0 0 6px;
  font: 700 1.05rem var(--heading);
  color: var(--ink);
}
.search-hint {
  margin: 0 0 16px;
  color: var(--muted);
  font-size: 0.82rem;
}
.order-search-input {
  display: block;
  width: 100%;
  padding: 13px 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  color: var(--ink);
  font: 500 16px var(--sans); /* iOS Safari auto-zooms on focus if an input's font-size is under 16px */
}
.order-search-input::placeholder {
  color: var(--muted);
}
.search-submit-btn {
  width: 100%;
  margin-top: 12px;
  padding: 13px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 0.88rem var(--sans);
  cursor: pointer;
}
</style>
