<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getMyProfile } from '../api/users.ts';
import { DATE_RANGE_OPTIONS, getDriverDashboard, todayRange, type DateRangeKey } from '../api/dashboard.ts';
import { getUserNotifications } from '../api/notifications.ts';
import { getMyDailyCodSettlement, type DailyCodSettlement } from '../api/cod-settlement.ts';
import { getOrderListByUser } from '../api/pickup-orders';
import { resolveParcelImageUrl } from '../api/parcels';
import { useDriverPresence } from '../composables/useDriverPresence';
import { useMobileInteraction } from '../composables/useMobileInteraction';
import { avatarColor, avatarInitials } from '../lib/avatar';
import BrandHeader from '../components/BrandHeader.vue';
import HeaderIconButton from '../components/HeaderIconButton.vue';
import RangePicker from '../components/RangePicker.vue';
import StateBlock from '../components/StateBlock.vue';
import QrCodeCard from '../components/QrCodeCard.vue';
import CodSettlementSheet from '../components/CodSettlementSheet.vue';
import type { AuthenticatedUser, DriverDashboardSummary } from '../types/api.ts';

const router = useRouter();
const route = useRoute();

const profile = ref<AuthenticatedUser | null>(null);
const stats = ref<DriverDashboardSummary | null>(null);
const statsError = ref('');
const statsLoading = ref(true);
const showQr = ref(false);
const unreadCount = ref(0);
const pickupsToDo = ref<number | null>(null);
const settlement = ref<DailyCodSettlement | null>(null);
const settlementLoading = ref(true);
const settlementError = ref('');
const showSettlementSheet = ref(false);
const selectedRangeKey = ref<DateRangeKey>('today');
const rangePicker = ref<InstanceType<typeof RangePicker> | null>(null);

// useDriverPresence is a singleton keyed off useAuth()'s bridged driver session
// (see composables/useDriverPresence.ts), so this reads/drives the same online
// state as every other page instead of needing a separate DriverPanel sign-in.
const { isOnline, isSyncing: isTogglingOnline, toggleOnline } = useDriverPresence();

useMobileInteraction(() => {
  showQr.value = false;
  showSettlementSheet.value = false;
  rangePicker.value?.close();
});

function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// ---- Greeting ----
const displayName = computed(() => profile.value?.fullName || profile.value?.username || 'Driver');
const firstName = computed(() => displayName.value.split(/\s+/)[0]);
const avatarUrl = computed(() => resolveParcelImageUrl(profile.value?.avatar));
const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
});
const rangeLabel = computed(
  () => DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.label ?? 'Today',
);

// ---- Delivery summary (ring + legend) ----
// Colours come from the theme so the ring matches badges elsewhere in the app.
const legend = computed(() => [
  { key: 'pending', label: 'Pending', color: 'var(--orange)', value: stats.value?.totalRemainingDelivery ?? 0 },
  { key: 'success', label: 'Delivered', color: 'var(--green)', value: stats.value?.totalDeliverySuccess ?? 0 },
  { key: 'failed', label: 'Failed', color: 'var(--red)', value: stats.value?.totalDeliveryFailed ?? 0 },
  { key: 'be-return', label: 'Be return', color: 'var(--blue)', value: stats.value?.totalBeReturn ?? 0 },
  { key: 'return', label: 'Returned', color: 'var(--faint)', value: stats.value?.totalReturn ?? 0 },
]);
const legendTotal = computed(() => legend.value.reduce((sum, item) => sum + item.value, 0));

function percent(value: number): string {
  return legendTotal.value ? `${Math.round((value / legendTotal.value) * 100)}%` : '0%';
}

const ringStyle = computed(() => {
  if (legendTotal.value === 0) return { background: 'var(--track)' };
  let cumulative = 0;
  const stops = legend.value.map((item) => {
    const start = (cumulative / legendTotal.value) * 360;
    cumulative += item.value;
    const end = (cumulative / legendTotal.value) * 360;
    return `${item.color} ${start}deg ${end}deg`;
  });
  return { background: `conic-gradient(${stops.join(', ')})` };
});

const successRate = computed(() => {
  const done = (stats.value?.totalDeliverySuccess ?? 0) + (stats.value?.totalDeliveryFailed ?? 0);
  return done ? Math.round(((stats.value?.totalDeliverySuccess ?? 0) / done) * 100) : null;
});

async function loadStats(): Promise<void> {
  statsLoading.value = true;
  statsError.value = '';
  try {
    const range = DATE_RANGE_OPTIONS.find((option) => option.key === selectedRangeKey.value)?.range() ?? todayRange();
    stats.value = await getDriverDashboard(range);
  } catch (err: any) {
    statsError.value = err.message ?? 'Failed to load stats';
  } finally {
    statsLoading.value = false;
  }
}

function selectRange(key: DateRangeKey): void {
  selectedRangeKey.value = key;
  loadStats();
}

// Today's pickups still to do (IN_PROGRESS / ON_ROUTE — the list's default), for the shortcut badge.
async function loadPickupsToDo(): Promise<void> {
  try {
    const data = await getOrderListByUser(todayRange(), 1, 0);
    pickupsToDo.value = data.metadata.total;
  } catch {
    pickupsToDo.value = null;
  }
}

const shortcuts = computed(() => [
  { name: 'pickups', label: 'Pickups', hint: 'to pick up', count: pickupsToDo.value, tone: 'orange', icon: 'M3 7l9-4 9 4-9 4-9-4ZM3 7v10l9 4 9-4V7M12 11v10' },
  { name: 'deliveries', label: 'Deliveries', hint: 'to deliver', count: stats.value?.totalRemainingDelivery ?? null, tone: 'green', icon: 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z' },
  { name: 'returns', label: 'Returns', hint: 'to return', count: stats.value?.totalBeReturn ?? null, tone: 'blue', icon: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3' },
  { name: 'pickup-map', label: 'Live Map', hint: 'track & go online', count: null, tone: 'ink', icon: 'M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
]);

// ---- Settlement ----
const settlementCodText = computed(() => {
  const s = settlement.value;
  if (!s) return '';
  const khr = Math.round(s.totalCodKhr ?? 0);
  return `${formatUSD(s.totalCodUsd ?? 0)}${khr ? ` + ${khr.toLocaleString()}៛` : ''}`;
});
const settlementPaywayText = computed(() => formatUSD(settlement.value?.requestedAmount ?? 0));
const settlementTransferText = computed(() =>
  formatUSD(settlement.value?.settledAmount ?? settlement.value?.totalCodUsd ?? 0),
);
// Drivers can only confirm a settlement Operation has already queued for them —
// there's no self-service "create" mutation on the backend yet.
const canRequestSettlement = computed(() => !!settlement.value?.id && settlement.value?.status === 'PENDING');

const SETTLEMENT_STATUS: Record<string, { label: string; tone: string; hint: string }> = {
  PENDING: { label: 'Ready to settle', tone: 'orange', hint: 'Transfer the money, then send the receipt.' },
  SUBMITTED: { label: 'Waiting for approval', tone: 'blue', hint: 'The COD team is checking your transfer.' },
  APPROVED: { label: 'Approved', tone: 'green', hint: 'This settlement is complete.' },
  REJECTED: { label: 'Rejected', tone: 'red', hint: 'Check Settlement History for the reason.' },
};
const settlementStatus = computed(() => {
  const s = settlement.value;
  if (!s?.id) return { label: 'Nothing to settle', tone: 'neutral', hint: 'Operation hasn’t queued a settlement for you yet.' };
  return SETTLEMENT_STATUS[s.status ?? ''] ?? { label: s.status ?? 'Unknown', tone: 'neutral', hint: '' };
});

async function loadSettlement(): Promise<void> {
  settlementLoading.value = true;
  settlementError.value = '';
  try {
    settlement.value = await getMyDailyCodSettlement();
  } catch (err: any) {
    settlement.value = null;
    settlementError.value = err.message ?? 'Failed to load settlement';
  } finally {
    settlementLoading.value = false;
  }
}

function onSettlementSubmitted(): void {
  showSettlementSheet.value = false;
  loadSettlement();
}

onMounted(async () => {
  loadStats();
  // Settlement History's "Send receipt" links here with ?settle=1 to open the sheet.
  loadSettlement().then(() => {
    if (route.query.settle && canRequestSettlement.value) showSettlementSheet.value = true;
    if (route.query.settle) router.replace({ query: {} });
  });
  loadPickupsToDo();
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
});
</script>

<template>
  <div class="home-page">
    <BrandHeader>
      <button
        type="button"
        class="online-switch"
        :class="{ 'is-online': isOnline }"
        :aria-pressed="isOnline"
        :disabled="isTogglingOnline"
        aria-label="Toggle online status"
        @click="toggleOnline"
      >
        <span class="online-label">{{ isOnline ? 'On' : 'Off' }}</span>
        <span class="online-knob">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
          </svg>
        </span>
      </button>
      <HeaderIconButton label="Notifications" @click="router.push({ name: 'notifications' })">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <span v-if="unreadCount > 0" class="bell-badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
      </HeaderIconButton>
      <HeaderIconButton label="Show my QR code" @click="showQr = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </HeaderIconButton>
    </BrandHeader>

    <section class="hero-card">
      <div class="hero-top">
        <span class="avatar" :style="!avatarUrl ? { background: avatarColor(displayName) } : undefined">
          <img v-if="avatarUrl" :src="avatarUrl" alt="" />
          <template v-else>{{ avatarInitials(displayName) || '?' }}</template>
        </span>
        <div class="hero-greeting">
          <p class="greeting">{{ greeting }},</p>
          <p class="name">{{ firstName }}</p>
        </div>
        <span class="presence" :class="{ online: isOnline }">
          <span class="presence-dot"></span>
          {{ isOnline ? 'Online' : 'Offline' }}
        </span>
      </div>
      <p v-if="!isOnline" class="presence-hint">You're offline — switch On to share your location and get jobs.</p>

      <div class="hero-stats">
        <div class="hero-stat income">
          <span class="hero-label">COD collected · {{ rangeLabel.toLowerCase() }}</span>
          <strong class="hero-value">{{ statsLoading && !stats ? '–' : formatUSD(stats?.collectionTotalCodUSD ?? 0) }}</strong>
        </div>
        <div class="hero-stat">
          <span class="hero-label">Parcels</span>
          <strong class="hero-value small">{{ stats?.totalDeliveryParcel ?? 0 }}</strong>
        </div>
        <div class="hero-stat">
          <span class="hero-label">Delivered</span>
          <strong class="hero-value small">{{ stats?.totalDeliverySuccess ?? 0 }}</strong>
        </div>
      </div>
    </section>

    <main class="home-body">
      <nav class="shortcuts" aria-label="Shortcuts">
        <button
          v-for="item in shortcuts"
          :key="item.name"
          type="button"
          class="shortcut"
          :class="item.tone"
          @click="router.push({ name: item.name })"
        >
          <span class="shortcut-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path :d="item.icon" />
            </svg>
            <span v-if="item.count" class="shortcut-badge">{{ item.count > 99 ? '99+' : item.count }}</span>
          </span>
          <span class="shortcut-label">{{ item.label }}</span>
          <span class="shortcut-hint">{{ item.count != null ? `${item.count} ${item.hint}` : item.hint }}</span>
        </button>
      </nav>

      <section class="card settlement-card">
        <div class="card-head">
          <span class="card-icon green" aria-hidden="true">$</span>
          <h2>Settlement</h2>
          <a href="#" class="card-link" @click.prevent="router.push({ name: 'settlement-history' })">History</a>
        </div>

        <div v-if="settlementLoading" class="sk-block" aria-hidden="true">
          <span class="sk sk-line"></span><span class="sk sk-line"></span><span class="sk sk-line short"></span>
        </div>
        <div v-else-if="settlementError" class="inline-error">
          <span>{{ settlementError }}</span>
          <button type="button" @click="loadSettlement">Retry</button>
        </div>
        <template v-else>
          <div class="status-row">
            <span class="status-chip" :class="settlementStatus.tone">{{ settlementStatus.label }}</span>
            <span v-if="settlementStatus.hint" class="status-hint">{{ settlementStatus.hint }}</span>
          </div>
          <div v-if="settlement" class="settlement-rows">
            <div class="settlement-row">
              <span>COD to transfer</span>
              <strong>{{ settlementCodText }}</strong>
            </div>
            <div class="settlement-row muted">
              <span>PayWay total</span>
              <strong>{{ settlementPaywayText }}</strong>
            </div>
            <div class="settlement-row total">
              <span>Money to transfer</span>
              <strong>{{ settlementTransferText }}</strong>
            </div>
          </div>
          <button type="button" class="settlement-btn" :disabled="!canRequestSettlement" @click="showSettlementSheet = true">
            {{ settlement?.status === 'SUBMITTED' ? 'Submitted — waiting' : 'Request Settlement' }}
          </button>
        </template>
      </section>

      <section class="card summary-card">
        <div class="card-head">
          <span class="card-icon blue" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v9l7 4" /><circle cx="12" cy="12" r="9" />
            </svg>
          </span>
          <h2>Delivery summary</h2>
          <RangePicker ref="rangePicker" class="summary-range" :model-value="selectedRangeKey" @update:model-value="selectRange" />
        </div>

        <StateBlock
          v-if="statsError && !stats"
          tone="error"
          title="Couldn't load the summary"
          :text="statsError"
          action-label="Try again"
          @action="loadStats"
        />
        <div v-else class="chart" :class="{ loading: statsLoading }">
          <div class="ring" :style="ringStyle">
            <div class="ring-hole">
              <strong>{{ legendTotal }}</strong>
              <span>parcels</span>
            </div>
          </div>
          <ul class="legend">
            <li v-for="item in legend" :key="item.key">
              <span class="dot" :style="{ background: item.color }"></span>
              <span class="legend-label">{{ item.label }}</span>
              <strong class="legend-value">{{ item.value }}</strong>
              <span class="legend-pct">{{ percent(item.value) }}</span>
            </li>
          </ul>
        </div>
        <p v-if="successRate != null && !statsError" class="rate">
          <span class="rate-bar"><span class="rate-fill" :style="{ width: `${successRate}%` }"></span></span>
          <span><strong>{{ successRate }}%</strong> success rate {{ rangeLabel.toLowerCase() }}</span>
        </p>
        <p v-if="statsError && stats" class="inline-error">
          <span>{{ statsError }}</span>
          <button type="button" @click="loadStats">Retry</button>
        </p>
      </section>
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
.home-page {
  min-height: 100%;
  padding-bottom: 24px;
  background: var(--page);
}

/* ---- Online switch (orange track; label + knob position carry on/off) ---- */
.online-switch {
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
.online-switch:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.online-switch.is-online {
  padding: 0 34px 0 8px;
}
.online-label {
  flex: 1;
  min-width: 0;
  color: #000;
  font: 700 0.72rem var(--sans);
  text-align: right;
  white-space: nowrap;
}
.online-switch.is-online .online-label {
  text-align: left;
}
.online-knob {
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
.online-switch.is-online .online-knob {
  transform: translateX(34px);
}
.online-knob svg {
  width: 12px;
  height: 13px;
}
.bell-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border: 2px solid var(--green);
  border-radius: 999px;
  background: var(--red);
  color: #fff;
  font: 700 0.6rem/13px var(--sans);
  text-align: center;
}

/* ---- Hero ---- */
.hero-card {
  width: calc(100% - 32px);
  max-width: 448px;
  margin: -70px auto 0;
  padding: 16px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(17, 24, 39, 0.08);
}
.hero-top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  overflow: hidden;
  color: #fff;
  font: 800 1rem var(--sans);
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero-greeting {
  flex: 1;
  min-width: 0;
}
.greeting {
  margin: 0;
  color: var(--muted);
  font: 500 0.8rem var(--sans);
}
.name {
  margin: 0;
  overflow: hidden;
  color: var(--ink);
  font: 800 1.15rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.presence {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--fill);
  color: var(--muted);
  font: 700 0.72rem var(--sans);
}
.presence.online {
  background: var(--green-soft);
  color: var(--green-strong);
}
.presence-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--faint);
}
.presence.online .presence-dot {
  background: var(--green);
  animation: pulse 1.8s infinite;
}
.presence-hint {
  margin: 10px 0 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--orange-soft);
  color: var(--orange-deep);
  font: 600 0.76rem var(--sans);
}
.hero-stats {
  display: grid;
  grid-template-columns: 1.6fr 1fr 1fr;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--divider);
}
.hero-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 0 8px;
}
.hero-stat:first-child {
  padding-left: 0;
}
.hero-stat + .hero-stat {
  border-left: 1px solid var(--divider);
}
.hero-label {
  overflow: hidden;
  color: var(--muted);
  font: 600 0.68rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hero-value {
  color: var(--ink);
  font: 800 1.1rem var(--sans);
}
.hero-stat.income .hero-value {
  color: var(--green-strong);
  font-size: 1.35rem;
}

/* ---- Body ---- */
.home-body {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px 16px 8px;
}
.shortcuts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.shortcut {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 12px 4px 10px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: #fff;
  font: inherit;
  cursor: pointer;
  transition: transform 0.1s ease;
}
.shortcut:active {
  transform: scale(0.97);
}
.shortcut-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
}
.shortcut-icon svg {
  width: 22px;
  height: 22px;
}
.shortcut.orange .shortcut-icon {
  background: var(--orange-soft);
  color: var(--orange);
}
.shortcut.green .shortcut-icon {
  background: var(--green-soft);
  color: var(--green);
}
.shortcut.blue .shortcut-icon {
  background: var(--blue-soft);
  color: var(--blue);
}
.shortcut.ink .shortcut-icon {
  background: var(--fill);
  color: var(--ink);
}
.shortcut-badge {
  position: absolute;
  top: -5px;
  right: -7px;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border: 2px solid #fff;
  border-radius: 999px;
  background: var(--red);
  color: #fff;
  font: 800 0.62rem/15px var(--sans);
  text-align: center;
}
.shortcut-label {
  color: var(--ink);
  font: 700 0.76rem var(--sans);
}
.shortcut-hint {
  max-width: 100%;
  overflow: hidden;
  color: var(--muted);
  font: 500 0.64rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card {
  margin-top: 14px;
  padding: 14px 16px 16px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(17, 24, 39, 0.05);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.card-head h2 {
  flex: 1;
  margin: 0;
  color: var(--ink);
  font: 700 1rem var(--sans);
}
.card-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  font: 800 1rem var(--sans);
}
.card-icon svg {
  width: 17px;
  height: 17px;
}
.card-icon.green {
  background: var(--green-soft);
  color: var(--green-strong);
}
.card-icon.blue {
  background: var(--blue-soft);
  color: var(--blue);
}
.card-link {
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 700 0.76rem var(--sans);
  text-decoration: none;
}

/* ---- Settlement ---- */
.status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin-bottom: 12px;
}
.status-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--fill);
  color: var(--text-3);
  font: 700 0.72rem var(--sans);
}
.status-chip.orange {
  background: var(--orange-soft);
  color: var(--orange-strong);
}
.status-chip.blue {
  background: var(--blue-soft);
  color: var(--blue-strong);
}
.status-chip.green {
  background: var(--green-soft);
  color: var(--green-strong);
}
.status-chip.red {
  background: var(--red-soft);
  color: var(--red-strong);
}
.status-hint {
  color: var(--muted);
  font: 500 0.76rem var(--sans);
}
.settlement-rows {
  padding: 4px 12px;
  border-radius: 12px;
  background: var(--page);
}
.settlement-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  color: var(--text-3);
  font: 500 0.84rem var(--sans);
}
.settlement-row + .settlement-row {
  border-top: 1px dashed var(--border-dashed);
}
.settlement-row strong {
  color: var(--ink);
  font: 700 0.9rem var(--sans);
  text-align: right;
}
.settlement-row.muted {
  color: var(--muted);
}
.settlement-row.total strong {
  color: var(--green-strong);
  font: 800 1.05rem var(--sans);
}
.settlement-btn {
  width: 100%;
  height: 48px;
  margin-top: 12px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 0.92rem var(--sans);
  cursor: pointer;
}
.settlement-btn:disabled {
  background: var(--fill-strong);
  color: var(--faint);
  cursor: not-allowed;
}

/* ---- Summary ---- */
.summary-range {
  flex-shrink: 0;
}
.chart {
  display: flex;
  align-items: center;
  gap: 18px;
  transition: opacity 0.2s ease;
}
.chart.loading {
  opacity: 0.5;
}
.ring {
  flex-shrink: 0;
  position: relative;
  width: 124px;
  height: 124px;
  border-radius: 50%;
}
.ring-hole {
  position: absolute;
  inset: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #fff;
}
.ring-hole strong {
  color: var(--ink);
  font: 800 1.5rem var(--sans);
  line-height: 1;
}
.ring-hole span {
  margin-top: 2px;
  color: var(--muted);
  font: 600 0.68rem var(--sans);
}
.legend {
  flex: 1;
  min-width: 0;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.legend li {
  display: grid;
  grid-template-columns: 10px 1fr auto 36px;
  align-items: center;
  gap: 8px;
  font: 500 0.8rem var(--sans);
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.legend-label {
  overflow: hidden;
  color: var(--text-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.legend-value {
  color: var(--ink);
  font-weight: 800;
}
.legend-pct {
  color: var(--faint);
  font-size: 0.72rem;
  text-align: right;
}
.rate {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0 0;
  color: var(--muted);
  font: 500 0.78rem var(--sans);
}
.rate strong {
  color: var(--green-strong);
}
.rate-bar {
  flex: 1;
  max-width: 120px;
  height: 7px;
  border-radius: 999px;
  background: var(--track);
  overflow: hidden;
}
.rate-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--green);
}
.inline-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 10px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--red-soft);
  color: var(--red-strong);
  font: 600 0.8rem var(--sans);
}
.inline-error button {
  flex-shrink: 0;
  padding: 6px 12px;
  border: none;
  border-radius: 999px;
  background: #fff;
  color: var(--red-strong);
  font: 700 0.76rem var(--sans);
  cursor: pointer;
}
.sk-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 8px;
}
.sk {
  display: block;
  background: linear-gradient(90deg, var(--track) 25%, var(--page) 50%, var(--track) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}
.sk-line {
  height: 14px;
  border-radius: 7px;
}
.sk-line.short {
  width: 55%;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(26, 156, 75, 0.55);
  }
  70% {
    box-shadow: 0 0 0 7px rgba(26, 156, 75, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(26, 156, 75, 0);
  }
}
</style>
