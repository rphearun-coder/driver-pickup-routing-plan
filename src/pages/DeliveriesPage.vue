<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { DATE_RANGE_OPTIONS, getDriverDashboard, todayRange, type DateRangeKey } from '../api/dashboard.ts';
import { getDeliveryList, parcelSellerName, resolveParcelImageUrl, scanParcelQrCode, type Parcel } from '../api/parcels.ts';
import BrandLogo from '../components/BrandLogo.vue';
import RangePicker from '../components/RangePicker.vue';
import ScanQRCodeModal from '../components/ScanQRCodeModal.vue';
import { useOrderDetailStore } from '../stores/orderDetail';
import { useMobileInteraction } from '../composables/useMobileInteraction';
import type { DriverDashboardSummary } from '../types/api.ts';

const router = useRouter();
const orderDetail = useOrderDetailStore();

function viewDetail(item: Parcel): void {
  orderDetail.setParcel(item);
  router.push({ name: 'parcel-detail', params: { id: item.id } });
}

const stats = ref<DriverDashboardSummary | null>(null);
const showScan = ref(false);
const scanMessage = ref('');
const scanMessageType = ref<'success' | 'error'>('success');
let scanMessageTimer: ReturnType<typeof setTimeout> | undefined;
const selectedRangeKey = ref<DateRangeKey>('today');
const rangePicker = ref<InstanceType<typeof RangePicker> | null>(null);

function openScan(): void {
  rangePicker.value?.close();
  showScan.value = true;
}

useMobileInteraction(() => {
  showScan.value = false;
  scanMessage.value = '';
});

const deliveryItems = ref<Parcel[]>([]);
const loading = ref(true);
const error = ref('');
const brokenThumbIds = ref<Set<string>>(new Set());
const searchPhone = ref('');

const filteredDeliveryItems = computed(() => {
  const query = searchPhone.value.trim();
  if (!query) return deliveryItems.value;
  return deliveryItems.value.filter((item) => (item.recipientNumber || '').includes(query));
});

function onThumbError(itemId: string): void {
  brokenThumbIds.value.add(itemId);
}

function toggleEnRoute(item: Parcel): void {
  // No update-delivery mutation was provided alongside getDeliveryList, so this
  // only flips local UI state for now — it doesn't persist to the backend.
  item.onRoute = !item.onRoute;
}

function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function deliveryCustomer(item: Parcel): string {
  return item.recipientName || parcelSellerName(item) || item.location || 'Unknown';
}

// orderId is the parent order and is often shared by several parcels in the
// same order — showing it as each card's "code" made unrelated deliveries
// look identical/duplicated. recipientNumber is unique per parcel.
function deliveryCode(item: Parcel): string {
  return item.recipientNumber || item.orderId || item.id;
}

function deliveryPhone(item: Parcel): string {
  return item.recipientNumber || '';
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

function deliveryMapUrl(item: Parcel): string {
  const lat = item.deliveryLatitude;
  const lon = item.deliveryLongitude;
  if (lat == null || lon == null) return '#';
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

function isWithinRange(dateStr: string | undefined, startAt: string, endAt: string): boolean {
  if (!dateStr) return false;
  const time = new Date(dateStr).getTime();
  return time >= new Date(startAt).getTime() && time <= new Date(endAt).getTime();
}

// No status filter needed — getDeliveryList defaults to ON_DELIVERY server-side
// (see Jalat-Order-Service/src/graphql/parcel/parcel.service.ts), which is
// exactly "the driver's current deliveries". Scoped to the selected range
// client-side by createdAt: the backend's own startAt/endAt filter only checks
// deliveredAt (see parcel.repository.ts $findAndCountAll), which is null on
// every not-yet-delivered ON_DELIVERY parcel — sending it there would zero out
// every active delivery, regardless of the date range.
async function loadDeliveries(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const { startAt, endAt } = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
    const data = await getDeliveryList();
    deliveryItems.value = data.results
      .filter((item) => isWithinRange(item.createdAt, startAt, endAt))
      // The backend's onRoute flag is unpopulated (always false) on every real
      // record so far — but everything here is already status ON_DELIVERY by
      // definition of this list, so that's the toggle's true initial state.
      .map((item) => ({ ...item, onRoute: item.onRoute || item.status === 'ON_DELIVERY' }));
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

function showScanMessage(text: string, type: 'success' | 'error'): void {
  scanMessage.value = text;
  scanMessageType.value = type;
  clearTimeout(scanMessageTimer);
  scanMessageTimer = setTimeout(() => (scanMessage.value = ''), 4000);
}

// The scanned QR encodes the parcel's own id (see Jalat-Order-Service's
// scanQRCode) — a successful scan assigns it to this driver and moves it to
// ON_DELIVERY server-side, so the list is reloaded to pick it up.
async function onQrScanned(rawValue: string): Promise<void> {
  const id = rawValue.trim();
  if (!id) return;
  try {
    await scanParcelQrCode(id);
    showScanMessage('Parcel added to your deliveries.', 'success');
    loadDeliveries();
  } catch (err: any) {
    showScanMessage(err.message ?? 'Could not scan that QR code.', 'error');
  }
}

onMounted(async () => {
  await loadStats();
  loadDeliveries();
});
</script>

<template>
  <div class="deliveries-page">
    <header class="page-header">
      <div class="header-top">
        <div class="header-brand">
          <BrandLogo :size="38" />
          <span class="brand-text">
            <strong>Jalat</strong>
            <em>Logistic</em>
          </span>
        </div>
        <div class="header-actions">
          <RangePicker ref="rangePicker" :model-value="selectedRangeKey" @update:model-value="selectRange" />
        </div>
      </div>

      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input v-model="searchPhone" type="tel" inputmode="tel" placeholder="Search by phone number" />
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
            <span>Not Yet Delivered</span>
            <strong>{{ stats?.totalRemainingDelivery ?? 0 }}</strong>
          </div>
          <div class="stat-row">
            <span>Success</span>
            <strong>{{ stats?.totalDeliverySuccess ?? 0 }}</strong>
          </div>
          <div class="stat-row">
            <span>Failed</span>
            <strong>{{ stats?.totalDeliveryFailed ?? 0 }}</strong>
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
      <button type="button" class="scan-btn" @click="openScan">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7V4a1 1 0 0 1 1-1h3M21 7V4a1 1 0 0 0-1-1h-3M3 17v3a1 1 0 0 0 1 1h3M21 17v3a1 1 0 0 1-1 1h-3" />
          <path d="M7 12h10" />
        </svg>
        <span>Scan to deliver to customer</span>
      </button>

      <div class="section-heading">
        <h2>Deliveries To Make</h2>
        <a href="#" class="history-link" @click.prevent="router.push({ name: 'delivery-history' })">Delivery History</a>
      </div>

      <p v-if="loading" class="hint">Loading…</p>
      <p v-else-if="error" class="hint error">{{ error }}</p>

      <ul v-else class="order-list">
        <li v-for="item in filteredDeliveryItems" :key="item.id" class="order-card">
          <div class="order-top">
            <div class="order-thumb">
              <img v-if="deliveryThumb(item)" :src="deliveryThumb(item)" alt="" @error="onThumbError(item.id)" />
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <rect x="7" y="6" width="6" height="6" rx="1" /><path d="M7 15h4M7 18h7" />
              </svg>
            </div>
            <div class="order-main">
              <p class="order-customer">{{ deliveryCustomer(item) }}</p>
              <div class="order-status">
                <button
                  type="button"
                  class="toggle"
                  :class="{ on: item.onRoute }"
                  role="switch"
                  :aria-checked="!!item.onRoute"
                  aria-label="Toggle en route"
                  @click="toggleEnRoute(item)"
                >
                  <span class="toggle-knob"></span>
                </button>
                <span>En Route</span>
              </div>
            </div>
            <div class="order-side">
              <a href="#" class="order-code" @click.prevent="viewDetail(item)">{{ deliveryCode(item) }}</a>
              <p class="order-amount">{{ formatUSD(deliveryAmount(item)) }}</p>
            </div>
          </div>

          <div class="order-actions">
            <a class="action-item" :href="deliveryMapUrl(item)" target="_blank" rel="noopener" aria-label="Map">
              <span class="action-icon map">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" />
                </svg>
              </span>
            </a>
            <a class="action-item" :href="`tel:${deliveryPhone(item)}`" aria-label="Call">
              <span class="action-icon call">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
                </svg>
              </span>
            </a>
            <a class="action-item" href="#" @click.prevent aria-label="Message">
              <span class="action-icon message">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20l1.3-3.9a8.4 8.4 0 0 1-1.2-4.4A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
                </svg>
              </span>
            </a>
          </div>
        </li>
      </ul>
      <p v-if="!loading && !error && !deliveryItems.length" class="empty-hint">No deliveries right now.</p>
      <p v-else-if="!loading && !error && !filteredDeliveryItems.length" class="empty-hint">No deliveries match that phone number.</p>
    </main>

    <p v-if="scanMessage" class="scan-toast" :class="scanMessageType">{{ scanMessage }}</p>

    <ScanQRCodeModal
      v-if="showScan"
      title="Scan to Deliver"
      hint="Align the parcel's QR code within frame to scan"
      @scan="onQrScanned"
      @close="showScan = false"
    />
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 20px 90px;
  background: var(--green);
  border-radius: 0 0 32px 32px;
}
.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  width: 88px;
  height: 88px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  margin-bottom: 14px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid var(--line);
  color: var(--muted);
}
.search-bar svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.search-bar input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--ink);
  font: 500 16px var(--sans); /* iOS Safari auto-zooms on focus if an input's font-size is under 16px */
}
.search-bar input::placeholder {
  color: var(--muted);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-heading h2 {
  margin: 0;
  font: 700 0.9rem var(--sans);
  color: var(--ink);
}
.history-link {
  color: var(--green);
  font: 700 0.78rem var(--sans);
  text-decoration: underline;
}

.order-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.order-card {
  border-radius: 18px;
  background: var(--wash);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}
.order-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 14px 12px;
}
.order-thumb {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--muted);
}
.order-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.order-thumb svg {
  width: 24px;
  height: 24px;
}
.order-main {
  flex: 1;
  min-width: 0;
}
.order-customer {
  margin: 0 0 8px;
  font: 700 0.9rem var(--sans);
  color: var(--ink);
}
.order-side {
  flex-shrink: 0;
  min-width: 0;
  max-width: 120px;
  text-align: right;
}
.order-code {
  display: block;
  overflow: hidden;
  color: var(--ink);
  font: 700 0.85rem var(--sans);
  text-decoration: underline;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-amount {
  margin: 2px 0 0;
  color: var(--green);
  font: 700 0.9rem var(--heading);
}
.order-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink);
  font-size: 0.8rem;
  white-space: nowrap;
}
.toggle {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 20px;
  padding: 2px;
  border: none;
  border-radius: 999px;
  background: var(--line);
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.toggle.on {
  background: var(--green);
}
.toggle-knob {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s ease;
}
.toggle.on .toggle-knob {
  transform: translateX(16px);
}
.order-actions {
  display: flex;
  border-top: 1px solid #fff;
  padding: 10px 6px;
}
.action-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 4px 6px;
  color: var(--muted);
  font: 600 0.68rem var(--sans);
  text-decoration: none;
}
.action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
.action-icon svg {
  width: 17px;
  height: 17px;
}
.action-icon.map {
  color: #e0433b;
}
.action-icon.call,
.action-icon.message {
  color: var(--green);
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
