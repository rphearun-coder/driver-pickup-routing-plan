<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { DATE_RANGE_OPTIONS, getDriverDashboard, todayRange, type DateRangeKey } from '../api/dashboard.ts';
import {
  getDeliveryList,
  parcelSellerName,
  resolveParcelImageUrl,
  scanParcelQrCode,
  updateParcelOnRoute,
  type Parcel,
  type ParcelListResult,
} from '../api/parcels.ts';
import AppToast from '../components/AppToast.vue';
import BrandHeader from '../components/BrandHeader.vue';
import HeaderIconButton from '../components/HeaderIconButton.vue';
import SearchChip from '../components/SearchChip.vue';
import SearchDialog from '../components/SearchDialog.vue';
import StateBlock from '../components/StateBlock.vue';
import { vScrollX } from '../directives/scrollX';
import SortToggle from '../components/SortToggle.vue';
import { useRouteSort } from '../composables/useRouteSort';
import { formatDistanceParts, toLatLng, type DistanceParts } from '../utils/geo';
import RouteSummaryCard from '../components/RouteSummaryCard.vue';
import { useAuth } from '../composables/useAuth';
import { useDriverLocations } from '../composables/useDriverLocations';
import RangePicker from '../components/RangePicker.vue';
import ScanQRCodeModal from '../components/ScanQRCodeModal.vue';
import DeliverParcelDialog from '../components/DeliverParcelDialog.vue';
import DeliveryFailedDialog from '../components/DeliveryFailedDialog.vue';
import { useOrderDetailStore } from '../stores/orderDetail';
import { useMobileInteraction } from '../composables/useMobileInteraction';
import { useToast } from '../composables/useToast';
import type { DriverDashboardSummary } from '../types/api.ts';
import { extractUuid, normalizePhone } from '../utils/inputRules';

const router = useRouter();
const orderDetail = useOrderDetailStore();

function viewDetail(item: Parcel): void {
  orderDetail.setParcel(item);
  router.push({ name: 'parcel-detail', params: { id: item.id } });
}

const stats = ref<DriverDashboardSummary | null>(null);
const showScan = ref(false);
const selectedRangeKey = ref<DateRangeKey>('today');
const rangePicker = ref<InstanceType<typeof RangePicker> | null>(null);

const deliveryItems = ref<Parcel[]>([]);
const loading = ref(true);
const error = ref('');
const brokenThumbIds = ref<Set<string>>(new Set());
const search = ref('');
const routeFilter = ref<'all' | 'en-route' | 'not-started'>('all');
const togglingIds = ref<Set<string>>(new Set());

// Deliver / Failed straight from the list, same dialogs as the detail page.
const deliverTarget = ref<Parcel | null>(null);
const failTarget = ref<Parcel | null>(null);

function openScan(): void {
  rangePicker.value?.close();
  showScan.value = true;
}

// Search icon beside the date picker opens <SearchDialog>; the active query
// shows as a <SearchChip> above the list.
const showSearch = ref(false);

function openSearch(): void {
  rangePicker.value?.close();
  showSearch.value = true;
}

function applySearch(query: string): void {
  search.value = query;
  showSearch.value = false;
}

const toast = useToast();
const showMessage = toast.show;

useMobileInteraction(() => {
  showScan.value = false;
  showSearch.value = false;
  toast.clear();
});

function onThumbError(itemId: string): void {
  brokenThumbIds.value = new Set(brokenThumbIds.value).add(itemId);
}

function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function deliveryCustomer(item: Parcel): string {
  return item.recipientName || item.location || 'Unknown recipient';
}

function deliveryCode(item: Parcel): string {
  return item.parcelUID || `#${item.id.slice(-6).toUpperCase()}`;
}

// codUsd is 0 (not null) on every real record so far — `??` never falls through
// to price, which is where the actual non-zero amount lives. `||` does.
function deliveryAmount(item: Parcel): number {
  return item.codUsd || item.price || 0;
}

function deliveryThumb(item: Parcel): string {
  if (brokenThumbIds.value.has(item.id)) return '';
  return resolveParcelImageUrl(item.parcelImage || item.receiptImage);
}

// The column defaults to 0, so 0,0 means "no location" — not a point in the Atlantic.
function hasCoords(item: Parcel): boolean {
  return toLatLng(item.deliveryLatitude, item.deliveryLongitude) != null;
}

function deliveryMapUrl(item: Parcel): string {
  if (hasCoords(item)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${item.deliveryLatitude},${item.deliveryLongitude}`;
  }
  if (item.location) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`;
  return '';
}

// ---- Newest / Nearest (shared with Pickups): the Order Service sorts (routeSort) ----
const routeSort = useRouteSort(() => loadDeliveries());
const sortBy = routeSort.sortBy;

// The card's 📍 km / 🕒 min pills — the Order Service's estimate. null when the parcel
// has no location (or the driver's position is unknown), shown as "No location".
function distanceParts(item: Parcel): DistanceParts | null {
  if (!item.estimatedDistanceMeters) return null;
  return formatDistanceParts(
    item.estimatedDistanceMeters,
    item.estimatedDurationSeconds,
    item.estimatedDistanceMetersText,
    item.estimatedDurationSecondsText,
  );
}

// ---- Today's route card (shared with Pickups) ----
const { driverUser } = useAuth();
const driverId = computed(() => driverUser.value?.id ?? '');
const { driverLocations } = useDriverLocations({ currentDriverId: driverId });
const lastDriverLocation = computed(() => driverLocations.get(driverId.value));
const routeExtra = ref<ParcelListResult['extraData']>();
const routeSummary = computed(() =>
  formatDistanceParts(
    routeExtra.value?.totalEstimatedDistanceMeters,
    routeExtra.value?.totalEstimatedDurationSeconds,
    routeExtra.value?.totalEstimatedDistanceMetersText,
    routeExtra.value?.totalEstimatedDurationSecondsText,
  ),
);

// ---- Filtering ----
const enRouteCount = computed(() => deliveryItems.value.filter((item) => item.onRoute).length);

// Phone digits are compared in local form, so "+855 12 345 678", "012345678" and
// "12 345" all match the same recipient. Needs 3+ digits to avoid matching everything.
const visibleItems = computed(() => {
  const query = search.value.replace(/\s+/g, ' ').trim().toLowerCase();
  const phoneQuery = /^[\d\s+()-]+$/.test(query) ? normalizePhone(query) : '';
  const list = deliveryItems.value.filter((item) => {
    if (routeFilter.value === 'en-route' && !item.onRoute) return false;
    if (routeFilter.value === 'not-started' && item.onRoute) return false;
    if (!query) return true;
    if (phoneQuery.length >= 3 && normalizePhone(item.recipientNumber || '').includes(phoneQuery)) return true;
    return [item.recipientNumber, item.recipientName, item.location, item.parcelUID, parcelSellerName(item)]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query));
  });
  // Already in Nearest / Newest order from the Order Service.
  return list;
});

const totalAmount = computed(() => deliveryItems.value.reduce((sum, item) => sum + deliveryAmount(item), 0));
const progress = computed(() => {
  const total = stats.value?.totalDeliveryParcel ?? 0;
  const done = (stats.value?.totalDeliverySuccess ?? 0) + (stats.value?.totalDeliveryFailed ?? 0);
  return total ? Math.min(100, Math.round((done / total) * 100)) : 0;
});

// The selected date range is sent to the server as part of the parcel filter.
// We should not apply a second client-side createdAt filter here because the
// server is the source of truth for the live ON_DELIVERY list and extra
// re-filtering can silently hide valid parcels with missing or out-of-sync dates.
async function loadDeliveries(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const { startAt, endAt } = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
    const data = await getDeliveryList({
      ...routeSort.params(),
      startAt,
      endAt,
    });
    routeExtra.value = data.extraData;
    deliveryItems.value = Array.isArray(data.results) ? data.results : [];
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load deliveries';
  } finally {
    loading.value = false;
  }
}

async function loadStats(): Promise<void> {
  try {
    const range = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
    stats.value = await getDriverDashboard(range);
  } catch {
    stats.value = null;
  }
}

function selectRange(key: DateRangeKey): void {
  selectedRangeKey.value = key;
  loadStats();
  loadDeliveries();
}

// Saved server-side (updateParcelOnRoute); flipped optimistically and reverted on failure.
async function toggleEnRoute(item: Parcel): Promise<void> {
  if (togglingIds.value.has(item.id)) return;
  const next = !item.onRoute;
  item.onRoute = next;
  togglingIds.value = new Set(togglingIds.value).add(item.id);
  try {
    await updateParcelOnRoute(item.id, next);
    showMessage(next ? `${deliveryCustomer(item)} — on the way.` : 'Marked as not started.');
  } catch (err: any) {
    item.onRoute = !next;
    showMessage(err.message ?? "Couldn't update En Route.", 'error');
  } finally {
    const rest = new Set(togglingIds.value);
    rest.delete(item.id);
    togglingIds.value = rest;
  }
}

function onFinished(item: Parcel | null, text: string): void {
  deliverTarget.value = null;
  failTarget.value = null;
  if (item) deliveryItems.value = deliveryItems.value.filter((p) => p.id !== item.id);
  showMessage(text);
  loadStats();
}

// The scanned QR encodes the parcel's own id (see Jalat-Order-Service's
// scanQRCode) — a successful scan assigns it to this driver and moves it to
// ON_DELIVERY server-side, so the list is reloaded to pick it up.
async function onQrScanned(rawValue: string): Promise<void> {
  const id = extractUuid(rawValue);
  if (!id) {
    showMessage("That QR code isn't a Jalat parcel.", 'error');
    return;
  }
  if (deliveryItems.value.some((item) => item.id.toLowerCase() === id)) {
    showMessage('That parcel is already in your deliveries.', 'error');
    return;
  }
  try {
    const parcel = await scanParcelQrCode(id);
    showMessage(`${deliveryCustomer(parcel)} added to your deliveries.`);
    loadDeliveries();
    loadStats();
  } catch (err: any) {
    showMessage(err.message ?? 'Could not scan that QR code.', 'error');
  }
}

onMounted(async () => {
  await loadStats();
  loadDeliveries();
});

</script>

<template>
  <div class="deliveries-page">
    <BrandHeader>
      <RangePicker ref="rangePicker" :model-value="selectedRangeKey" @update:model-value="selectRange" />
      <HeaderIconButton label="Search deliveries" :active="!!search" @click="openSearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
      </HeaderIconButton>
    </BrandHeader>

    <section class="summary-card">
      <div class="summary-grid">
        <div class="stat">
          <span class="stat-value">{{ stats?.totalDeliveryParcel ?? 0 }}</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="stat">
          <span class="stat-value orange">{{ stats?.totalRemainingDelivery ?? 0 }}</span>
          <span class="stat-label">To deliver</span>
        </div>
        <div class="stat">
          <span class="stat-value green">{{ stats?.totalDeliverySuccess ?? 0 }}</span>
          <span class="stat-label">Delivered</span>
        </div>
        <div class="stat">
          <span class="stat-value red">{{ stats?.totalDeliveryFailed ?? 0 }}</span>
          <span class="stat-label">Failed</span>
        </div>
      </div>
      <div class="progress">
        <div class="progress-track"><div class="progress-fill" :style="{ width: `${progress}%` }"></div></div>
        <span class="progress-text">{{ progress }}% done</span>
      </div>
    </section>

    <main class="page-body">
      <RouteSummaryCard
        class="route-summary"
        :distance-text="routeSummary.distanceText"
        :duration-text="routeSummary.durationText"
        :count="deliveryItems.length"
        :last-updated-at="lastDriverLocation?.lastUpdatedAt"
      />

      <button type="button" class="scan-btn" @click="openScan">
        <span class="scan-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
            <path d="M7 12h10" />
          </svg>
        </span>
        <span class="scan-text">
          <strong>Scan parcel</strong>
          <small>Add a parcel to your deliveries</small>
        </span>
        <svg class="scan-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      <div class="section-heading">
        <h2>
          To deliver
          <span class="count-pill">{{ deliveryItems.length }}</span>
        </h2>
        <a href="#" class="history-link" @click.prevent="router.push({ name: 'delivery-history' })">History</a>
      </div>

      <SearchChip v-if="search" :query="search" :count="visibleItems.length" @clear="search = ''" />

      <div class="toolbar">
        <div v-scroll-x class="chips scroll-row" role="tablist">
          <button type="button" role="tab" :aria-selected="routeFilter === 'all'" :class="{ active: routeFilter === 'all' }" @click="routeFilter = 'all'">
            All
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="routeFilter === 'en-route'"
            :class="{ active: routeFilter === 'en-route' }"
            @click="routeFilter = 'en-route'"
          >
            En route <span class="chip-count">{{ enRouteCount }}</span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="routeFilter === 'not-started'"
            :class="{ active: routeFilter === 'not-started' }"
            @click="routeFilter = 'not-started'"
          >
            Not started <span class="chip-count">{{ deliveryItems.length - enRouteCount }}</span>
          </button>
        </div>
        <SortToggle :mode="sortBy" @toggle="routeSort.toggle" />
      </div>

      <ul v-if="loading" class="order-list" aria-hidden="true">
        <li v-for="n in 3" :key="n" class="order-card skeleton">
          <div class="order-top">
            <span class="order-thumb sk"></span>
            <span class="sk-lines"><span class="sk sk-line"></span><span class="sk sk-line"></span><span class="sk sk-line short"></span></span>
          </div>
        </li>
      </ul>

      <StateBlock
        v-else-if="error"
        tone="error"
        title="Couldn't load deliveries"
        :text="error"
        action-label="Try again"
        @action="loadDeliveries"
      />
      <StateBlock
        v-else-if="!deliveryItems.length"
        tone="success"
        title="No deliveries right now"
        text="Scan a parcel to add it, or check another date range."
      />
      <StateBlock
        v-else-if="!visibleItems.length"
        title="No matches"
        text="Nothing matches that search or filter."
        action-label="Clear filters"
        action-style="secondary"
        @action="search = ''; routeFilter = 'all'"
      />

      <ul v-else class="order-list">
        <li v-for="(item, index) in visibleItems" :key="item.id" class="stop-row" :class="{ 'en-route': item.onRoute }">
          <span class="stop-badge" :aria-label="`Stop ${index + 1}`">{{ index + 1 }}</span>
          <div class="order-card" :class="{ 'en-route': item.onRoute }">
            <button type="button" class="order-top" @click="viewDetail(item)">
              <span class="order-thumb">
                <img v-if="deliveryThumb(item)" :src="deliveryThumb(item)" alt="" loading="lazy" @error="onThumbError(item.id)" />
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
                  <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" />
                </svg>
              </span>
              <span class="order-main">
                <span class="order-head">
                  <span class="order-customer">{{ deliveryCustomer(item) }}</span>
                  <span class="order-amount">{{ formatUSD(deliveryAmount(item)) }}</span>
                </span>
                <span class="order-line">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z" />
                  </svg>
                  <span>{{ item.recipientNumber || '—' }}</span>
                </span>
                <span class="order-line">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
                  </svg>
                  <span>{{ item.location || item.deliveryAddress || '—' }}</span>
                </span>
                <span class="order-meta">
                  <span class="code">{{ deliveryCode(item) }}</span>
                  <span v-if="parcelSellerName(item)" class="seller">from {{ parcelSellerName(item) }}</span>
                </span>
              </span>
            </button>

            <div class="stop-meta">
              <template v-if="distanceParts(item)">
                <span class="meta-pill">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" />
                  </svg>
                  {{ distanceParts(item)!.distanceText }}
                </span>
                <span class="meta-pill">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
                  </svg>
                  {{ distanceParts(item)!.durationText }}
                </span>
              </template>
              <span v-else class="meta-pill muted" title="This parcel has no delivery location, so there's no distance yet">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" />
                </svg>
                No location
              </span>
            </div>

            <div class="route-row">
              <button
                type="button"
                class="toggle"
                :class="{ on: item.onRoute, busy: togglingIds.has(item.id) }"
                role="switch"
                :aria-checked="!!item.onRoute"
                :disabled="togglingIds.has(item.id)"
                @click="toggleEnRoute(item)"
              >
                <span class="toggle-knob"></span>
              </button>
              <span class="route-label">{{ item.onRoute ? 'En route' : 'Not started' }}</span>

              <div class="quick-actions">
                <a
                  class="icon-action map"
                  :class="{ disabled: !deliveryMapUrl(item) }"
                  :href="deliveryMapUrl(item) || undefined"
                  target="_blank"
                  rel="noopener"
                  aria-label="Directions"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 11l18-8-8 18-2-8z" />
                  </svg>
                </a>
                <a
                  class="icon-action call"
                  :class="{ disabled: !item.recipientNumber }"
                  :href="item.recipientNumber ? `tel:${item.recipientNumber}` : undefined"
                  aria-label="Call"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z" />
                  </svg>
                </a>
                <a
                  class="icon-action sms"
                  :class="{ disabled: !item.recipientNumber }"
                  :href="item.recipientNumber ? `sms:${item.recipientNumber}` : undefined"
                  aria-label="Send SMS"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1.3-3.9a8.4 8.4 0 0 1-1.2-4.4A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
                  </svg>
                </a>
              </div>
            </div>

            <div class="card-actions">
              <button type="button" class="card-btn deliver" @click="deliverTarget = item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                Deliver
              </button>
              <button type="button" class="card-btn fail" @click="failTarget = item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
                  <path d="M7 7l10 10M17 7 7 17" />
                </svg>
                Failed
              </button>
            </div>
          </div>
        </li>
      </ul>

      <p v-if="!loading && deliveryItems.length" class="footer-total">
        {{ deliveryItems.length }} parcel{{ deliveryItems.length > 1 ? 's' : '' }} · {{ formatUSD(totalAmount) }} to collect
      </p>
    </main>

    <SearchDialog
      v-if="showSearch"
      :initial-query="search"
      title="Search Deliveries"
      hint="Search name, phone, location or ID."
      placeholder="e.g. 012 345 678"
      @apply="applySearch"
      @close="showSearch = false"
    />

    <AppToast :message="toast.message.value" :type="toast.type.value" />
    <ScanQRCodeModal
      v-if="showScan"
      title="Scan to Deliver"
      hint="Align the parcel's QR code within frame to scan"
      @scan="onQrScanned"
      @close="showScan = false"
    />

    <DeliverParcelDialog
      v-if="deliverTarget"
      :parcel="deliverTarget"
      @close="deliverTarget = null"
      @delivered="onFinished(deliverTarget, 'Delivered — nice work!')"
    />
    <DeliveryFailedDialog
      v-if="failTarget"
      :parcel="failTarget"
      @close="failTarget = null"
      @failed="onFinished(failTarget, 'Marked as failed.')"
    />
  </div>
</template>

<style scoped>
.deliveries-page {
  min-height: 100%;
  background: var(--page);
}
.summary-card {
  width: calc(100% - 32px);
  max-width: 448px;
  margin: -70px auto 0;
  padding: 16px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(17, 24, 39, 0.08);
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.stat + .stat {
  border-left: 1px solid var(--divider);
}
.stat-value {
  color: var(--ink);
  font: 800 1.3rem var(--sans);
}
.stat-value.orange {
  color: var(--orange);
}
.stat-value.green {
  color: var(--green);
}
.stat-value.red {
  color: var(--red);
}
.stat-label {
  color: var(--muted);
  font: 500 0.7rem var(--sans);
}
.progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.progress-track {
  flex: 1;
  height: 7px;
  border-radius: 999px;
  background: var(--track);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2fae3a, #1f8a2c);
  transition: width 0.3s ease;
}
.progress-text {
  flex-shrink: 0;
  color: var(--muted);
  font: 600 0.72rem var(--sans);
}
.page-body {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px 16px 32px;
}
.scan-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1.5px dashed var(--green);
  border-radius: 16px;
  background: var(--green-tint);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.scan-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
}
.scan-icon svg {
  width: 22px;
  height: 22px;
}
.scan-text {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.scan-text strong {
  color: var(--green-strong);
  font: 700 0.95rem var(--sans);
}
.scan-text small {
  color: var(--muted);
  font-size: 0.75rem;
}
.scan-chevron {
  width: 18px;
  height: 18px;
  color: var(--green);
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 22px 2px 10px;
}
.section-heading h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--ink);
  font: 700 1.02rem var(--sans);
}
.count-pill {
  min-width: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--orange-soft);
  color: var(--orange);
  font: 700 0.75rem var(--sans);
  text-align: center;
}
.history-link {
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 700 0.78rem var(--sans);
  text-decoration: none;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
/* Chips scroll sideways (global .scroll-row + v-scroll-x) so the sort button stays on this row. */
.chips {
  flex: 1;
  min-width: 0;
  gap: 6px;
}
.chips button {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 7px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: #fff;
  color: var(--muted);
  font: 600 0.78rem var(--sans);
  cursor: pointer;
}
.chips button.active {
  border-color: var(--ink);
  background: var(--ink);
  color: #fff;
}
.chip-count {
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.15);
  font-size: 0.7rem;
}
.order-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* Route timeline (same look as Pickups): numbered stop in list order — nearest first
   when sorted by Nearest — joined to the next stop by a dashed line. */
.stop-row {
  position: relative;
  display: flex;
  gap: 10px;
}
.stop-row:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 34px;
  bottom: -12px;
  left: 13px;
  border-left: 2px dashed var(--border-dashed);
}
.stop-badge {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-top: 14px;
  border-radius: 50%;
  background: var(--orange);
  color: #fff;
  font: 800 0.78rem var(--sans);
  box-shadow: 0 0 0 3px var(--page);
}
.stop-row.en-route .stop-badge {
  background: var(--blue);
}
.stop-row > .order-card {
  flex: 1;
  min-width: 0;
}
.order-card {
  border: 1px solid var(--border);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(17, 24, 39, 0.05);
  overflow: hidden;
}
.order-card.en-route {
  border-color: var(--green-border);
}
.order-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 14px 14px 10px;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.order-thumb {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--input);
  color: var(--faint);
}
.order-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.order-thumb svg {
  width: 26px;
  height: 26px;
}
.order-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.order-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.order-customer {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font: 700 0.95rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-amount {
  flex-shrink: 0;
  color: var(--green-strong);
  font: 800 1rem var(--sans);
}
.order-line {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  color: var(--text-3);
  font: 500 0.8rem var(--sans);
}
.order-line svg {
  flex-shrink: 0;
  width: 13px;
  height: 13px;
  color: var(--faint);
}
.order-line span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}
.code {
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--fill);
  color: var(--text-2);
  font: 700 0.68rem ui-monospace, SFMono-Regular, Menlo, monospace;
}
.seller {
  color: var(--muted);
  font: 500 0.72rem var(--sans);
}
.route-summary {
  margin-bottom: 12px;
}
/* 📍 km / 🕒 min, same pills as Pickups */
.stop-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 14px 10px 86px; /* under the text, past the 60px thumbnail */
}
.meta-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--fill);
  color: var(--text-2);
  font: 600 0.72rem var(--sans);
}
.meta-pill svg {
  width: 12px;
  height: 12px;
  color: var(--muted);
}
.meta-pill.muted {
  background: var(--wash);
  color: var(--faint);
}
.route-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-top: 1px solid var(--divider);
}
.toggle {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 22px;
  padding: 2px;
  border: none;
  border-radius: 999px;
  background: var(--disabled);
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.toggle.on {
  background: var(--green);
}
.toggle.busy {
  opacity: 0.6;
}
.toggle-knob {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s ease;
}
.toggle.on .toggle-knob {
  transform: translateX(18px);
}
.route-label {
  color: var(--ink);
  font: 600 0.8rem var(--sans);
}
.quick-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.icon-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  text-decoration: none;
}
.icon-action svg {
  width: 18px;
  height: 18px;
}
.icon-action.map {
  background: var(--blue-soft);
  color: var(--blue);
}
.icon-action.call {
  background: var(--green-soft);
  color: var(--green-strong);
}
.icon-action.sms {
  background: var(--orange-soft);
  color: var(--orange-strong);
}
.icon-action.disabled {
  opacity: 0.35;
  pointer-events: none;
}
.card-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 0 14px 14px;
}
.card-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 42px;
  border: none;
  border-radius: 12px;
  font: 700 0.88rem var(--sans);
  cursor: pointer;
}
.card-btn svg {
  width: 16px;
  height: 16px;
}
.card-btn.deliver {
  background: var(--green);
  color: #fff;
}
.card-btn.fail {
  background: var(--red-soft);
  color: var(--red-strong);
}
.card-btn:active {
  transform: scale(0.98);
}
.footer-total {
  margin: 16px 0 0;
  color: var(--muted);
  font: 600 0.8rem var(--sans);
  text-align: center;
}
.skeleton .order-top {
  cursor: default;
}
.sk,
.order-thumb.sk {
  background: linear-gradient(90deg, var(--track) 25%, var(--page) 50%, var(--track) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}
.sk-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sk-line {
  height: 11px;
  border-radius: 6px;
}
.sk-line.short {
  width: 50%;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
