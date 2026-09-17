<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getOrderListByUser } from '../api/pickup-orders';
import { useOrderDetailStore } from '../stores/orderDetail';
import type { PickupOrderItem } from '../types/api';

const router = useRouter();
const orderDetail = useOrderDetailStore();

const orders = ref<PickupOrderItem[]>([]);
const loading = ref(true);
const error = ref('');

function viewDetail(item: PickupOrderItem): void {
  orderDetail.setOrder(item);
  router.push({ name: 'order-detail', params: { id: item.id } });
}

// Mirrors PickupPage's own PICKED_UP_STATUSES + FAILED_STATUSES — "history" is
// exactly the stops that have left that page's live "Locations To Pick Up"
// list (successfully picked up, or a failed/cancelled/deleted attempt).
const HISTORY_STATUSES = ['PICKED_UP', 'ABORT_PICK_UP', 'CANCELLED', 'DELETED'] as const;
const PICKED_UP_STATUSES = new Set(['PICKED_UP']);

function orderName(item: PickupOrderItem): string {
  return item.partner?.fullName || item.partner?.shop?.shopName || 'Unknown';
}

function orderPhone(item: PickupOrderItem): string {
  return item.partner?.phoneNumber || '';
}

function orderDateKey(item: PickupOrderItem): string {
  const value = item.pickupAt || item.createdAt;
  return value ? value.slice(0, 10) : 'Unknown date';
}

const groups = computed(() => {
  const byDate = new Map<string, PickupOrderItem[]>();
  for (const item of orders.value) {
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
    const data = await getOrderListByUser({ status: [...HISTORY_STATUSES] }, 50, 0);
    orders.value = data.results;
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load pickup history';
  } finally {
    loading.value = false;
  }
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
      <h1>Pickup History</h1>
    </header>

    <p v-if="loading" class="hint">Loading...</p>
    <p v-else-if="error" class="hint error">{{ error }}</p>
    <p v-else-if="!groups.length" class="hint">No pickup history yet.</p>

    <div v-else class="history-body">
      <section v-for="group in groups" :key="group.date" class="date-group">
        <h2 class="date-heading">{{ group.date }}</h2>
        <ul class="order-list">
          <li v-for="item in group.items" :key="item.id" class="order-card" role="button" tabindex="0" @click="viewDetail(item)" @keydown.enter="viewDetail(item)">
            <div class="order-top">
              <span class="order-name">{{ orderName(item) }}</span>
              <span class="order-phone">{{ orderPhone(item) }}</span>
            </div>
            <div class="order-bottom">
              <span class="order-address">{{ item.pickupAddress || '—' }}</span>
              <span class="order-status" :class="{ failed: !PICKED_UP_STATUSES.has(item.status) }">{{ item.status }}</span>
            </div>
          </li>
        </ul>
      </section>
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
  margin: 0;
  font: 700 1.15rem var(--heading);
  color: var(--ink);
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
  padding: 14px;
  border-radius: 14px;
  background: var(--wash);
  cursor: pointer;
}
.order-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.order-name {
  font: 700 0.92rem var(--sans);
  color: var(--ink);
}
.order-phone {
  flex-shrink: 0;
  color: var(--ink);
  font-size: 0.85rem;
}
.order-bottom {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
}
.order-address {
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 0.78rem;
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
</style>
