<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getDeliveryList, parcelSellerName, resolveParcelImageUrl, type Parcel } from '../api/parcels';
import { DATE_RANGE_OPTIONS, rangeDatesText, todayRange, type DateRangeKey } from '../api/dashboard';
import RangePicker from '../components/RangePicker.vue';
import StateBlock from '../components/StateBlock.vue';
import { useOrderDetailStore } from '../stores/orderDetail';

const router = useRouter();
const orderDetail = useOrderDetailStore();

const PAGE_SIZE = 50;

const items = ref<Parcel[]>([]);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref('');
const total = ref(0);
const selectedRangeKey = ref<DateRangeKey>('today');
const activeFilter = ref<'all' | 'success' | 'failed'>('all');
const brokenThumbIds = ref<Set<string>>(new Set());

const hasMore = computed(() => items.value.length < total.value);

function viewDetail(item: Parcel): void {
  orderDetail.setParcel(item);
  router.push({ name: 'parcel-detail', params: { id: item.id } });
}

// "History" = delivery attempts that have left the live ON_DELIVERY list — a
// finished SUCCESS or FAILED outcome (see parcel.service.ts's finishDelivery /
// deliveryFailed, both of which set deliveredAt, which these are grouped by).
const HISTORY_STATUSES = ['SUCCESS', 'FAILED'] as const;
const SUCCESS_STATUSES = new Set(['SUCCESS']);

function isSuccess(item: Parcel): boolean {
  return SUCCESS_STATUSES.has(item.status);
}

function itemSeller(item: Parcel): string {
  return parcelSellerName(item) || '—';
}

function itemPhoto(item: Parcel): string {
  if (brokenThumbIds.value.has(item.id)) return '';
  return resolveParcelImageUrl(item.receiptImage || item.proofImage || item.proofOfFailed || item.parcelImage);
}

function onThumbError(id: string): void {
  brokenThumbIds.value = new Set(brokenThumbIds.value).add(id);
}

function formatReceiverBy(item: Parcel): string {
  return item.receiverBy === 'SELLER' ? 'Left with seller' : 'By driver';
}

function formatAmount(item: Parcel): string {
  const usd = `$${(item.totalCOD ?? item.codUsd ?? 0).toFixed(2)}`;
  return item.codRiel ? `${usd} + ${Math.round(item.codRiel).toLocaleString()}៛` : usd;
}

function itemTime(item: Parcel): string {
  const value = item.updatedAt || item.createdAt;
  return value ? new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
}

function itemDateKey(item: Parcel): string {
  const value = item.updatedAt || item.createdAt;
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

// Summary covers what's loaded so far — "+" marks that more pages exist.
const successCount = computed(() => items.value.filter(isSuccess).length);
const failedCount = computed(() => items.value.length - successCount.value);
const codUsdTotal = computed(() =>
  items.value.filter(isSuccess).reduce((sum, item) => sum + (item.totalCOD ?? item.codUsd ?? 0), 0),
);
const codKhrTotal = computed(() => items.value.filter(isSuccess).reduce((sum, item) => sum + (item.codRiel ?? 0), 0));
const moreSuffix = computed(() => (hasMore.value ? '+' : ''));

const filteredItems = computed(() => {
  if (activeFilter.value === 'success') return items.value.filter(isSuccess);
  if (activeFilter.value === 'failed') return items.value.filter((item) => !isSuccess(item));
  return items.value;
});

const groups = computed(() => {
  const byDate = new Map<string, Parcel[]>();
  for (const item of filteredItems.value) {
    const key = itemDateKey(item);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(item);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, dateItems]) => ({ date, items: dateItems }));
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const { startAt, endAt } = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
    const data = await getDeliveryList({ status: [...HISTORY_STATUSES], startAt, endAt }, PAGE_SIZE, 0);
    items.value = data.results;
    total.value = data.metadata.total;
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load delivery history';
  } finally {
    loading.value = false;
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const { startAt, endAt } = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
    const data = await getDeliveryList({ status: [...HISTORY_STATUSES], startAt, endAt }, PAGE_SIZE, items.value.length);
    items.value = [...items.value, ...data.results];
    total.value = data.metadata.total;
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load more history';
  } finally {
    loadingMore.value = false;
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
        <h1>Delivery History</h1>
        <span class="header-sub">{{ rangeDatesText(selectedRangeKey) }}</span>
      </div>
      <RangePicker class="header-range" :model-value="selectedRangeKey" @update:model-value="selectRange" />
    </header>

    <div class="history-body">
      <section class="summary">
        <div class="summary-top">
          <div>
            <p class="summary-label">COD collected</p>
            <p class="summary-amount">
              {{ loading ? '–' : `$${codUsdTotal.toFixed(2)}` }}<span v-if="!loading && codKhrTotal" class="summary-khr">
                + {{ Math.round(codKhrTotal).toLocaleString() }}៛</span
              >
            </p>
          </div>
          <span class="summary-icon" aria-hidden="true">$</span>
        </div>
        <div class="summary-stats">
          <div class="stat">
            <span class="stat-value">{{ loading ? '–' : `${total}` }}</span>
            <span class="stat-label">Deliveries</span>
          </div>
          <div class="stat">
            <span class="stat-value green">{{ loading ? '–' : `${successCount}${moreSuffix}` }}</span>
            <span class="stat-label">Delivered</span>
          </div>
          <div class="stat">
            <span class="stat-value red">{{ loading ? '–' : `${failedCount}${moreSuffix}` }}</span>
            <span class="stat-label">Failed</span>
          </div>
        </div>
      </section>

      <div class="filters" role="tablist">
        <button type="button" role="tab" :aria-selected="activeFilter === 'all'" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">
          All
        </button>
        <button type="button" role="tab" :aria-selected="activeFilter === 'success'" :class="{ active: activeFilter === 'success' }" @click="activeFilter = 'success'">
          Delivered
        </button>
        <button type="button" role="tab" :aria-selected="activeFilter === 'failed'" :class="{ active: activeFilter === 'failed' }" @click="activeFilter = 'failed'">
          Failed
        </button>
      </div>

      <ul v-if="loading" class="order-list" aria-hidden="true">
        <li v-for="n in 4" :key="n" class="order-card skeleton">
          <span class="thumb sk"></span>
          <span class="sk-lines"><span class="sk sk-line"></span><span class="sk sk-line"></span><span class="sk sk-line short"></span></span>
        </li>
      </ul>

      <StateBlock
        v-else-if="error && !items.length"
        tone="error"
        title="Couldn't load history"
        :text="error"
        action-label="Try again"
        @action="load"
      />
      <StateBlock v-else-if="!groups.length" title="No deliveries here" text="Try another date range or filter.">
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></svg>
        </template>
      </StateBlock>
      <template v-else>
        <section v-for="group in groups" :key="group.date" class="date-group">
          <h2 class="date-heading">
            <span>{{ dateLabel(group.date) }}</span>
            <span class="date-count">{{ group.items.length }} parcel{{ group.items.length > 1 ? 's' : '' }}</span>
          </h2>
          <ul class="order-list">
            <li v-for="item in group.items" :key="item.id">
              <button type="button" class="order-card" :class="{ failed: !isSuccess(item) }" @click="viewDetail(item)">
                <span class="thumb">
                  <img v-if="itemPhoto(item)" :src="itemPhoto(item)" alt="" loading="lazy" @error="onThumbError(item.id)" />
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
                    <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" />
                  </svg>
                  <span class="thumb-badge" :class="{ failed: !isSuccess(item) }" aria-hidden="true">
                    <svg v-if="isSuccess(item)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
                      <path d="M7 7l10 10M17 7 7 17" />
                    </svg>
                  </span>
                </span>

                <span class="order-main">
                  <span class="order-top">
                    <span class="order-name">{{ itemSeller(item) }}</span>
                    <span v-if="itemTime(item)" class="order-time">{{ itemTime(item) }}</span>
                  </span>
                  <span class="order-line">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
                    </svg>
                    <span>{{ item.location || '—' }}</span>
                  </span>
                  <span class="order-line">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z" />
                    </svg>
                    <span>{{ item.recipientNumber || '—' }}</span>
                  </span>
                  <span class="order-bottom">
                    <template v-if="isSuccess(item)">
                      <span class="amount">{{ formatAmount(item) }}</span>
                      <span class="chip">{{ formatReceiverBy(item) }}</span>
                    </template>
                    <span v-else class="reason">{{ item.reason || 'Delivery failed' }}</span>
                  </span>
                </span>

                <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </li>
          </ul>
        </section>

        <p v-if="error" class="inline-error">{{ error }}</p>
        <button v-if="hasMore" type="button" class="load-more" :disabled="loadingMore" @click="loadMore">
          <span v-if="loadingMore" class="spinner" aria-hidden="true"></span>
          {{ loadingMore ? 'Loading…' : `Load more (${total - items.length} left)` }}
        </button>
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
  padding: 16px;
  border-radius: 18px;
  background: linear-gradient(135deg, #1f8a2c, #2fae3a);
  color: #fff;
  box-shadow: 0 8px 22px rgba(42, 154, 46, 0.28);
}
.summary-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.summary-label {
  margin: 0;
  opacity: 0.85;
  font: 600 0.75rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.summary-amount {
  margin: 4px 0 0;
  font: 800 1.7rem var(--sans);
}
.summary-khr {
  font: 600 0.95rem var(--sans);
  opacity: 0.9;
}
.summary-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  font: 800 1.2rem var(--sans);
}
.summary-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-top: 14px;
  padding: 10px 4px;
  border-radius: 12px;
  background: #fff;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
.stat + .stat {
  border-left: 1px solid var(--divider);
}
.stat-value {
  color: var(--ink);
  font: 700 1.15rem var(--sans);
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
  padding: 12px;
  border: 1px solid var(--border);
  border-left: 4px solid var(--green);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.04);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: transform 0.1s ease;
}
.order-card.failed {
  border-left-color: var(--red);
}
.order-card:active {
  transform: scale(0.99);
}
.thumb {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 12px;
  background: var(--input);
  color: var(--faint);
}
.thumb img {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  object-fit: cover;
}
.thumb > svg {
  width: 26px;
  height: 26px;
}
.thumb-badge {
  position: absolute;
  right: -5px;
  bottom: -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
}
.thumb-badge.failed {
  background: var(--red);
}
.thumb-badge svg {
  width: 10px;
  height: 10px;
}
.order-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.order-top {
  display: flex;
  align-items: baseline;
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
.order-time {
  flex-shrink: 0;
  color: var(--muted);
  font: 500 0.72rem var(--sans);
}
.order-line {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  color: var(--text-3);
  font: 500 0.78rem var(--sans);
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
.order-bottom {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}
.amount {
  color: var(--green-strong);
  font: 800 0.9rem var(--sans);
}
.chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--fill);
  color: var(--text-3);
  font: 600 0.68rem var(--sans);
}
.reason {
  max-width: 100%;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--red-soft);
  color: var(--red-strong);
  font: 600 0.7rem var(--sans);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chevron {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: #c3c8cf;
}
.skeleton {
  border-left-color: var(--border);
  cursor: default;
}
.sk,
.thumb.sk {
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
.inline-error {
  margin: 16px 0 0;
  color: var(--red-strong);
  font: 600 0.8rem var(--sans);
  text-align: center;
}
.load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 16px;
  padding: 13px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: #fff;
  color: var(--ink);
  font: 700 0.85rem var(--sans);
  cursor: pointer;
}
.load-more:disabled {
  color: var(--muted);
  cursor: not-allowed;
}
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--line);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
