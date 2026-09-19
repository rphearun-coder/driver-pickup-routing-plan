<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getMyProfile } from '../api/users.ts';
import { DATE_RANGE_OPTIONS, getDriverDashboard, todayRange, type DateRangeKey } from '../api/dashboard.ts';
import {
  confirmReturnParcelFromWarehouse,
  driverListReturnParcel,
  resolveParcelImageUrl,
  type Parcel,
} from '../api/parcels.ts';
import BrandLogo from '../components/BrandLogo.vue';
import QrCodeCard from '../components/QrCodeCard.vue';
import RangePicker from '../components/RangePicker.vue';
import ScanQRCodeModal from '../components/ScanQRCodeModal.vue';
import { useOrderDetailStore } from '../stores/orderDetail';
import { useMobileInteraction } from '../composables/useMobileInteraction';
import type { AuthenticatedUser, DriverDashboardSummary } from '../types/api.ts';

const router = useRouter();
const orderDetail = useOrderDetailStore();

function viewDetail(item: Parcel): void {
  orderDetail.setParcel(item);
  router.push({ name: 'parcel-detail', params: { id: item.id } });
}

const profile = ref<AuthenticatedUser | null>(null);
const stats = ref<DriverDashboardSummary | null>(null);
const showQr = ref(false);
const showScan = ref(false);
const scanMessage = ref('');
const scanMessageType = ref<'success' | 'error'>('success');
let scanMessageTimer: ReturnType<typeof setTimeout> | undefined;
const selectedRangeKey = ref<DateRangeKey>('today');

type FilterKey = 'to-go' | 'to-shop';
const activeFilter = ref<FilterKey>('to-go');

useMobileInteraction(() => {
  showQr.value = false;
  showScan.value = false;
  scanMessage.value = '';
});

// "To Return": driver hasn't collected it yet. "In Progress": collected, on its
// way back to the warehouse/shop. Matches ParcelStatusEnum in the order service.
const STATUS_BY_TAB: Record<FilterKey, Parcel['status'][]> = {
  'to-go': ['BE_RETURN'],
  'to-shop': ['RETURNING_FROM_DRIVER', 'PROCESSING_RETURN'],
};

const visibleItems = ref<Parcel[]>([]);
const loading = ref(true);
const error = ref('');
const brokenThumbIds = ref<Set<string>>(new Set());

function onThumbError(itemId: string): void {
  brokenThumbIds.value.add(itemId);
}

function returnThumb(item: Parcel): string {
  if (brokenThumbIds.value.has(item.id)) return '';
  return resolveParcelImageUrl(item.parcelImage || item.receiptImage);
}

function returnRecipient(item: Parcel): string {
  return item.recipientName || item.partnerStoreName || item.location || 'Unknown';
}

function isWithinRange(dateStr: string | undefined, startAt: string, endAt: string): boolean {
  if (!dateStr) return false;
  const time = new Date(dateStr).getTime();
  return time >= new Date(startAt).getTime() && time <= new Date(endAt).getTime();
}

// No backend date filter exists for this list (see driverListReturnParcel /
// $getDriverReturnParcelList), so this scopes to the selected range client-side.
async function loadReturnParcels(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const { startAt, endAt } = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
    const data = await driverListReturnParcel(STATUS_BY_TAB[activeFilter.value]);
    visibleItems.value = data.results.filter((item) => isWithinRange(item.createdAt, startAt, endAt));
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

function showScanMessage(text: string, type: 'success' | 'error'): void {
  scanMessage.value = text;
  scanMessageType.value = type;
  clearTimeout(scanMessageTimer);
  scanMessageTimer = setTimeout(() => (scanMessage.value = ''), 4000);
}

// The scanned QR encodes the parcel's own id — confirming it here marks the
// driver as having picked it back up from the warehouse to return it (moves
// it to BE_RETURN, see Jalat-Order-Service's driverConfirmReturnParcelFromWH).
async function onQrScanned(rawValue: string): Promise<void> {
  const id = rawValue.trim();
  if (!id) return;
  try {
    await confirmReturnParcelFromWarehouse(id);
    showScanMessage('Parcel confirmed for return.', 'success');
    loadReturnParcels();
  } catch (err: any) {
    showScanMessage(err.message ?? 'Could not scan that QR code.', 'error');
  }
}

watch(activeFilter, loadReturnParcels);

onMounted(async () => {
  try {
    profile.value = await getMyProfile();
  } catch {
    profile.value = null;
  }
  await loadStats();
  loadReturnParcels();
});
</script>

<template>
  <div class="returns-page">
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
        <button type="button" class="icon-btn" aria-label="Show my QR code" @click="showQr = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7V4a1 1 0 0 1 1-1h3M21 7V4a1 1 0 0 0-1-1h-3M3 17v3a1 1 0 0 0 1 1h3M21 17v3a1 1 0 0 1-1 1h-3" />
            <rect x="7" y="7" width="4" height="4" /><rect x="13" y="7" width="4" height="4" />
            <rect x="7" y="13" width="4" height="4" /><rect x="13" y="13" width="4" height="4" />
          </svg>
        </button>
      </div>
    </header>

    <section class="summary-card">
      <div class="summary-main">
        <div class="summary-stats">
          <div class="stat-row">
            <span>Total Parcels</span>
            <strong>{{ stats?.totalDeliveryParcel ?? 0 }}</strong>
          </div>
          <div class="stat-row">
            <span>Be Return</span>
            <strong>{{ stats?.totalBeReturn ?? 0 }}</strong>
          </div>
          <div class="stat-row">
            <span>Returned</span>
            <strong>{{ stats?.totalReturn ?? 0 }}</strong>
          </div>
        </div>
      </div>
      <svg class="summary-illustration" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="58" fill="var(--wash)" />
        <circle cx="40" cy="86" r="10" stroke="var(--green)" stroke-width="3" />
        <circle cx="82" cy="86" r="10" stroke="var(--green)" stroke-width="3" />
        <path d="M40 86H70V60H50L40 74" stroke="var(--green)" stroke-width="3" stroke-linejoin="round" fill="none" />
        <path d="M70 60V50h12l6 10" stroke="var(--green)" stroke-width="3" stroke-linejoin="round" fill="none" />
        <circle cx="63" cy="34" r="8" stroke="var(--green)" stroke-width="3" />
        <path d="M63 42v14" stroke="var(--green)" stroke-width="3" />
      </svg>
    </section>

    <main class="page-body">
      <button type="button" class="scan-btn" @click="showScan = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7V4a1 1 0 0 1 1-1h3M21 7V4a1 1 0 0 0-1-1h-3M3 17v3a1 1 0 0 0 1 1h3M21 17v3a1 1 0 0 1-1 1h-3" />
          <path d="M7 12h10" />
        </svg>
        <span>Scan to find parcels to return</span>
      </button>

      <h2 class="section-heading">Returns</h2>

      <div class="filter-row">
        <button type="button" :class="{ active: activeFilter === 'to-go' }" @click="activeFilter = 'to-go'">
          To Return
        </button>
        <button type="button" :class="{ active: activeFilter === 'to-shop' }" @click="activeFilter = 'to-shop'">
          In Progress
        </button>
      </div>

      <p v-if="loading" class="hint">Loading…</p>
      <p v-else-if="error" class="hint error">{{ error }}</p>

      <ul v-else class="order-list">
        <li v-for="item in visibleItems" :key="item.id" class="order-card">
          <div class="order-icon">
            <img v-if="returnThumb(item)" :src="returnThumb(item)" alt="" @error="onThumbError(item.id)" />
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 8l-9-5-9 5 9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" />
            </svg>
            <span class="order-icon-badge">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 3h9l7 7-9 9-7-7Z" /><circle cx="9" cy="8" r="1.4" fill="#fff" />
              </svg>
            </span>
          </div>
          <div class="order-main">
            <p class="order-recipient">{{ returnRecipient(item) }}</p>
            <p class="order-code">{{ item.orderId }}</p>
          </div>
          <div class="order-side">
            <p class="order-shop">{{ item.partnerStoreName || '—' }}</p>
            <p class="order-phone">{{ item.recipientNumber }}</p>
            <a href="#" class="order-detail" @click.prevent="viewDetail(item)">View Details</a>
          </div>
        </li>
      </ul>
      <p v-if="!loading && !error && !visibleItems.length" class="empty-hint">No items here yet.</p>
    </main>

    <p v-if="scanMessage" class="scan-toast" :class="scanMessageType">{{ scanMessage }}</p>

    <QrCodeCard v-if="showQr" :profile="profile" @close="showQr = false" />

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

.page-body {
  padding: 32px 16px 40px;
  max-width: 480px;
  margin: 0 auto;
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
  width: 96px;
  height: 96px;
}

.scan-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px;
  margin-bottom: 20px;
  border: none;
  border-radius: 16px;
  background: var(--wash);
  color: var(--ink);
  font: 700 0.85rem var(--sans);
  cursor: pointer;
}
.scan-btn svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.section-heading {
  margin: 0 0 10px;
  font: 700 0.9rem var(--sans);
  color: var(--ink);
}

.filter-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.filter-row button {
  flex: 1;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--wash);
  color: var(--muted);
  font: 700 0.8rem var(--sans);
  cursor: pointer;
}
.filter-row button.active {
  border-color: var(--green);
  background: var(--green);
  color: #fff;
}

.order-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.order-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  background: var(--wash);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
}
.order-icon {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  overflow: hidden;
  border: 1.5px solid var(--ink);
  background: #fff;
  color: var(--ink);
}
.order-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.order-icon > svg {
  width: 20px;
  height: 20px;
}
.order-icon-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--orange);
  color: var(--orange);
  border: 2px solid #fff;
}
.order-icon-badge svg {
  width: 10px;
  height: 10px;
}
.order-main {
  flex: 1;
  min-width: 0;
}
.order-recipient {
  margin: 0 0 2px;
  font: 700 0.9rem var(--sans);
  color: var(--ink);
}
.order-code {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
}
.order-side {
  flex-shrink: 0;
  text-align: right;
}
.order-shop {
  margin: 0 0 2px;
  font: 700 0.85rem var(--sans);
  color: var(--ink);
}
.order-phone {
  margin: 0 0 2px;
  color: var(--muted);
  font-size: 0.78rem;
}
.order-detail {
  color: var(--green);
  font-size: 0.78rem;
  text-decoration: underline;
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

.scan-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 300;
  max-width: calc(100% - 48px);
  margin: 0;
  padding: 12px 18px;
  border-radius: 12px;
  background: var(--ink);
  color: #fff;
  text-align: center;
  font: 600 0.85rem var(--sans);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
  transform: translateX(-50%);
}
.scan-toast.error {
  background: #c62828;
}
</style>
