<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { DATE_RANGE_OPTIONS, getDriverDashboard, todayRange, type DateRangeKey } from '../api/dashboard.ts';
import {
  confirmReturnParcelFromWarehouse,
  driverListReturnParcel,
  parcelSellerName,
  resolveParcelImageUrl,
  type Parcel,
} from '../api/parcels.ts';
import AppToast from '../components/AppToast.vue';
import BrandHeader from '../components/BrandHeader.vue';
import HeaderIconButton from '../components/HeaderIconButton.vue';
import SearchChip from '../components/SearchChip.vue';
import SearchDialog from '../components/SearchDialog.vue';
import StateBlock from '../components/StateBlock.vue';
import RangePicker from '../components/RangePicker.vue';
import ScanQRCodeModal from '../components/ScanQRCodeModal.vue';
import { useOrderDetailStore } from '../stores/orderDetail';
import { useMobileInteraction } from '../composables/useMobileInteraction';
import { useToast } from '../composables/useToast';
import { extractUuid, normalizePhone } from '../utils/inputRules';
import type { DriverDashboardSummary } from '../types/api.ts';

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

// "To shop": the driver is carrying it back to the seller (BE_RETURN — confirmed
// on the parcel page with a handover photo). "To warehouse": it's on its way back
// to the warehouse (dropped off there, same page). Matches ParcelStatusEnum.
type FilterKey = 'to-shop' | 'to-warehouse';
const activeFilter = ref<FilterKey>('to-shop');
const STATUS_BY_TAB: Record<FilterKey, Parcel['status'][]> = {
  'to-shop': ['BE_RETURN'],
  'to-warehouse': ['RETURNING_FROM_DRIVER', 'PROCESSING_RETURN'],
};
const LIST_LIMIT = 100;

const lists = ref<Record<FilterKey, Parcel[]>>({ 'to-shop': [], 'to-warehouse': [] });
const loading = ref(true);
const error = ref('');
const brokenThumbIds = ref<Set<string>>(new Set());

const search = ref('');
const showSearch = ref(false);

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

function returnThumb(item: Parcel): string {
  if (brokenThumbIds.value.has(item.id)) return '';
  return resolveParcelImageUrl(item.parcelImage || item.receiptImage);
}

function returnRecipient(item: Parcel): string {
  return item.recipientName || item.location || 'Unknown recipient';
}

function sellerName(item: Parcel): string {
  return parcelSellerName(item) || 'Unknown shop';
}

function parcelCode(item: Parcel): string {
  return item.parcelUID || `#${item.id.slice(-6).toUpperCase()}`;
}

// How long it's been waiting to go back — flagged after 3 days so old returns stand out.
const OVERDUE_DAYS = 3;
function waitingDays(item: Parcel): number {
  const value = item.updatedAt || item.createdAt;
  if (!value) return 0;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}
function waitingText(item: Parcel): string {
  const days = waitingDays(item);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function isWithinRange(dateStr: string | undefined, startAt: string, endAt: string): boolean {
  if (!dateStr) return false;
  const time = new Date(dateStr).getTime();
  return time >= new Date(startAt).getTime() && time <= new Date(endAt).getTime();
}

const activeItems = computed(() => lists.value[activeFilter.value]);

const filteredItems = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return activeItems.value;
  const phoneQuery = /^[\d\s+()-]+$/.test(query) ? normalizePhone(query) : '';
  return activeItems.value.filter((item) => {
    if (phoneQuery.length >= 3 && normalizePhone(item.recipientNumber || '').includes(phoneQuery)) return true;
    return [item.parcelUID, item.recipientName, item.recipientNumber, item.location, parcelSellerName(item)]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query));
  });
});

// Grouped by seller: parcels going back to the same shop sit together.
const groups = computed(() => {
  const bySeller = new Map<string, Parcel[]>();
  for (const item of filteredItems.value) {
    const key = sellerName(item);
    if (!bySeller.has(key)) bySeller.set(key, []);
    bySeller.get(key)!.push(item);
  }
  return Array.from(bySeller.entries())
    .map(([seller, items]) => ({ seller, items }))
    .sort((a, b) => b.items.length - a.items.length || a.seller.localeCompare(b.seller));
});

const overdueCount = computed(
  () => activeItems.value.filter((item) => waitingDays(item) >= OVERDUE_DAYS).length,
);

// No backend date filter exists for this list (see driverListReturnParcel /
// $getDriverReturnParcelList), so this scopes to the selected range client-side.
// Both tabs load together so each can show its count.
async function loadReturnParcels(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const { startAt, endAt } = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
    const [toShop, toWarehouse] = await Promise.all([
      driverListReturnParcel(STATUS_BY_TAB['to-shop'], undefined, LIST_LIMIT),
      driverListReturnParcel(STATUS_BY_TAB['to-warehouse'], undefined, LIST_LIMIT),
    ]);
    lists.value = {
      'to-shop': toShop.results.filter((item) => isWithinRange(item.createdAt, startAt, endAt)),
      'to-warehouse': toWarehouse.results.filter((item) => isWithinRange(item.createdAt, startAt, endAt)),
    };
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load return parcels';
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
  loadReturnParcels();
}

function openScan(): void {
  rangePicker.value?.close();
  showScan.value = true;
}

function openSearch(): void {
  rangePicker.value?.close();
  showSearch.value = true;
}

function applySearch(query: string): void {
  search.value = query;
  showSearch.value = false;
}

function clearSearch(): void {
  search.value = '';
  showSearch.value = false;
}
// The scanned QR encodes the parcel's own id — confirming it here marks the
// driver as having picked it back up from the warehouse to return it (moves
// it to BE_RETURN, see Jalat-Order-Service's driverConfirmReturnParcelFromWH).
async function onQrScanned(rawValue: string): Promise<void> {
  const id = extractUuid(rawValue);
  if (!id) {
    showMessage("That QR code isn't a Jalat parcel.", 'error');
    return;
  }
  if (lists.value['to-shop'].some((item) => item.id.toLowerCase() === id)) {
    activeFilter.value = 'to-shop';
    showMessage("That parcel is already in your 'To shop' list.", 'error');
    return;
  }
  try {
    const parcel = await confirmReturnParcelFromWarehouse(id);
    activeFilter.value = 'to-shop';
    showMessage(`${returnRecipient(parcel)} — ready to return to ${sellerName(parcel)}.`);
    loadReturnParcels();
    loadStats();
  } catch (err: any) {
    showMessage(err.message ?? 'Could not scan that QR code.', 'error');
  }
}

onMounted(async () => {
  await loadStats();
  loadReturnParcels();
});

</script>

<template>
  <div class="returns-page">
    <BrandHeader>
      <RangePicker ref="rangePicker" :model-value="selectedRangeKey" @update:model-value="selectRange" />
      <HeaderIconButton label="Search returns" :active="!!search" @click="openSearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
      </HeaderIconButton>
    </BrandHeader>
    <section class="summary-card">
      <div class="summary-grid">
        <div class="stat">
          <span class="stat-value orange">{{ loading ? '–' : lists['to-shop'].length }}</span>
          <span class="stat-label">To shop</span>
        </div>
        <div class="stat">
          <span class="stat-value blue">{{ loading ? '–' : lists['to-warehouse'].length }}</span>
          <span class="stat-label">To warehouse</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ stats?.totalBeReturn ?? 0 }}</span>
          <span class="stat-label">Be return</span>
        </div>
        <div class="stat">
          <span class="stat-value green">{{ stats?.totalReturn ?? 0 }}</span>
          <span class="stat-label">Returned</span>
        </div>
      </div>
    </section>

    <main class="page-body">
      <button type="button" class="scan-btn" @click="openScan">
        <span class="scan-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
            <path d="M7 12h10" />
          </svg>
        </span>
        <span class="scan-text">
          <strong>Scan return parcel</strong>
          <small>Pick up from the warehouse</small>
        </span>
        <svg class="scan-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      <div class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="activeFilter === 'to-shop'"
          :class="{ active: activeFilter === 'to-shop' }"
          @click="activeFilter = 'to-shop'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 9h16l-1.5-5h-13z" /><path d="M5 9v11h14V9M9 20v-6h6v6" />
          </svg>
          To shop <span class="tab-count">{{ lists['to-shop'].length }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeFilter === 'to-warehouse'"
          :class="{ active: activeFilter === 'to-warehouse' }"
          @click="activeFilter = 'to-warehouse'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8M7 17h10" />
          </svg>
          To warehouse <span class="tab-count">{{ lists['to-warehouse'].length }}</span>
        </button>
      </div>

      <p class="tab-hint">
        {{
          activeFilter === 'to-shop'
            ? 'Hand these back to the seller, then confirm with a photo.'
            : 'Drop these off at the warehouse, then confirm with a photo.'
        }}
      </p>

      <SearchChip v-if="search" :query="search" :count="filteredItems.length" @clear="clearSearch" />
      <div v-if="!loading && overdueCount" class="overdue-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
        </svg>
        {{ overdueCount }} parcel{{ overdueCount > 1 ? 's have' : ' has' }} been waiting {{ OVERDUE_DAYS }}+ days.
      </div>

      <ul v-if="loading" class="order-list" aria-hidden="true">
        <li v-for="n in 3" :key="n" class="order-card skeleton">
          <span class="thumb sk"></span>
          <span class="sk-lines"><span class="sk sk-line"></span><span class="sk sk-line"></span><span class="sk sk-line short"></span></span>
        </li>
      </ul>

      <StateBlock
        v-else-if="error"
        tone="error"
        title="Couldn't load returns"
        :text="error"
        action-label="Try again"
        @action="loadReturnParcels"
      />
      <StateBlock
        v-else-if="!activeItems.length"
        tone="success"
        :title="`Nothing ${activeFilter === 'to-shop' ? 'to return to shops' : 'to drop at the warehouse'}`"
        :text="activeFilter === 'to-shop' ? 'Scan a returning parcel at the warehouse to add it.' : 'Try another date range.'"
      />
      <StateBlock
        v-else-if="!filteredItems.length"
        title="No matches"
        text="Nothing matches that search."
        action-label="Clear search"
        action-style="secondary"
        @action="clearSearch"
      />
      <template v-else>
        <section v-for="group in groups" :key="group.seller" class="seller-group">
          <h2 class="seller-heading">
            <span class="seller-avatar">{{ group.seller.charAt(0).toUpperCase() }}</span>
            <span class="seller-name">{{ group.seller }}</span>
            <span class="seller-count">{{ group.items.length }} parcel{{ group.items.length > 1 ? 's' : '' }}</span>
          </h2>
          <ul class="order-list">
            <li v-for="item in group.items" :key="item.id" class="order-card" :class="{ overdue: waitingDays(item) >= OVERDUE_DAYS }">
              <button type="button" class="card-main" @click="viewDetail(item)">
                <span class="thumb">
                  <img v-if="returnThumb(item)" :src="returnThumb(item)" alt="" loading="lazy" @error="onThumbError(item.id)" />
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
                    <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" />
                  </svg>
                  <span class="thumb-badge" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" />
                    </svg>
                  </span>
                </span>
                <span class="info">
                  <span class="info-top">
                    <span class="code">{{ parcelCode(item) }}</span>
                    <span class="waiting" :class="{ overdue: waitingDays(item) >= OVERDUE_DAYS }">{{ waitingText(item) }}</span>
                  </span>
                  <span class="recipient">{{ returnRecipient(item) }}</span>
                  <span v-if="item.recipientNumber" class="line">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z" />
                    </svg>
                    {{ item.recipientNumber }}
                  </span>
                  <span v-if="item.reason" class="reason">{{ item.reason }}</span>
                </span>
              </button>
              <button type="button" class="action-btn" :class="activeFilter" @click="viewDetail(item)">
                {{ activeFilter === 'to-shop' ? 'Return' : 'Drop off' }}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </li>
          </ul>
        </section>
      </template>
    </main>

    <SearchDialog
      v-if="showSearch"
      :initial-query="search"
      title="Search Returns"
      hint="Search ID, recipient, phone or shop."
      placeholder="e.g. Nippon or 012 345 678"
      @apply="applySearch"
      @close="showSearch = false"
    />

    <AppToast :message="toast.message.value" :type="toast.type.value" />

    <ScanQRCodeModal
      v-if="showScan"
      title="Scan to Return"
      hint="Align the parcel's QR code within frame to scan"
      @scan="onQrScanned"
      @close="showScan = false"
    />
  </div>
</template>

<style scoped>
.returns-page {
  min-height: 100%;
  background: var(--page);
}
.summary-card {
  width: calc(100% - 32px);
  max-width: 448px;
  margin: -64px auto 0;
  padding: 16px 8px;
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
  text-align: center;
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
.stat-value.blue {
  color: var(--blue);
}
.stat-value.green {
  color: var(--green);
}
.stat-label {
  color: var(--muted);
  font: 500 0.68rem var(--sans);
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
  border: 1.5px dashed var(--orange);
  border-radius: 16px;
  background: var(--orange-tint);
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
  background: var(--orange);
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
  color: var(--orange-strong);
  font: 700 0.95rem var(--sans);
}
.scan-text small {
  color: var(--muted);
  font-size: 0.75rem;
}
.scan-chevron {
  width: 18px;
  height: 18px;
  color: var(--orange);
}
.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-top: 18px;
  padding: 4px;
  border-radius: 14px;
  background: var(--fill-strong);
}
.tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 42px;
  border: none;
  border-radius: 11px;
  background: none;
  color: var(--muted);
  font: 600 0.86rem var(--sans);
  cursor: pointer;
}
.tabs button svg {
  width: 16px;
  height: 16px;
}
.tabs button.active {
  background: #fff;
  color: var(--ink);
  box-shadow: 0 1px 4px rgba(17, 24, 39, 0.12);
}
.tab-count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.15);
  font: 700 0.7rem var(--sans);
}
.tabs button.active .tab-count {
  background: var(--orange-soft);
  color: var(--orange);
}
.tab-hint {
  margin: 8px 4px 12px;
  color: var(--muted);
  font: 500 0.76rem var(--sans);
}
.overdue-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 9px 12px;
  border-radius: 12px;
  background: var(--orange-soft);
  color: var(--orange-deep);
  font: 600 0.78rem var(--sans);
}
.overdue-note svg {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
}
.seller-group + .seller-group {
  margin-top: 18px;
}
.seller-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 2px 10px;
}
.seller-avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 800 0.78rem var(--sans);
}
.seller-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font: 700 0.92rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.seller-count {
  flex-shrink: 0;
  color: var(--muted);
  font: 500 0.75rem var(--sans);
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
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(17, 24, 39, 0.05);
  overflow: hidden;
}
.order-card.overdue {
  border-color: #f5d9a8;
}
.card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.thumb {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
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
  width: 24px;
  height: 24px;
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
  background: var(--orange);
  color: #fff;
}
.thumb-badge svg {
  width: 10px;
  height: 10px;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.info-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.code {
  min-width: 0;
  overflow: hidden;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--fill);
  color: var(--text-2);
  font: 700 0.68rem ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.waiting {
  flex-shrink: 0;
  color: var(--muted);
  font: 600 0.7rem var(--sans);
}
.waiting.overdue {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--orange-soft);
  color: var(--orange-strong);
}
.recipient {
  overflow: hidden;
  color: var(--ink);
  font: 700 0.9rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.line {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-3);
  font: 500 0.78rem var(--sans);
}
.line svg {
  width: 13px;
  height: 13px;
  color: var(--faint);
}
.reason {
  align-self: flex-start;
  max-width: 100%;
  margin-top: 2px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--red-soft);
  color: var(--red-strong);
  font: 600 0.68rem var(--sans);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.action-btn {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 72px;
  border: none;
  border-left: 1px solid var(--divider);
  background: var(--orange-tint);
  color: var(--orange-strong);
  font: 700 0.76rem var(--sans);
  cursor: pointer;
}
.action-btn.to-warehouse {
  background: #eef4fe;
  color: var(--blue-strong);
}
.action-btn svg {
  width: 16px;
  height: 16px;
}
.skeleton {
  align-items: center;
  gap: 12px;
  padding: 12px;
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
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
