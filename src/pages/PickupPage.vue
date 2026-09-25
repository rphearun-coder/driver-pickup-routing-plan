<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppToast from '../components/AppToast.vue';
import BrandHeader from '../components/BrandHeader.vue';
import HeaderIconButton from '../components/HeaderIconButton.vue';
import SearchChip from '../components/SearchChip.vue';
import SearchDialog from '../components/SearchDialog.vue';
import StateBlock from '../components/StateBlock.vue';
import SortToggle from '../components/SortToggle.vue';
import RangePicker from '../components/RangePicker.vue';
import CopyButton from '../components/CopyButton.vue';
import { getOrderListByUser, updateOnRoute } from '../api/pickup-orders';
import { resolveParcelImageUrl } from '../api/parcels';
import { DATE_RANGE_OPTIONS, todayRange, type DateRangeKey } from '../api/dashboard';
import { useOrderDetailStore } from '../stores/orderDetail';
import { useAuth } from '../composables/useAuth';
import { useDriverLocations } from '../composables/useDriverLocations';
import { useMobileInteraction } from '../composables/useMobileInteraction';
import { useToast } from '../composables/useToast';
import { useRouteSort } from '../composables/useRouteSort';
import { formatDistanceParts, toLatLng, type DistanceParts } from '../utils/geo';
import RouteSummaryCard from '../components/RouteSummaryCard.vue';
import { normalizePhone } from '../utils/inputRules';
import { searchText, shortCode } from '../utils/codes';
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
const rangePicker = ref<InstanceType<typeof RangePicker> | null>(null);
const brokenAvatarIds = ref<Set<string>>(new Set());

const PICKED_UP_STATUSES = new Set(['PICKED_UP']);
const FAILED_STATUSES = new Set(['ABORT_PICK_UP', 'CANCELLED', 'DELETED']);
// updateOnRoute only accepts these (see order.service.ts updateOnRoute).
const ROUTABLE_STATUSES = new Set(['IN_PROGRESS', 'ON_ROUTE']);
// One driver's pickups for the selected range fit comfortably in one page.
const PICKUP_LIST_LIMIT = 200;

const stops = computed(() => orderData.value?.results ?? []);

function isPicked(item: PickupOrderItem): boolean {
  return PICKED_UP_STATUSES.has(item.status);
}
function isFailed(item: PickupOrderItem): boolean {
  return FAILED_STATUSES.has(item.status);
}
function isTodo(item: PickupOrderItem): boolean {
  return !isPicked(item) && !isFailed(item);
}

const lastDriverLocation = computed(() => driverLocations.get(activeDriverId.value));
const toast = useToast();
const showMessage = toast.show;

// No backend search filter exists for this list yet, so this filters the
// already-loaded page of stops client-side — by order no., shop name or phone.
// Kept separate from `stops` so the summary card's counts stay based on the
// full day's totals regardless of an active search.
// "To pick up" lists only stops still to pick up — picked-up and
// failed ones live in Pickup History (they still count in the summary card).
const todoStops = computed(() => stops.value.filter(isTodo));

// Newest / Nearest (shared with Deliveries): the Order Service sorts (routeSort), the list
// below keeps its order. Toggling reloads.
const routeSort = useRouteSort(() => loadPickups());
const sortBy = routeSort.sortBy;

// Order no. = the shown #XXXXXX (matched against the full id, "#" optional); a parcel's
// tracking no. also finds its order.
const visibleStops = computed(() => {
  const query = searchText(orderNoQuery.value);
  const phoneQuery = /^[\d\s+()-]+$/.test(query) ? normalizePhone(query) : '';
  return todoStops.value.filter((item) => {
    if (!query) return true;
    if (phoneQuery.length >= 3 && normalizePhone(stopPhone(item)).includes(phoneQuery)) return true;
    return [
      item.id,
      stopName(item),
      item.partner?.shop?.shopName,
      item.pickupAddress,
      ...(item.parcels ?? []).map((parcel) => parcel.parcelUID),
    ]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query));
  });
});

function openSearch(): void {
  rangePicker.value?.close();
  showSearch.value = true;
}

function applySearch(query: string): void {
  orderNoQuery.value = query;
  showSearch.value = false;
}

function clearSearch(): void {
  orderNoQuery.value = '';
  showSearch.value = false;
}

// Fires on every scroll / touchmove (App.vue): close the dialog but keep an applied
// search — clearing it here wiped the results as soon as the driver scrolled them.
useMobileInteraction(() => {
  showSearch.value = false;
  toast.clear();
});
const summary = computed(() => {
  const results = stops.value;
  return {
    locationsToPickUp: orderData.value?.metadata.total ?? results.length,
    pickedUp: results.filter(isPicked).length,
    notYetPickedUp: results.filter(isTodo).length,
    failed: results.filter(isFailed).length,
  };
});

const progress = computed(() => {
  const total = stops.value.length;
  return total ? Math.round(((summary.value.pickedUp + summary.value.failed) / total) * 100) : 0;
});

const totalParcels = computed(() => stops.value.reduce((sum, item) => sum + (item.estimatedTotalParcel ?? 0), 0));

const routeSummary = computed(() => {
  const extra = orderData.value?.extraData;
  return formatDistanceParts(
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
  if (brokenAvatarIds.value.has(item.id)) return '';
  return resolveParcelImageUrl(item.partner?.shop?.shopImage);
}

function onAvatarError(id: string): void {
  brokenAvatarIds.value = new Set(brokenAvatarIds.value).add(id);
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
  // 0,0 is the "no location" default, not a real point.
  if (toLatLng(item.pickupLatitude, item.pickupLongitude)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${item.pickupLatitude},${item.pickupLongitude}`;
  }
  if (item.pickupAddress) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.pickupAddress)}`;
  return '';
}

function canRoute(item: PickupOrderItem): boolean {
  return ROUTABLE_STATUSES.has(item.status);
}

// updateOnRoute flips onRoute and moves the order between IN_PROGRESS and
// ON_ROUTE server-side (and notifies the shop when going on route), so the
// status badge is flipped with it — optimistically, reverted on failure.
async function toggleDeparted(item: PickupOrderItem): Promise<void> {
  if (departingIds.value.has(item.id) || !canRoute(item)) return;
  const previousOnRoute = item.onRoute;
  const previousStatus = item.status;
  item.onRoute = !item.onRoute;
  item.status = item.onRoute ? 'ON_ROUTE' : 'IN_PROGRESS';
  departingIds.value = new Set(departingIds.value).add(item.id);
  try {
    await updateOnRoute(item.id);
    showMessage(item.onRoute ? `On the way to ${stopName(item)} — the shop was notified.` : 'Marked as not on route.');
  } catch (err: any) {
    item.onRoute = previousOnRoute;
    item.status = previousStatus;
    showMessage(err.message ?? "Couldn't update On Route.", 'error');
  } finally {
    const rest = new Set(departingIds.value);
    rest.delete(item.id);
    departingIds.value = rest;
  }
}

async function loadPickups(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const range = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
    // The whole range, not the API's default page of 20 — the list, the summary counts
    // and the (client-side) search all work from what's loaded here.
    orderData.value = await getOrderListByUser({ ...range, ...routeSort.params() }, PICKUP_LIST_LIMIT);
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
    <BrandHeader>
      <RangePicker ref="rangePicker" :model-value="selectedRangeKey" @update:model-value="selectRange" />
      <HeaderIconButton label="Search pickups" :active="!!orderNoQuery" @click="openSearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
      </HeaderIconButton>
    </BrandHeader>
    <section class="summary-card">
      <div class="summary-grid">
        <div class="stat">
          <span class="stat-value">{{ summary.locationsToPickUp }}</span>
          <span class="stat-label">Locations</span>
        </div>
        <div class="stat">
          <span class="stat-value orange">{{ summary.notYetPickedUp }}</span>
          <span class="stat-label">To pick up</span>
        </div>
        <div class="stat">
          <span class="stat-value green">{{ summary.pickedUp }}</span>
          <span class="stat-label">Picked up</span>
        </div>
        <div class="stat">
          <span class="stat-value red">{{ summary.failed }}</span>
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
        :distance-text="routeSummary.distanceText"
        :duration-text="routeSummary.durationText"
        :count="totalParcels"
        :last-updated-at="lastDriverLocation?.lastUpdatedAt"
      />

      <div class="section-heading">
        <h2>
          To pick up
          <span class="count-pill">{{ todoStops.length }}</span>
        </h2>
        <div class="heading-actions">
          <SortToggle :mode="sortBy" @toggle="routeSort.toggle" />
          <a href="#" class="history-link" @click.prevent="router.push({ name: 'pickup-history' })">History</a>
        </div>
      </div>

      <SearchChip v-if="orderNoQuery" :query="orderNoQuery" :count="visibleStops.length" @clear="clearSearch" />
      <ul v-if="loading" class="stop-list" aria-hidden="true">
        <li v-for="n in 3" :key="n" class="stop-card skeleton">
          <span class="stop-badge sk"></span>
          <div class="stop-body">
            <div class="stop-top">
              <span class="stop-avatar sk"></span>
              <span class="sk-lines"><span class="sk sk-line"></span><span class="sk sk-line short"></span></span>
            </div>
          </div>
        </li>
      </ul>

      <StateBlock
        v-else-if="error"
        tone="error"
        title="Couldn't load pickups"
        :text="error"
        action-label="Try again"
        @action="loadPickups"
      />
      <StateBlock
        v-else-if="!todoStops.length && stops.length"
        tone="success"
        title="All pickups done"
        text="Picked-up and failed stops are in Pickup History."
        action-label="View history"
        action-style="secondary"
        @action="router.push({ name: 'pickup-history' })"
      />
      <StateBlock
        v-else-if="!todoStops.length"
        tone="success"
        title="No pickups right now"
        text="New pickups assigned to you will show up here."
      />
      <StateBlock
        v-else-if="!visibleStops.length"
        title="No matches"
        text="No stop to pick up matches that search."
        action-label="Clear search"
        action-style="secondary"
        @action="clearSearch"
      />
      <ul v-else class="stop-list">
        <li
          v-for="(stop, index) in visibleStops"
          :key="stop.id"
          class="stop-card"
          :class="{ done: isPicked(stop), failed: isFailed(stop), 'on-route': stop.onRoute && isTodo(stop) }"
        >
          <div class="stop-badge">
            <svg v-if="isPicked(stop)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            <template v-else>{{ index + 1 }}</template>
          </div>

          <div class="stop-body">
            <button type="button" class="stop-top" @click="viewDetail(stop)">
              <span class="stop-avatar">
                <img v-if="stopAvatarUrl(stop)" :src="stopAvatarUrl(stop)" alt="" @error="onAvatarError(stop.id)" />
                <span v-else class="stop-avatar-fallback">{{ stopName(stop).charAt(0).toUpperCase() }}</span>
              </span>
              <span class="stop-identity">
                <span class="stop-head">
                  <span class="stop-name">{{ stopName(stop) }}</span>
                  <span class="status-badge" :class="statusClass(stop)">{{ statusLabel(stop) }}</span>
                </span>
                <span class="stop-phone">{{ stopPhone(stop) || 'No phone number' }}</span>
                <span v-if="stop.pickupAddress" class="stop-address">{{ stop.pickupAddress }}</span>
              </span>
            </button>

            <div class="stop-meta">
              <CopyButton
                v-slot="{ copied }"
                class="meta-pill order-no"
                :text="shortCode(stop.id)"
                :aria-label="`Copy order number ${shortCode(stop.id)}`"
              >
                <svg v-if="copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
                </svg>
                {{ copied ? 'Copied' : shortCode(stop.id) }}
              </CopyButton>
              <span class="meta-pill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" />
                </svg>
                {{ stopDistanceParts(stop).distanceText }}
              </span>
              <span class="meta-pill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
                </svg>
                {{ stopDistanceParts(stop).durationText }}
              </span>
              <span class="meta-pill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                  <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" />
                </svg>
                {{ stop.estimatedTotalParcel ?? 0 }} parcel{{ stop.estimatedTotalParcel === 1 ? '' : 's' }}
              </span>
              <span v-if="pickupTimeText(stop)" class="meta-pill time">
                {{ isPicked(stop) ? 'Picked' : 'Pickup' }} {{ pickupTimeText(stop) }}
              </span>
            </div>

            <div class="stop-actions">
              <div v-if="canRoute(stop)" class="route-toggle">
                <button
                  type="button"
                  class="toggle"
                  :class="{ on: stop.onRoute, busy: departingIds.has(stop.id) }"
                  role="switch"
                  :aria-checked="!!stop.onRoute"
                  :disabled="departingIds.has(stop.id)"
                  aria-label="On route"
                  @click="toggleDeparted(stop)"
                >
                  <span class="toggle-knob"></span>
                </button>
                <span class="route-label">{{ stop.onRoute ? 'On route' : 'Not started' }}</span>
              </div>
              <span v-else class="route-label muted">{{ isPicked(stop) ? 'Completed' : statusLabel(stop) }}</span>

              <div class="quick-actions">
                <a
                  class="icon-action map"
                  :class="{ disabled: !mapUrl(stop) }"
                  :href="mapUrl(stop) || undefined"
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
                  :class="{ disabled: !stopPhone(stop) }"
                  :href="stopPhone(stop) ? `tel:${stopPhone(stop)}` : undefined"
                  aria-label="Call shop"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z" />
                  </svg>
                </a>
                <a
                  class="icon-action sms"
                  :class="{ disabled: !stopPhone(stop) }"
                  :href="stopPhone(stop) ? `sms:${stopPhone(stop)}` : undefined"
                  aria-label="Message shop"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1.3-3.9a8.4 8.4 0 0 1-1.2-4.4A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
                  </svg>
                </a>
                <button type="button" class="open-btn" @click="viewDetail(stop)">
                  {{ isTodo(stop) ? 'Pick up' : 'View' }}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </main>

    <SearchDialog
      v-if="showSearch"
      :initial-query="orderNoQuery"
      title="Search Pickup"
      hint="Search order no., shop name, phone or parcel ID."
      placeholder="e.g. Khmerness or 010 101 010"
      @apply="applySearch"
      @close="showSearch = false"
    />

    <AppToast :message="toast.message.value" :type="toast.type.value" />  </div>
</template>

<style scoped>
.pickup-page {
  min-height: 100%;
  background: var(--page);
}
.summary-card {
  width: calc(100% - 32px);
  max-width: 448px;
  margin: -64px auto 0;
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
  padding: 14px 16px 32px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 20px 2px 10px;
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
.heading-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.history-link {
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 700 0.78rem var(--sans);
  text-decoration: none;
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
  gap: 10px;
}
.stop-card:not(:last-child)::before {
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
.stop-badge svg {
  width: 14px;
  height: 14px;
}
.stop-card.on-route .stop-badge {
  background: var(--blue);
}
.stop-card.done .stop-badge {
  background: var(--green);
}
.stop-card.failed .stop-badge {
  background: var(--red);
}
.stop-body {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(17, 24, 39, 0.05);
  overflow: hidden;
}
.stop-card.on-route .stop-body {
  border-color: var(--blue-border);
}
.stop-card.done .stop-body,
.stop-card.failed .stop-body {
  opacity: 0.8;
}
.stop-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 14px 14px 8px;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.stop-avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--green-soft);
}
.stop-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.stop-avatar-fallback {
  color: var(--green-strong);
  font: 800 1.15rem var(--sans);
}
.stop-identity {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.stop-name {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font: 700 0.95rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stop-phone {
  color: var(--text-3);
  font: 500 0.8rem var(--sans);
}
.stop-address {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-badge {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--fill);
  color: var(--text-3);
  font: 700 0.64rem var(--sans);
  white-space: nowrap;
}
.status-badge.in-progress {
  background: var(--orange-soft);
  color: var(--orange-strong);
}
.status-badge.on-route {
  background: var(--blue-soft);
  color: var(--blue-strong);
}
.status-badge.picked-up {
  background: var(--green-soft);
  color: var(--green-strong);
}
.status-badge.abort-pick-up,
.status-badge.cancelled,
.status-badge.deleted {
  background: var(--red-soft);
  color: var(--red-strong);
}
.stop-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 14px 12px 74px;
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
/* The order no. pill is a CopyButton: tap to copy. */
.meta-pill.order-no {
  border: none;
  color: var(--ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
}
.meta-pill.order-no.done {
  background: var(--green-soft);
  color: var(--green-strong);
}
.meta-pill svg {
  width: 12px;
  height: 12px;
  color: var(--muted);
}
.meta-pill.time {
  background: var(--orange-soft);
  color: var(--orange-strong);
}
.stop-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 8px 14px;
  border-top: 1px solid var(--divider);
}
/* Label under the switch: beside it, the row has no room on 360–390px phones. */
.route-toggle {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
}
.route-toggle .route-label {
  font-size: 0.66rem;
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
  background: var(--blue);
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
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font: 600 0.78rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.route-label.muted {
  color: var(--muted);
}
.quick-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.icon-action {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  text-decoration: none;
}
.icon-action svg {
  width: 17px;
  height: 17px;
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
.open-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 34px;
  padding: 0 8px 0 12px;
  white-space: nowrap;
  border: none;
  border-radius: 10px;
  background: var(--green);
  color: #fff;
  font: 700 0.78rem var(--sans);
  cursor: pointer;
}
.stop-card.done .open-btn,
.stop-card.failed .open-btn {
  background: var(--fill);
  color: var(--ink);
}
.open-btn svg {
  width: 14px;
  height: 14px;
}
.skeleton .stop-badge {
  background: var(--track);
  box-shadow: none;
}
.sk,
.stop-avatar.sk,
.stop-badge.sk {
  background: linear-gradient(90deg, var(--track) 25%, var(--page) 50%, var(--track) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}
.sk-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0 10px;
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
