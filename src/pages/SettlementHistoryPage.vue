<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getMyDriverCodSettlements, type CodSettlementHistoryItem } from '../api/cod-settlement';
import { DATE_RANGE_OPTIONS, todayRange, type DateRangeKey } from '../api/dashboard';
import DateFilterSheet from '../components/DateFilterSheet.vue';

const router = useRouter();

const settlements = ref<CodSettlementHistoryItem[]>([]);
const loading = ref(true);
const error = ref('');
const selectedRangeKey = ref<DateRangeKey>('today');

function formatUSD(amount?: number): string {
  return `$${(amount ?? 0).toFixed(2)}`;
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const { startAt, endAt } = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
    const data = await getMyDriverCodSettlements(startAt, endAt, 50, 0);
    settlements.value = data.results;
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load settlement history';
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
      <button type="button" class="back" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h1>Settlement History</h1>
      <DateFilterSheet class="header-range" :model-value="selectedRangeKey" @update:model-value="selectRange" />
    </header>

    <p v-if="loading" class="hint">Loading...</p>
    <p v-else-if="error" class="hint error">{{ error }}</p>
    <p v-else-if="!settlements.length" class="hint">No settlement history yet.</p>

    <div v-else class="history-body">
      <ul class="settlement-list">
        <li v-for="item in settlements" :key="item.id" class="settlement-card">
          <div class="settlement-top">
            <span class="settlement-ref">{{ item.refNo }}</span>
            <span class="settlement-status" :class="item.status.toLowerCase()">{{ item.status }}</span>
          </div>
          <p class="settlement-range">{{ formatDate(item.startAt) }} – {{ formatDate(item.endAt) }}</p>
          <div class="settlement-amounts">
            <div class="amount-col">
              <span class="amount-label">Requested</span>
              <span class="amount-value">{{ formatUSD(item.requestedAmount) }}</span>
            </div>
            <div class="amount-col">
              <span class="amount-label">Settled</span>
              <span class="amount-value">{{ formatUSD(item.settledAmount ?? item.totalCodUsd) }}</span>
            </div>
          </div>
          <p v-if="item.status === 'REJECTED' && item.rejectReason" class="reject-reason">
            {{ item.rejectReason }}
          </p>
        </li>
      </ul>
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
  max-width: 480px;
  margin: 0 auto;
}
.settlement-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.settlement-card {
  padding: 16px;
  border-radius: 16px;
  background: var(--wash);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
}
.settlement-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.settlement-ref {
  font: 700 0.9rem var(--sans);
  color: var(--ink);
}
.settlement-status {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  font: 700 0.68rem var(--sans);
  letter-spacing: 0.02em;
  color: #fff;
  background: var(--muted);
}
.settlement-status.pending {
  background: var(--muted);
}
.settlement-status.submitted {
  background: var(--orange);
}
.settlement-status.approved {
  background: var(--green);
}
.settlement-status.rejected {
  background: #e0433b;
}
.settlement-range {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 0.78rem;
}
.settlement-amounts {
  display: flex;
  gap: 24px;
  margin-top: 12px;
}
.amount-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.amount-label {
  color: var(--muted);
  font-size: 0.72rem;
}
.amount-value {
  font: 700 0.95rem var(--heading);
  color: var(--ink);
}
.reject-reason {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(224, 67, 59, 0.1);
  color: #e0433b;
  font-size: 0.78rem;
}
</style>
