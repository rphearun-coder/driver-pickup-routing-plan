<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  getMyDailyCodSettlement,
  getMyDriverCodSettlements,
  settlementPeriodRange,
  type CodSettlementHistoryItem,
  type DailyCodSettlement,
  type DriverCodSettlementStatus,
} from '../api/cod-settlement';
import { resolveParcelImageUrl } from '../api/parcels';
import { DATE_RANGE_OPTIONS, rangeDatesText, todayRange, type DateRangeKey } from '../api/dashboard';
import RangePicker from '../components/RangePicker.vue';
import ImageLightbox from '../components/ImageLightbox.vue';
import AppToast from '../components/AppToast.vue';
import CodSettlementSheet from '../components/CodSettlementSheet.vue';
import SettlementDetailSheet from '../components/SettlementDetailSheet.vue';
import StateBlock from '../components/StateBlock.vue';
import { useToast } from '../composables/useToast';
import { vScrollX } from '../directives/scrollX';

const router = useRouter();

const PAGE_SIZE = 50;
const settlements = ref<CodSettlementHistoryItem[]>([]);
const total = ref(0);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref('');
// A settlement history is rarely useful for just today — start from the month.
const selectedRangeKey = ref<DateRangeKey>('month');
const statusFilter = ref<'ALL' | DriverCodSettlementStatus>('ALL');
const proofViewUrl = ref('');
const detailItem = ref<CodSettlementHistoryItem | null>(null);

const STATUS_META: Record<DriverCodSettlementStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Ready to settle', tone: 'orange' },
  SUBMITTED: { label: 'Waiting for approval', tone: 'blue' },
  APPROVED: { label: 'Approved', tone: 'green' },
  REJECTED: { label: 'Rejected', tone: 'red' },
};
const FILTERS: ('ALL' | DriverCodSettlementStatus)[] = ['ALL', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED'];

function filterLabel(key: 'ALL' | DriverCodSettlementStatus): string {
  if (key === 'ALL') return 'All';
  return { PENDING: 'Pending', SUBMITTED: 'Submitted', APPROVED: 'Approved', REJECTED: 'Rejected' }[key];
}

function countFor(key: 'ALL' | DriverCodSettlementStatus): number {
  return key === 'ALL' ? settlements.value.length : settlements.value.filter((s) => s.status === key).length;
}

const visible = computed(() =>
  statusFilter.value === 'ALL' ? settlements.value : settlements.value.filter((s) => s.status === statusFilter.value),
);
const hasMore = computed(() => settlements.value.length < total.value);

const approvedTotal = computed(() =>
  settlements.value
    .filter((s) => s.status === 'APPROVED')
    .reduce((sum, s) => sum + settlementTotal(s), 0),
);
const openCount = computed(() => settlements.value.filter((s) => s.status === 'PENDING' || s.status === 'REJECTED').length);

function formatUSD(amount?: number): string {
  return `$${(amount ?? 0).toFixed(2)}`;
}

function formatDay(value?: string): string {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value?: string): string {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function periodText(item: CodSettlementHistoryItem): string {
  const start = formatDay(item.startAt);
  const end = formatDay(item.endAt);
  return start === end ? start : `${start} – ${end}`;
}

// PayWay + transfer is the settlement's full amount (see the server's $getReservedAmount).
// The row's totalCodUsd is summed over this page's date filter, not the settlement's own
// period, so it can't be shown per settlement.
function settlementTotal(item: CodSettlementHistoryItem): number {
  return (item.requestedAmount ?? 0) + (item.settledAmount ?? 0);
}

interface TimelineStep {
  label: string;
  time: string;
  state: 'done' | 'current' | 'failed' | 'todo';
}

// Created → Submitted → Approved / Rejected, from the timestamps the API returns.
function timeline(item: CodSettlementHistoryItem): TimelineStep[] {
  const steps: TimelineStep[] = [{ label: 'Created', time: formatDateTime(item.createdAt), state: 'done' }];
  steps.push({
    label: 'Receipt sent',
    time: formatDateTime(item.submittedAt),
    state: item.submittedAt ? 'done' : item.status === 'PENDING' ? 'current' : 'todo',
  });
  if (item.status === 'REJECTED') {
    steps.push({ label: 'Rejected', time: formatDateTime(item.rejectedAt), state: 'failed' });
  } else {
    steps.push({
      label: 'Approved',
      time: formatDateTime(item.approvedAt),
      state: item.status === 'APPROVED' ? 'done' : item.status === 'SUBMITTED' ? 'current' : 'todo',
    });
  }
  return steps;
}

async function fetchPage(offset: number) {
  const { startAt, endAt } = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
  return getMyDriverCodSettlements(startAt, endAt, PAGE_SIZE, offset);
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const data = await fetchPage(0);
    settlements.value = data.results;
    total.value = data.metadata.total;
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load settlement history';
  } finally {
    loading.value = false;
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const data = await fetchPage(settlements.value.length);
    settlements.value = [...settlements.value, ...data.results];
    total.value = data.metadata.total;
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load more';
  } finally {
    loadingMore.value = false;
  }
}

function selectRange(key: DateRangeKey): void {
  selectedRangeKey.value = key;
  load();
}

const toast = useToast();
const receiptSettlement = ref<DailyCodSettlement | null>(null);
const receiptLoadingId = ref('');

// Opens the receipt sheet for this exact settlement. Home's sheet only knows today's
// active settlement, so an older pending one couldn't be sent from there. COD totals
// come from myDailyCodSettlement over this settlement's own period — the list row's
// totalCodUsd is summed over the page's date filter instead.
async function sendReceipt(item: CodSettlementHistoryItem): Promise<void> {
  if (receiptLoadingId.value) return;
  receiptLoadingId.value = item.id;
  let totals: Partial<DailyCodSettlement> = {};
  try {
    const { startAt, endAt } = settlementPeriodRange(item);
    const daily = await getMyDailyCodSettlement(startAt, endAt);
    totals = { totalCod: daily.totalCod, totalCodUsd: daily.totalCodUsd, totalCodKhr: daily.totalCodKhr };
  } catch {
    // Totals are informational — the transfer amount and submit only need the row itself.
  } finally {
    receiptLoadingId.value = '';
  }
  detailItem.value = null;
  receiptSettlement.value = {
    totalCod: 0,
    totalCodUsd: 0,
    totalCodKhr: 0,
    ...totals,
    id: item.id,
    status: item.status,
    requestedAmount: item.requestedAmount,
    settledAmount: item.settledAmount,
    proofImage: item.proofImage,
    driverNote: item.driverNote,
  };
}

function onReceiptSubmitted(): void {
  receiptSettlement.value = null;
  toast.show('Receipt sent — waiting for approval.');
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
        <h1>Settlement History</h1>
        <span class="header-sub">{{ rangeDatesText(selectedRangeKey) }}</span>
      </div>
      <RangePicker class="header-range" :model-value="selectedRangeKey" @update:model-value="selectRange" />
    </header>

    <div class="history-body">
      <section class="summary">
        <div class="summary-main">
          <span class="summary-label">Approved {{ DATE_RANGE_OPTIONS.find((o) => o.key === selectedRangeKey)?.label.toLowerCase() }}</span>
          <strong class="summary-value">{{ loading ? '–' : formatUSD(approvedTotal) }}</strong>
        </div>
        <div class="summary-side">
          <span class="summary-count">{{ loading ? '–' : settlements.length }}</span>
          <span class="summary-small">settlements</span>
          <span v-if="!loading && openCount" class="summary-open">{{ openCount }} need action</span>
        </div>
      </section>

      <div v-scroll-x class="chips scroll-row" role="tablist">
        <button
          v-for="key in FILTERS"
          :key="key"
          type="button"
          role="tab"
          :aria-selected="statusFilter === key"
          :class="{ active: statusFilter === key }"
          @click="statusFilter = key"
        >
          {{ filterLabel(key) }} <span class="chip-count">{{ countFor(key) }}</span>
        </button>
      </div>

      <ul v-if="loading" class="list" aria-hidden="true">
        <li v-for="n in 3" :key="n" class="card skeleton">
          <span class="sk sk-line"></span><span class="sk sk-line"></span><span class="sk sk-line short"></span>
        </li>
      </ul>

      <StateBlock
        v-else-if="error && !settlements.length"
        tone="error"
        title="Couldn't load settlements"
        :text="error"
        action-label="Try again"
        @action="load"
      />

      <StateBlock
        v-else-if="!visible.length"
        :title="statusFilter === 'ALL' ? 'No settlements yet' : `No ${filterLabel(statusFilter).toLowerCase()} settlements`"
        text="Try another date range or filter."
      >
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.8" />
          </svg>
        </template>
      </StateBlock>

      <ul v-else class="list">
        <li
          v-for="item in visible"
          :key="item.id"
          class="card"
          :class="STATUS_META[item.status]?.tone"
          role="button"
          tabindex="0"
          :aria-label="`View details of ${item.refNo}`"
          @click="detailItem = item"
          @keydown.enter.self="detailItem = item"
          @keydown.space.self.prevent="detailItem = item"
        >
          <div class="card-top">
            <span class="status-icon" aria-hidden="true">
              <svg v-if="item.status === 'APPROVED'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              <svg v-else-if="item.status === 'REJECTED'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                <path d="M7 7l10 10M17 7 7 17" />
              </svg>
              <svg v-else-if="item.status === 'SUBMITTED'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
              </svg>
              <template v-else>$</template>
            </span>
            <span class="card-title">
              <span class="ref">{{ item.refNo }}</span>
              <span class="period">{{ periodText(item) }}</span>
            </span>
            <span class="status-badge">{{ STATUS_META[item.status]?.label ?? item.status }}</span>
          </div>

          <div class="amounts">
            <div class="amount">
              <span>Total</span>
              <strong>{{ formatUSD(settlementTotal(item)) }}</strong>
            </div>
            <div class="amount">
              <span>PayWay</span>
              <strong>{{ formatUSD(item.requestedAmount) }}</strong>
            </div>
            <div class="amount main">
              <span>{{ item.status === 'APPROVED' ? 'Settled' : 'To transfer' }}</span>
              <strong>{{ formatUSD(item.settledAmount) }}</strong>
            </div>
          </div>

          <ol class="timeline">
            <li v-for="step in timeline(item)" :key="step.label" :class="step.state">
              <span class="tl-dot" aria-hidden="true"></span>
              <span class="tl-label">{{ step.label }}</span>
              <span v-if="step.time" class="tl-time">{{ step.time }}</span>
            </li>
          </ol>

          <p v-if="item.status === 'REJECTED' && item.rejectReason" class="reject-reason">
            <strong>Reason:</strong> {{ item.rejectReason }}
          </p>

          <div class="card-foot">
            <button
              v-if="resolveParcelImageUrl(item.proofImage)"
              type="button"
              class="proof-thumb"
              aria-label="View transfer screenshot"
              @click.stop="proofViewUrl = resolveParcelImageUrl(item.proofImage)"
            >
              <img :src="resolveParcelImageUrl(item.proofImage)" alt="" loading="lazy" />
              <span>Transfer screenshot</span>
            </button>
            <button
              v-if="item.status === 'PENDING'"
              type="button"
              class="send-btn"
              :disabled="receiptLoadingId === item.id"
              @click.stop="sendReceipt(item)"
            >
              {{ receiptLoadingId === item.id ? 'Opening…' : 'Send receipt' }}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            <span v-else class="details-link" aria-hidden="true">
              View details
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          </div>
        </li>
      </ul>

      <p v-if="error && settlements.length" class="inline-error">{{ error }}</p>
      <button v-if="!loading && hasMore" type="button" class="load-more" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? 'Loading…' : `Load more (${total - settlements.length} left)` }}
      </button>
    </div>

    <SettlementDetailSheet
      v-if="detailItem"
      :item="detailItem"
      @close="detailItem = null"
      @send-receipt="detailItem && sendReceipt(detailItem)"
    />

    <CodSettlementSheet
      v-if="receiptSettlement"
      :settlement="receiptSettlement"
      @close="receiptSettlement = null"
      @submitted="onReceiptSubmitted"
    />

    <AppToast :message="toast.message.value" :type="toast.type.value" />

    <ImageLightbox v-if="proofViewUrl" :src="proofViewUrl" alt="Transfer screenshot" caption="Transfer screenshot · tap to close" @close="proofViewUrl = ''" />
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
  border-bottom: 1px solid var(--divider);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--green-strong), var(--green));
  color: #fff;
  box-shadow: 0 8px 22px rgba(26, 156, 75, 0.28);
}
.summary-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.summary-label {
  opacity: 0.85;
  font: 700 0.72rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.summary-value {
  font: 800 1.8rem var(--sans);
}
.summary-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}
.summary-count {
  font: 800 1.3rem var(--sans);
}
.summary-small {
  opacity: 0.85;
  font: 600 0.72rem var(--sans);
}
.summary-open {
  margin-top: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  background: #fff;
  color: var(--orange-strong);
  font: 700 0.68rem var(--sans);
}
.chips {
  gap: 6px;
  margin: 16px 0 12px;
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
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card {
  --tone: var(--muted);
  --tone-soft: var(--fill);
  --tone-strong: var(--text-3);
  padding: 14px;
  border: 1px solid var(--border);
  border-left: 4px solid var(--tone);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(17, 24, 39, 0.05);
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.card:not(.skeleton):active {
  transform: scale(0.99);
  box-shadow: 0 1px 4px rgba(17, 24, 39, 0.06);
}
.card:focus-visible {
  outline: 2px solid var(--tone);
  outline-offset: 2px;
}
.details-link {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  color: var(--tone-strong);
  font: 700 0.76rem var(--sans);
}
.details-link svg {
  width: 14px;
  height: 14px;
}
.card.orange {
  --tone: var(--orange);
  --tone-soft: var(--orange-soft);
  --tone-strong: var(--orange-strong);
}
.card.blue {
  --tone: var(--blue);
  --tone-soft: var(--blue-soft);
  --tone-strong: var(--blue-strong);
}
.card.green {
  --tone: var(--green);
  --tone-soft: var(--green-soft);
  --tone-strong: var(--green-strong);
}
.card.red {
  --tone: var(--red);
  --tone-soft: var(--red-soft);
  --tone-strong: var(--red-strong);
}
.card-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.status-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--tone-soft);
  color: var(--tone-strong);
  font: 800 1rem var(--sans);
}
.status-icon svg {
  width: 17px;
  height: 17px;
}
.card-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ref {
  overflow: hidden;
  color: var(--ink);
  font: 700 0.86rem ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.period {
  color: var(--muted);
  font: 500 0.74rem var(--sans);
}
.status-badge {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--tone-soft);
  color: var(--tone-strong);
  font: 700 0.68rem var(--sans);
  white-space: nowrap;
}
.amounts {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--page);
}
.amount {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.amount span {
  color: var(--muted);
  font: 600 0.68rem var(--sans);
}
.amount strong {
  overflow: hidden;
  color: var(--ink);
  font: 700 0.84rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amount.main strong {
  color: var(--tone-strong);
  font-size: 0.98rem;
  font-weight: 800;
}
.timeline {
  display: flex;
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.timeline li {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 0;
  text-align: center;
}
.timeline li:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 6px;
  left: calc(50% + 9px);
  right: calc(-50% + 9px);
  height: 2px;
  background: var(--border-dashed);
}
.timeline li.done:not(:last-child)::after {
  background: var(--green);
}
.tl-dot {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-dashed);
  border-radius: 50%;
  background: #fff;
}
.timeline li.done .tl-dot {
  border-color: var(--green);
  background: var(--green);
}
.timeline li.current .tl-dot {
  border-color: var(--tone);
  box-shadow: 0 0 0 3px var(--tone-soft);
}
.timeline li.failed .tl-dot {
  border-color: var(--red);
  background: var(--red);
}
.tl-label {
  color: var(--text-3);
  font: 700 0.7rem var(--sans);
}
.timeline li.todo .tl-label {
  color: var(--faint);
}
.timeline li.failed .tl-label {
  color: var(--red-strong);
}
.tl-time {
  max-width: 100%;
  overflow: hidden;
  color: var(--muted);
  font: 500 0.62rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reject-reason {
  margin: 12px 0 0;
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--red-soft);
  color: var(--red-deep);
  font: 500 0.78rem var(--sans);
}
.card-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--divider);
}
.proof-thumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--blue);
  font: 700 0.76rem var(--sans);
  cursor: zoom-in;
}
.proof-thumb img {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--input);
}
.send-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 8px 12px 8px 14px;
  border: none;
  border-radius: 999px;
  background: var(--green);
  color: #fff;
  font: 700 0.78rem var(--sans);
  cursor: pointer;
}
.send-btn:disabled {
  opacity: 0.7;
  cursor: progress;
}
.send-btn svg {
  width: 14px;
  height: 14px;
}
.skeleton {
  cursor: default;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-left-color: var(--border);
}
.sk {
  display: block;
  background: linear-gradient(90deg, var(--track) 25%, var(--page) 50%, var(--track) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}
.sk-line {
  height: 13px;
  border-radius: 7px;
}
.sk-line.short {
  width: 50%;
}
.inline-error {
  margin: 14px 0 0;
  color: var(--red-strong);
  font: 600 0.8rem var(--sans);
  text-align: center;
}
.load-more {
  display: block;
  width: 100%;
  margin-top: 14px;
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
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
