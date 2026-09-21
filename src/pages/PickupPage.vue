<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BrandLogo from '../components/BrandLogo.vue';
import RangePicker from '../components/RangePicker.vue';
import { getOrderListByUser, updateOnRoute } from '../api/pickup-orders';
import { resolveParcelImageUrl } from '../api/parcels';
import { DATE_RANGE_OPTIONS, todayRange, type DateRangeKey } from '../api/dashboard';
import { useOrderDetailStore } from '../stores/orderDetail';
import { useAuth } from '../composables/useAuth';
import { useDriverLocations } from '../composables/useDriverLocations';
import { useMobileInteraction } from '../composables/useMobileInteraction';
import type { PickupOrderItem, PickupOrderListResult, PickupOrderStatus } from '../types/api';

const router = useRouter();
const orderDetail = useOrderDetailStore();
const { driverUser } = useAuth();
const activeDriverId = computed(() => driverUser.value?.id ?? '');
const { driverLocations } = useDriverLocations({ currentDriverId: activeDriverId });

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
const currentTime = ref(Date.now());
let currentTimeTimer: ReturnType<typeof setInterval> | null = null;

const PICKED_UP_STATUSES = new Set(['PICKED_UP']);
const FAILED_STATUSES = new Set(['ABORT_PICK_UP', 'CANCELLED', 'DELETED']);

const stops = computed(() => orderData.value?.results ?? []);

const lastDriverLocation = computed(() => driverLocations.get(activeDriverId.value));
const etaEligibleStatuses = new Set<PickupOrderStatus>(['IN_PROGRESS', 'ON_ROUTE']);

function liveDistanceMeters(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(toLat - fromLat);
  const longitudeDelta = toRadians(toLon - fromLon);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const displayStops = computed(() => {
  const location = lastDriverLocation.value;
  const driverLat = Number(location?.lat);
  const driverLon = Number(location?.lon);
  if (!Number.isFinite(driverLat) || !Number.isFinite(driverLon)) return stops.value;

  return stops.value
    .map((item) => {
      const pickupLat = Number(item.pickupLatitude);
      const pickupLon = Number(item.pickupLongitude);
      if (
        !etaEligibleStatuses.has(item.status) ||
        !Number.isFinite(pickupLat) ||
        !Number.isFinite(pickupLon) ||
        (pickupLat === 0 && pickupLon === 0)
      ) {
        return item;
      }

      const estimatedDistanceMeters = liveDistanceMeters(driverLat, driverLon, pickupLat, pickupLon);
      const estimatedDurationSeconds = Math.round(estimatedDistanceMeters / (30000 / 3600));
      return {
        ...item,
        estimatedDistanceMeters,
        estimatedDurationSeconds,
        estimatedDistanceMetersText: estimatedDistanceMeters < 1000
          ? `${estimatedDistanceMeters}m`
          : `${(estimatedDistanceMeters / 1000).toFixed(1)}km`,
        estimatedDurationSecondsText: estimatedDurationSeconds < 60
          ? `${estimatedDurationSeconds}sec`
          : `${Math.round(estimatedDurationSeconds / 60)}min`,
      };
    })
    .sort((a, b) => (a.estimatedDistanceMeters ?? Infinity) - (b.estimatedDistanceMeters ?? Infinity));
});

const lastDriverLocationText = computed(() => {
  const updatedAt = lastDriverLocation.value?.lastUpdatedAt;
  if (!updatedAt) return 'Waiting for location';
  const elapsedSeconds = Math.max(0, Math.round((currentTime.value - updatedAt) / 1000));
  if (elapsedSeconds < 5) return 'Updated just now';
  if (elapsedSeconds < 60) return `Updated ${elapsedSeconds}s ago`;
  return `Updated ${Math.round(elapsedSeconds / 60)}m ago`;
});

// No backend search-by-order-number filter exists for this list yet, so this
// filters the already-loaded page of stops client-side by their order id.
// Kept separate from `stops` so the summary card's counts stay based on the
// full day's totals regardless of an active search.
const visibleStops = computed(() => {
  const query = orderNoQuery.value.trim().toLowerCase();
  if (!query) return displayStops.value;
  return displayStops.value.filter((item) => item.id.toLowerCase().includes(query));
});

function clearSearch(): void {
  orderNoQuery.value = '';
}

useMobileInteraction(() => {
  showSearch.value = false;
  clearSearch();
});

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

// The backend's pre-formatted text runs the number straight into the unit
// ("4.8km", "10min") — insert the space back in regardless of source so
// distance/time always reads consistently.
function withUnitSpacing(text: string): string {
  return text.replace(/(\d)([a-zA-Z])/g, '$1 $2');
}

// Prefers the backend's own pre-formatted text; falls back to computing from
// the raw meters/seconds when that text isn't populated, instead of silently
// showing a fake "0.0 km | 0 min" placeholder.
function formatDistance(meters?: number, seconds?: number, metersText?: string, secondsText?: string): string {
  if (metersText && secondsText) return withUnitSpacing(`${metersText} | ${secondsText}`);
  const km = (meters ?? 0) / 1000;
  const min = Math.round((seconds ?? 0) / 60);
  return `${km.toFixed(1)} km | ${min} min`;
}

interface DistanceParts {
  distanceText: string;
  durationText: string;
}

function formatDistanceParts(meters?: number, seconds?: number, metersText?: string, secondsText?: string): DistanceParts {
  if (metersText && secondsText) {
    return { distanceText: withUnitSpacing(metersText), durationText: withUnitSpacing(secondsText) };
  }
  const km = (meters ?? 0) / 1000;
  const min = Math.round((seconds ?? 0) / 60);
  return { distanceText: `${km.toFixed(1)} km`, durationText: `${min} min` };
}

const routeSummaryText = computed(() => {
  if (lastDriverLocation.value) {
    const totalDistance = displayStops.value.reduce(
      (sum, item) => sum + (item.estimatedDistanceMeters ?? 0),
      0,
    );
    const totalDuration = displayStops.value.reduce(
      (sum, item) => sum + (item.estimatedDurationSeconds ?? 0),
      0,
    );
    return formatDistance(totalDistance, totalDuration);
  }

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

function stopAvatarUrl(item: PickupOrderItem): string {
  return resolveParcelImageUrl(item.partner?.shop?.shopImage);
}

const STATUS_LABELS: Record<PickupOrderStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  ON_ROUTE: 'On Route',
  PICKED_UP: 'Picked Up',
  ABORT_PICK_UP: 'Aborted',
  CANCELLED: 'Cancelled',
  DELETED: 'Deleted',
  REGISTERED: 'Registered',
  PRINTED: 'Printed',
};

function statusLabel(item: PickupOrderItem): string {
  return STATUS_LABELS[item.status] ?? item.status;
}

function statusClass(item: PickupOrderItem): string {
  return item.status.toLowerCase().replace(/_/g, '-');
}

function pickupTimeText(item: PickupOrderItem): string {
  if (!item.pickupAt) return '';
  return new Date(item.pickupAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function stopDistanceParts(item: PickupOrderItem): DistanceParts {
  return formatDistanceParts(
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
onMounted(() => {
  currentTimeTimer = setInterval(() => (currentTime.value = Date.now()), 30000);
});
onBeforeUnmount(() => {
  if (currentTimeTimer) clearInterval(currentTimeTimer);
});
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

      <div class="route-bar">
        <span>{{ routeSummaryText }}</span>
        <span class="driver-location-status">
          <span class="driver-location-dot" :class="{ active: lastDriverLocation }"></span>
          {{ lastDriverLocationText }}
        </span>
      </div>

      <p v-if="loading" class="hint">Loading…</p>
      <p v-else-if="error" class="hint error">{{ error }}</p>

      <ul v-else class="stop-list">
        <li v-for="(stop, index) in visibleStops" :key="stop.id" class="stop-card">
          <div class="stop-badge">{{ index + 1 }}</div>
          <div class="stop-body">
            <div class="stop-top">
              <div class="stop-avatar">
                <img v-if="stopAvatarUrl(stop)" :src="stopAvatarUrl(stop)" alt="" />
                <span v-else class="stop-avatar-fallback">{{ stopName(stop).charAt(0) }}</span>
              </div>
              <div class="stop-identity" role="button" tabindex="0" @click="viewDetail(stop)" @keydown.enter="viewDetail(stop)">
                <p class="stop-name">{{ stopName(stop) }}</p>
                <p class="stop-phone">{{ stopPhone(stop) }}</p>
                <p v-if="pickupTimeText(stop)" class="stop-pickup-time">Pickup {{ pickupTimeText(stop) }}</p>
              </div>
              <div class="stop-top-right">
                <a href="#" class="chat-pill" @click.prevent>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1.3-3.9a8.4 8.4 0 0 1-1.2-4.4A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
                  </svg>
                  <span>Chat with Shop</span>
                </a>
                <span class="status-badge" :class="statusClass(stop)">{{ statusLabel(stop) }}</span>
              </div>
            </div>

            <div class="stop-meta">
              <div class="distance-row">
                <span class="distance-pill">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" />
                  </svg>
                  {{ stopDistanceParts(stop).distanceText }}
                  <span class="pill-sep"></span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
                  </svg>
                  {{ stopDistanceParts(stop).durationText }}
                </span>
              </div>
              <button
                type="button"
                class="view-details-row"
                @click="viewDetail(stop)"
              >
                <span class="parcel-count">Parcels: {{ stop.estimatedTotalParcel ?? 0 }}</span>
                <span class="view-details-link">
                  View details
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </button>
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
                <span>{{ stop.onRoute ? 'Departed' : 'On Route' }}</span>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  margin-bottom: 16px;
  border-radius: 14px;
  background: var(--wash);
  color: var(--ink);
  text-align: right;
  font: 700 1rem var(--heading);
}
.driver-location-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font: 600 0.68rem var(--sans);
  white-space: nowrap;
}
.driver-location-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}
.driver-location-dot.active {
  background: var(--green);
}

.stop-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stop-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
/* Connects this stop's badge to the next one's, spanning through the list's
   gap regardless of how tall this card's body ends up (variable content). */
.stop-card:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 11px;
  top: 22px;
  bottom: -12px;
  width: 0;
  border-left: 2px dashed var(--green);
}
.stop-badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
  font: 700 0.72rem var(--sans);
}
.stop-body {
  flex: 1;
  min-width: 0;
  border-radius: 14px;
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.stop-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 10px 0;
  margin-bottom: 7px;
}
.stop-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--line);
}
.stop-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.stop-avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font: 700 0.78rem var(--sans);
  text-transform: uppercase;
}
.stop-identity {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.stop-name {
  margin: 0;
  font: 700 0.85rem var(--sans);
  color: var(--ink);
}
.stop-phone {
  margin: 1px 0 0;
  color: #4b5563;
  font-size: 0.76rem;
  font-weight: 500;
}
.stop-pickup-time {
  margin: 2px 0 0;
  color: #4b5563;
  font-size: 0.7rem;
  font-weight: 600;
}
.stop-top-right {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}
.chat-pill {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  border: 1px solid var(--green);
  border-radius: 999px;
  color: var(--green);
  font: 700 0.62rem var(--sans);
  text-decoration: none;
  white-space: nowrap;
}
.chat-pill svg {
  width: 11px;
  height: 11px;
}
.status-badge {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 999px;
  font: 700 0.62rem var(--sans);
  letter-spacing: 0.01em;
  white-space: nowrap;
  background: var(--muted);
  color: #fff;
}
.status-badge.pending,
.status-badge.registered,
.status-badge.printed {
  background: var(--muted);
  color: #fff;
}
.status-badge.in-progress {
  background: var(--orange);
  color: #fff;
}
.status-badge.on-route {
  background: #1a73e8;
  color: #fff;
}
.status-badge.picked-up {
  background: var(--green);
  color: #fff;
}
.status-badge.abort-pick-up,
.status-badge.cancelled,
.status-badge.deleted {
  background: #e0433b;
  color: #fff;
}
.stop-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 10px 9px;
}
.distance-row {
  display: flex;
  justify-content: flex-end;
}
.distance-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--green);
  color: #fff;
  font: 700 0.72rem var(--sans);
}
.distance-pill svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  opacity: 0.9;
}
.pill-sep {
  width: 1px;
  align-self: stretch;
  margin: 0 2px;
  background: rgba(255, 255, 255, 0.4);
}
.view-details-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
}
.parcel-count {
  color: #4b5563;
  font-size: 0.76rem;
  font-weight: 600;
}
.view-details-link {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  color: var(--green);
  font: 700 0.68rem var(--sans);
}
.view-details-link svg {
  width: 13px;
  height: 13px;
}
.stop-actions {
  display: flex;
  border-top: 1px solid var(--line);
  padding: 6px 4px;
}
.action-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 3px 4px;
  border: none;
  background: none;
  color: #4b5563;
  font: 700 0.64rem var(--sans);
  text-decoration: none;
  cursor: pointer;
}
.action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
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
  color: #e0433b;
  font: 700 0.66rem var(--sans);
  transition: color 0.15s ease;
}
.action-icon.depart.on {
  color: var(--green);
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
