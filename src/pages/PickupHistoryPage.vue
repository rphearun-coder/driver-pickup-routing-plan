<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getOrderListByUser } from '../api/pickup-orders';
import { resolveParcelImageUrl } from '../api/parcels';
import { DATE_RANGE_OPTIONS, rangeDatesText, todayRange, type DateRangeKey } from '../api/dashboard';
import RangePicker from '../components/RangePicker.vue';
import StateBlock from '../components/StateBlock.vue';
import { useOrderDetailStore } from '../stores/orderDetail';
import type { PickupOrderItem, PickupOrderStatus } from '../types/api';

const router = useRouter();
const orderDetail = useOrderDetailStore();

const orders = ref<PickupOrderItem[]>([]);
const loading = ref(true);
const error = ref('');
const selectedRangeKey = ref<DateRangeKey>('today');
const activeFilter = ref<'all' | 'picked' | 'failed'>('all');
const brokenImageIds = ref<Set<string>>(new Set());

function viewDetail(item: PickupOrderItem): void {
  orderDetail.setOrder(item);
  router.push({ name: 'pickup-history-detail', params: { id: item.id } });
}

// Mirrors PickupPage's own PICKED_UP_STATUSES + FAILED_STATUSES — "history" is
// exactly the stops that have left that page's live "Locations To Pick Up"
// list (successfully picked up, or a failed/cancelled/deleted attempt).
const HISTORY_STATUSES = ['PICKED_UP', 'ABORT_PICK_UP', 'CANCELLED', 'DELETED'] as const;
const PICKED_UP_STATUSES = new Set(['PICKED_UP']);

const STATUS_LABELS: Partial<Record<PickupOrderStatus, string>> = {
  PICKED_UP: 'Picked Up',
  ABORT_PICK_UP: 'Aborted',
  CANCELLED: 'Cancelled',
  DELETED: 'Deleted',
};

function isPicked(item: PickupOrderItem): boolean {
  return PICKED_UP_STATUSES.has(item.status);
}

function orderName(item: PickupOrderItem): string {
  return item.partner?.fullName || item.partner?.shop?.shopName || 'Unknown';
}

function orderPhone(item: PickupOrderItem): string {
  return item.partner?.phoneNumber || '';
}

function orderInitial(item: PickupOrderItem): string {
  return orderName(item).trim().charAt(0).toUpperCase() || '?';
}

function orderImage(item: PickupOrderItem): string {
  return brokenImageIds.value.has(item.id) ? '' : resolveParcelImageUrl(item.partner?.shop?.shopImage);
}

function onImageError(id: string): void {
  brokenImageIds.value = new Set(brokenImageIds.value).add(id);
}

function parcelCount(item: PickupOrderItem): number {
  return item.parcels?.length || item.estimatedTotalParcel || 0;
}

function orderTime(item: PickupOrderItem): string {
  const value = item.pickupAt || item.createdAt;
  return value ? new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
}

function orderDateKey(item: PickupOrderItem): string {
  const value = item.pickupAt || item.createdAt;
  return value ? value.slice(0, 10) : 'Unknown date';
}

function dateLabel(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const pickedCount = computed(() => orders.value.filter(isPicked).length);
const failedCount = computed(() => orders.value.length - pickedCount.value);
const totalParcels = computed(() => orders.value.filter(isPicked).reduce((sum, item) => sum + parcelCount(item), 0));

const filteredOrders = computed(() => {
  if (activeFilter.value === 'picked') return orders.value.filter(isPicked);
  if (activeFilter.value === 'failed') return orders.value.filter((item) => !isPicked(item));
  return orders.value;
});

const groups = computed(() => {
  const byDate = new Map<string, PickupOrderItem[]>();
  for (const item of filteredOrders.value) {
    const key = orderDateKey(item);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(item);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, items]) => ({ date, items }));
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const { startAt, endAt } = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
    const data = await getOrderListByUser({ startAt, endAt, status: [...HISTORY_STATUSES] }, 50, 0);
    orders.value = data.results;
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load pickup history';
  } finally {
    loading.value = false;
  }
}

function selectRange(key: DateRangeKey): void {
  selectedRangeKey.value = key;
  load();
}

onMounted(load);
</script>

<template>
  <div class="history-page">
    <header class="page-header">
      <button type="button" class="header-btn" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <div class="header-title">
        <h1>Pickup History</h1>
        <span class="header-sub">{{ rangeDatesText(selectedRangeKey) }}</span>
      </div>
      <RangePicker class="header-range" :model-value="selectedRangeKey" @update:model-value="selectRange" />
    </header>

    <div class="history-body">
      <section class="summary">
        <div class="summary-item">
          <span class="summary-value">{{ loading ? '–' : orders.length }}</span>
          <span class="summary-label">Pickups</span>
        </div>
        <div class="summary-item">
          <span class="summary-value green">{{ loading ? '–' : pickedCount }}</span>
          <span class="summary-label">Picked up</span>
        </div>
        <div class="summary-item">
          <span class="summary-value red">{{ loading ? '–' : failedCount }}</span>
          <span class="summary-label">Failed</span>
        </div>
        <div class="summary-item">
          <span class="summary-value">{{ loading ? '–' : totalParcels }}</span>
          <span class="summary-label">Parcels</span>
        </div>
      </section>

      <div class="filters" role="tablist">
        <button type="button" role="tab" :aria-selected="activeFilter === 'all'" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">
          All
        </button>
        <button type="button" role="tab" :aria-selected="activeFilter === 'picked'" :class="{ active: activeFilter === 'picked' }" @click="activeFilter = 'picked'">
          Picked up
        </button>
        <button type="button" role="tab" :aria-selected="activeFilter === 'failed'" :class="{ active: activeFilter === 'failed' }" @click="activeFilter = 'failed'">
          Failed
        </button>
      </div>

      <ul v-if="loading" class="order-list" aria-hidden="true">
        <li v-for="n in 4" :key="n" class="order-card skeleton">
          <span class="avatar sk"></span>
          <span class="sk-lines"><span class="sk sk-line"></span><span class="sk sk-line short"></span></span>
        </li>
      </ul>

      <StateBlock
        v-else-if="error"
        tone="error"
        title="Couldn't load history"
        :text="error"
        action-label="Try again"
        @action="load"
      />
      <StateBlock v-else-if="!groups.length" title="No pickups here" text="Try another date range or filter.">
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
        </template>
      </StateBlock>
      <template v-else>
        <section v-for="group in groups" :key="group.date" class="date-group">
          <h2 class="date-heading">
            <span>{{ dateLabel(group.date) }}</span>
            <span class="date-count">{{ group.items.length }} pickup{{ group.items.length > 1 ? 's' : '' }}</span>
          </h2>
          <ul class="order-list">
            <li v-for="item in group.items" :key="item.id">
              <button type="button" class="order-card" @click="viewDetail(item)">
                <span class="avatar" :class="{ failed: !isPicked(item) }">
                  <img v-if="orderImage(item)" :src="orderImage(item)" alt="" @error="onImageError(item.id)" />
                  <template v-else>{{ orderInitial(item) }}</template>
                </span>
                <span class="order-main">
                  <span class="order-top">
                    <span class="order-name">{{ orderName(item) }}</span>
                    <span class="status-badge" :class="{ failed: !isPicked(item) }">
                      {{ STATUS_LABELS[item.status] ?? item.status }}
                    </span>
                  </span>
                  <span class="order-phone">{{ orderPhone(item) || 'No phone number' }}</span>
                  <span class="order-meta">
                    <span v-if="orderTime(item)" class="meta-item">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
                      </svg>
                      {{ orderTime(item) }}
                    </span>
                    <span v-if="parcelCount(item)" class="meta-item">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                        <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" />
                      </svg>
                      {{ parcelCount(item) }} parcel{{ parcelCount(item) > 1 ? 's' : '' }}
                    </span>
                  </span>
                </span>
                <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.history-page {
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
.header-range {
  position: relative;
  flex-shrink: 0;
}
.history-body {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px 16px 32px;
}
.summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 14px 6px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(17, 24, 39, 0.05);
}
.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.summary-item + .summary-item {
  border-left: 1px solid var(--divider);
}
.summary-value {
  color: var(--ink);
  font: 700 1.25rem var(--sans);
}
.summary-value.green {
  color: var(--green);
}
.summary-value.red {
  color: var(--red);
}
.summary-label {
  color: var(--muted);
  font: 500 0.7rem var(--sans);
}
.filters {
  display: flex;
  gap: 8px;
  margin: 16px 0 4px;
}
.filters button {
  padding: 8px 14px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: #fff;
  color: var(--muted);
  font: 600 0.8rem var(--sans);
  cursor: pointer;
  transition: all 0.15s ease;
}
.filters button.active {
  border-color: var(--ink);
  background: var(--ink);
  color: #fff;
}
.date-group {
  margin-top: 20px;
}
.date-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 4px 10px;
  color: var(--ink);
  font: 700 0.88rem var(--sans);
}
.date-count {
  color: var(--muted);
  font: 500 0.75rem var(--sans);
}
.order-list {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.date-group .order-list {
  margin-top: 0;
}
.order-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 12px 12px 12px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.04);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.15s ease;
}
.order-card:active {
  transform: scale(0.99);
  box-shadow: none;
}
.avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 700 1.1rem var(--sans);
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
.order-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.order-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.order-name {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font: 700 0.95rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-badge {
  flex-shrink: 0;
  padding: 3px 9px;
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
.order-phone {
  color: var(--muted);
  font: 500 0.82rem var(--sans);
}
.order-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 4px;
}
.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font: 500 0.74rem var(--sans);
}
.meta-item svg {
  width: 13px;
  height: 13px;
}
.chevron {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: #c3c8cf;
}
.skeleton {
  cursor: default;
}
.sk,
.avatar.sk {
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
  height: 12px;
  border-radius: 6px;
}
.sk-line.short {
  width: 55%;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
