<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getDeliveryList, parcelSellerName, resolveParcelImageUrl, type Parcel } from '../api/parcels';
import { DATE_RANGE_OPTIONS, todayRange, type DateRangeKey } from '../api/dashboard';
import DateFilterSheet from '../components/DateFilterSheet.vue';
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

function itemSeller(item: Parcel): string {
  return parcelSellerName(item) || '—';
}

function itemPhone(item: Parcel): string {
  return item.recipientNumber || '';
}

function itemPhoto(item: Parcel): string {
  return resolveParcelImageUrl(item.receiptImage || item.proofImage || item.proofOfFailed || item.parcelImage);
}

function formatReceiverBy(item: Parcel): string {
  return item.receiverBy === 'SELLER' ? 'Left with seller' : 'Driver';
}

function formatAmount(item: Parcel): string {
  const usd = `$${(item.totalCOD ?? item.codUsd ?? 0).toFixed(2)}`;
  return item.codRiel ? `${usd} and ${item.codRiel}៛` : usd;
}

function itemDateKey(item: Parcel): string {
  const value = item.updatedAt || item.createdAt;
  return value ? value.slice(0, 10) : 'Unknown date';
}

const groups = computed(() => {
  const byDate = new Map<string, Parcel[]>();
  for (const item of items.value) {
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
      <button type="button" class="back" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h1>Delivery History</h1>
      <DateFilterSheet class="header-range" :model-value="selectedRangeKey" @update:model-value="selectRange" />
    </header>

    <p v-if="loading" class="hint">Loading...</p>
    <p v-else-if="error" class="hint error">{{ error }}</p>
    <p v-else-if="!groups.length" class="hint">No delivery history yet.</p>

    <div v-else class="history-body">
      <section v-for="group in groups" :key="group.date" class="date-group">
        <h2 class="date-heading">{{ group.date }}</h2>
        <ul class="order-list">
          <li v-for="item in group.items" :key="item.id" class="order-card" role="button" tabindex="0" @click="viewDetail(item)" @keydown.enter="viewDetail(item)">
            <div class="order-thumb">
              <img v-if="itemPhoto(item)" :src="itemPhoto(item)" alt="" />
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <rect x="7" y="6" width="6" height="6" rx="1" /><path d="M7 15h4M7 18h7" />
              </svg>
            </div>
            <div class="order-main">
              <div class="order-top">
                <span class="order-name">{{ itemSeller(item) }}</span>
                <span class="order-status" :class="{ failed: !SUCCESS_STATUSES.has(item.status) }">{{ item.status }}</span>
              </div>
              <div class="order-row">
                <span class="order-label">Recipient location</span>
                <span class="order-value">{{ item.location || '—' }}</span>
              </div>
              <div class="order-row">
                <span class="order-label">Recipient phone</span>
                <span class="order-value">{{ itemPhone(item) || '—' }}</span>
              </div>
              <div class="order-row">
                <span class="order-label">{{ SUCCESS_STATUSES.has(item.status) ? 'Collected by' : 'Reason' }}</span>
                <span v-if="SUCCESS_STATUSES.has(item.status)" class="order-amount">{{ formatReceiverBy(item) }} · {{ formatAmount(item) }}</span>
                <span v-else class="order-value">{{ item.reason || '—' }}</span>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <button v-if="hasMore" type="button" class="load-more" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? 'Loading...' : 'Load more' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.history-page {
  padding-bottom: 24px;
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
  flex: 1;
  min-width: 0;
  margin: 0;
  font: 700 1.15rem var(--heading);
  color: var(--ink);
}
.header-range {
  flex-shrink: 0;
}
.hint {
  padding: 40px 20px;
  text-align: center;
  color: var(--muted);
}
.hint.error {
  color: #e33;
}
.history-body {
  padding: 32px 16px 40px;
}
.date-group {
  margin-bottom: 20px;
}
.date-heading {
  margin: 0 0 8px;
  color: var(--muted);
  font: 700 0.78rem var(--sans);
}
.order-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.order-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--wash);
  cursor: pointer;
}
.order-thumb {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--line);
  color: var(--muted);
}
.order-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.order-thumb svg {
  width: 28px;
  height: 28px;
}
.order-main {
  flex: 1;
  min-width: 0;
}
.order-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.order-name {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font: 700 0.92rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-status {
  flex-shrink: 0;
  color: var(--green);
  font: 700 0.72rem var(--sans);
  letter-spacing: 0.02em;
}
.order-status.failed {
  color: #e0433b;
}
.order-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 3px;
  font-size: 0.78rem;
}
.order-label {
  flex-shrink: 0;
  color: var(--muted);
}
.order-value {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-weight: 600;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-amount {
  flex-shrink: 0;
  color: var(--green);
  font-weight: 700;
  text-align: right;
}
.load-more {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 13px;
  border: 1px solid var(--line);
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
</style>
