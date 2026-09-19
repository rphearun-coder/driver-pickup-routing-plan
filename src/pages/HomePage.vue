<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getMyProfile } from '../api/users.ts';
import { getDriverDashboard, thisMonthRange, thisWeekRange, todayRange, type DateRange } from '../api/dashboard.ts';
import { getUserNotifications } from '../api/notifications.ts';
import { getMyDailyCodSettlement, type DailyCodSettlement } from '../api/cod-settlement.ts';
import { useDriverPresence } from '../composables/useDriverPresence';
import { useMobileInteraction } from '../composables/useMobileInteraction';
import BrandLogo from '../components/BrandLogo.vue';
import QrCodeCard from '../components/QrCodeCard.vue';
import CodSettlementSheet from '../components/CodSettlementSheet.vue';
import type { AuthenticatedUser, DriverDashboardSummary } from '../types/api.ts';

const router = useRouter();

const profile = ref<AuthenticatedUser | null>(null);
const stats = ref<DriverDashboardSummary | null>(null);
const statsError = ref('');
const statsLoading = ref(true);
const showQr = ref(false);
const unreadCount = ref(0);
const settlement = ref<DailyCodSettlement | null>(null);
const showSettlementSheet = ref(false);

// useDriverPresence is a singleton keyed off useAuth()'s bridged driver session
// (see composables/useDriverPresence.ts), so this reads/drives the same online
// state as every other page instead of needing a separate DriverPanel sign-in.
const { isOnline, isSyncing: isTogglingOnline, toggleOnline } = useDriverPresence();

const RANGE_OPTIONS = [
  { key: 'today', label: 'Today', range: todayRange },
  { key: 'week', label: 'This Week', range: thisWeekRange },
  { key: 'month', label: 'This Month', range: thisMonthRange },
] as const;

const selectedRangeKey = ref<(typeof RANGE_OPTIONS)[number]['key']>('today');
const showRangeMenu = ref(false);

useMobileInteraction(() => {
  showQr.value = false;
  showSettlementSheet.value = false;
  showRangeMenu.value = false;
});

const selectedRangeLabel = computed(
  () => RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.label ?? 'Today',
);

function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

const legend = computed(() => [
  { label: 'Pending', color: '#f4a340', value: stats.value?.totalRemainingDelivery ?? 0 },
  { label: 'Success', color: '#21a366', value: stats.value?.totalDeliverySuccess ?? 0 },
  { label: 'Failed', color: '#e0433b', value: stats.value?.totalDeliveryFailed ?? 0 },
  { label: 'Be Return', color: '#d4c62a', value: stats.value?.totalBeReturn ?? 0 },
  { label: 'Return', color: '#f2994a', value: stats.value?.totalReturn ?? 0 },
]);

const legendTotal = computed(() => legend.value.reduce((sum, item) => sum + item.value, 0));

const ringStyle = computed(() => {
  if (legendTotal.value === 0) return { background: 'var(--line)' };
  let cumulative = 0;
  const stops = legend.value.map((item) => {
    const start = (cumulative / legendTotal.value) * 360;
    cumulative += item.value;
    const end = (cumulative / legendTotal.value) * 360;
    return `${item.color} ${start}deg ${end}deg`;
  });
  return { background: `conic-gradient(${stops.join(', ')})` };
});

async function loadStats(range: DateRange) {
  statsLoading.value = true;
  statsError.value = '';
  try {
    stats.value = await getDriverDashboard(range);
  } catch (err: any) {
    statsError.value = err.message ?? 'Failed to load stats';
  } finally {
    statsLoading.value = false;
  }
}

function selectRange(option: (typeof RANGE_OPTIONS)[number]) {
  selectedRangeKey.value = option.key;
  showRangeMenu.value = false;
  loadStats(option.range());
}

const settlementCodText = computed(() => {
  const s = settlement.value;
  if (!s) return '';
  return `$${(s.totalCodUsd ?? 0).toFixed(2)} and ${Math.round(s.totalCodKhr ?? 0)}៛`;
});
const settlementPaywayText = computed(() => `$${(settlement.value?.requestedAmount ?? 0).toFixed(2)}`);
const settlementTransferText = computed(
  () => `$${(settlement.value?.settledAmount ?? settlement.value?.totalCodUsd ?? 0).toFixed(2)}`,
);
// Drivers can only confirm a settlement Operation has already queued for them —
// there's no self-service "create" mutation on the backend yet.
const canRequestSettlement = computed(() => !!settlement.value?.id && settlement.value?.status === 'PENDING');

async function loadSettlement() {
  try {
    settlement.value = await getMyDailyCodSettlement();
  } catch {
    settlement.value = null;
  }
}

function onSettlementSubmitted() {
  showSettlementSheet.value = false;
  loadSettlement();
}

onMounted(async () => {
  try {
    profile.value = await getMyProfile();
  } catch {
    profile.value = null;
  }
  try {
    const { results } = await getUserNotifications();
    unreadCount.value = results.filter((item) => !item.isRead).length;
  } catch {
    unreadCount.value = 0;
  }
  loadStats(todayRange());
  loadSettlement();
});
</script>

<template>
  <div class="home-page">
    <header class="home-header">
      <div class="header-top">
        <div class="header-brand">
          <BrandLogo :size="38" />
          <span class="brand-text">
            <strong>Jalat</strong>
            <em>Logistic</em>
          </span>
        </div>
        <div class="header-actions">
          <button
            type="button"
            class="status-switch-track"
            :class="{ 'is-online': isOnline }"
            :aria-pressed="isOnline"
            :disabled="isTogglingOnline"
            aria-label="Toggle online status"
            @click="toggleOnline"
          >
            <span class="status-switch-label">{{ isOnline ? 'On' : 'Off' }}</span>
            <span class="status-switch-knob">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
              </svg>
            </span>
          </button>
          <button type="button" class="icon-btn" aria-label="Notifications" @click="router.push({ name: 'notifications' })">
            <span v-if="unreadCount > 0" class="badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </button>
          <button type="button" aria-label="Show my QR code" @click="showQr = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <div class="stat-card header-stat-card">
      <div class="stat-col">
        <span class="stat-number accent-green">{{ formatUSD(stats?.collectionTotalCodUSD ?? 0) }}</span>
        <span class="stat-label">Income</span>
      </div>
      <div class="stat-col">
        <span class="stat-number">{{ stats?.totalDeliveryParcel ?? 0 }}</span>
        <span class="stat-label">Orders</span>
      </div>
      <div class="stat-col">
        <span class="stat-number">{{ stats?.totalDeliverySuccess ?? 0 }}</span>
        <span class="stat-label">Delivered</span>
      </div>
    </div>

    <main class="home-body">
      <div class="settlement-card">
        <div class="settlement-header">
          <span class="settlement-icon">$</span>
          <h2>Settlement</h2>
          <a href="#" class="history-link" @click.prevent="router.push({ name: 'settlement-history' })">History</a>
        </div>

        <div v-if="settlement" class="settlement-body">
          <div class="settlement-row">
            <span>COD to transfer</span>
            <strong>{{ settlementCodText }}</strong>
          </div>
          <div class="settlement-row muted">
            <span>PayWay total</span>
            <strong>{{ settlementPaywayText }}</strong>
          </div>
          <div class="settlement-divider"></div>
          <div class="settlement-row total">
            <span>Money to transfer</span>
            <strong>{{ settlementTransferText }}</strong>
          </div>
        </div>
        <p v-else class="hint">Loading...</p>

        <button
          type="button"
          class="settlement-btn"
          :disabled="!canRequestSettlement"
          @click="showSettlementSheet = true"
        >
          Request Settlement
        </button>
      </div>

      <button type="button" class="map-card" @click="router.push({ name: 'pickup-map' })">
        <span class="map-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" />
          </svg>
        </span>
        <span class="map-text">
          <strong>Live Map</strong>
          <span>Track pickups and go online</span>
        </span>
        <svg class="map-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      <div class="section-heading">
        <h2>Delivery Summary</h2>
        <div class="range-picker">
          <button type="button" class="range-btn" @click="showRangeMenu = !showRangeMenu">
            {{ selectedRangeLabel }}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <ul v-if="showRangeMenu" class="range-menu">
            <li v-for="option in RANGE_OPTIONS" :key="option.key">
              <button type="button" @click="selectRange(option)">{{ option.label }}</button>
            </li>
          </ul>
        </div>
      </div>

      <div class="stat-grid-card">
        <div class="stat-col">
          <span class="stat-number accent-red">{{ stats?.totalRemainingDelivery ?? 0 }}</span>
          <span class="stat-label">Pending</span>
        </div>
        <div class="stat-col">
          <span class="stat-number">{{ stats?.totalDeliveryParcel ?? 0 }}</span>
          <span class="stat-label">Total Parcels</span>
        </div>
        <div class="stat-col">
          <span class="stat-number accent-orange">{{ stats?.totalBeReturn ?? 0 }}</span>
          <span class="stat-label">Be Return</span>
        </div>
        <div class="stat-col">
          <span class="stat-number">{{ stats?.totalReturn ?? 0 }}</span>
          <span class="stat-label">Return</span>
        </div>
        <div class="stat-col">
          <span class="stat-number">{{ stats?.totalDeliverySuccess ?? 0 }}</span>
          <span class="stat-label">Success</span>
        </div>
        <div class="stat-col">
          <span class="stat-number">{{ stats?.totalDeliveryFailed ?? 0 }}</span>
          <span class="stat-label">Failed</span>
        </div>
      </div>

      <div class="chart-card">
        <div class="ring" :style="ringStyle">
          <div class="ring-hole"></div>
        </div>
        <ul class="legend">
          <li v-for="item in legend" :key="item.label">
            <span class="dot" :style="{ background: item.color }"></span>
            {{ item.label }}: {{ item.value }}
          </li>
        </ul>
      </div>

      <p v-if="statsLoading" class="hint">Loading...</p>
      <p v-if="statsError" class="hint error">{{ statsError }}</p>
    </main>

    <QrCodeCard v-if="showQr" :profile="profile" @close="showQr = false" />
    <CodSettlementSheet
      v-if="showSettlementSheet && settlement"
      :settlement="settlement"
      @close="showSettlementSheet = false"
      @submitted="onSettlementSubmitted"
    />
  </div>
</template>

<style scoped>
.home-header {
  padding: 24px 20px 90px;
  background: var(--green);
  border-radius: 0 0 32px 32px;
}
.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.header-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #000;
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
  font: 600 0.64rem var(--sans);
  font-style: normal;
  opacity: 0.7;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-actions button {
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
.header-actions svg {
  width: 18px;
  height: 18px;
}
.icon-btn {
  position: relative;
}
/* The switch track itself. Offline = white fill with a red border, online =
   solid green — same red/green meaning as before. Padding leaves clear space
   for the knob on whichever side it currently sits, so the label (flex: 1)
   fills the remaining room and aligns away from it. Qualified with
   ".header-actions button" (not just ".status-switch-track") to out-specificity
   the generic ".header-actions button" rule above, which would otherwise win
   and silently override this background — the bug that bit the old pill. */
.header-actions button.status-switch-track {
  position: relative;
  display: flex;
  align-items: center;
  width: 68px;
  height: 34px;
  padding: 0 8px 0 34px;
  border: none;
  border-radius: 999px;
  background: var(--orange);
  cursor: pointer;
  transition: padding 0.2s ease;
}
.header-actions button.status-switch-track:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.header-actions button.status-switch-track.is-online {
  padding: 0 34px 0 8px;
}
.status-switch-label {
  flex: 1;
  min-width: 0;
  text-align: right;
  color: #000;
  font: 700 0.72rem var(--sans);
  white-space: nowrap;
}
.status-switch-track.is-online .status-switch-label {
  text-align: left;
}
/* Knob slides from the left (offline) to the right (online) edge of the
   track. Track is solid orange and the knob's icon matches it in both
   states — only the label word and knob position carry the on/off meaning. */
.status-switch-knob {
  position: absolute;
  top: 4px;
  left: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  color: var(--orange);
  transition: transform 0.2s ease;
}
.status-switch-track.is-online .status-switch-knob {
  transform: translateX(34px);
}
.status-switch-knob svg {
  width: 12px;
  height: 13px;
}
.badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #e0433b;
  color: #fff;
  font: 700 0.6rem var(--sans);
  border: 2px solid var(--green);
}
.home-body {
  padding: 32px 16px 40px;
  max-width: 480px;
  margin: 0 auto;
}
.settlement-card {
  padding: 20px;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
  margin-bottom: 20px;
}
.settlement-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.settlement-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--wash);
  color: var(--green);
  font: 700 1rem var(--heading);
}
.settlement-header h2 {
  flex: 1;
  margin: 0;
  font: 700 1rem var(--heading);
  color: var(--ink);
}
.history-link {
  flex-shrink: 0;
  color: var(--green);
  font: 700 0.78rem var(--sans);
  text-decoration: underline;
}
.settlement-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  color: var(--ink);
  font: 500 0.85rem var(--sans);
}
.settlement-row.muted {
  color: var(--muted);
}
.settlement-row.total strong {
  color: var(--green);
  font: 700 1.15rem var(--heading);
}
.settlement-divider {
  height: 1px;
  margin: 10px 0;
  background: var(--line);
}
.settlement-btn {
  width: 100%;
  margin-top: 16px;
  padding: 15px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 0.95rem var(--sans);
  cursor: pointer;
}
.settlement-btn:disabled {
  background: #a9d9c1;
  cursor: not-allowed;
}
.map-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 16px 18px;
  border: none;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
  margin-bottom: 20px;
  cursor: pointer;
  text-align: left;
}
.map-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--wash);
  color: var(--green);
}
.map-icon svg {
  width: 22px;
  height: 22px;
}
.map-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.map-text strong {
  font: 700 0.92rem var(--sans);
  color: var(--ink);
}
.map-text span {
  font-size: 0.78rem;
  color: var(--muted);
}
.map-chevron {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: var(--muted);
}
.stat-card {
  display: flex;
  align-items: center;
  padding: 20px 12px;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
  margin-bottom: 20px;
}
.stat-grid-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  row-gap: 20px;
  padding: 20px 12px;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
  margin-bottom: 20px;
}
.header-stat-card {
  width: calc(100% - 40px);
  max-width: 440px;
  margin: -58px auto 0;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}
.stat-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.stat-divider {
  width: 1px;
  align-self: stretch;
  background: var(--line);
}
.stat-number {
  font: 700 1.4rem var(--heading);
  color: var(--ink);
}
.stat-number.accent-red {
  color: #e0433b;
}
.stat-number.accent-orange {
  color: var(--orange);
}
.stat-number.accent-green {
  color: var(--green);
}
.stat-label {
  color: var(--muted);
  font-size: 0.8rem;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-heading h2 {
  font: 700 1rem var(--heading);
  color: var(--green);
  margin: 0;
}
.range-picker {
  position: relative;
}
.range-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--wash);
  color: var(--ink);
  font: 700 0.75rem var(--sans);
  cursor: pointer;
}
.range-btn svg {
  width: 14px;
  height: 14px;
}
.range-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 10;
  list-style: none;
  margin: 0;
  padding: 6px;
  min-width: 130px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
}
.range-menu button {
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  font: 500 0.82rem var(--sans);
  text-align: left;
  cursor: pointer;
}
.range-menu button:hover {
  background: var(--wash);
}
.hint {
  text-align: center;
  color: var(--muted);
  margin-top: 8px;
}
.hint.error {
  color: #e33;
}
.chart-card {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 20px;
  padding: 20px 16px;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}
.ring {
  flex-shrink: 0;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
@media (max-width: 360px) {
  .ring {
    width: 130px;
    height: 130px;
  }
  .legend {
    font-size: 0.78rem;
  }
}
.ring-hole {
  width: 62%;
  height: 62%;
  border-radius: 50%;
  background: var(--bg, #faf7f1);
}
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--ink);
  font-size: 0.82rem;
  text-align: left;
}
.legend li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}
</style>
