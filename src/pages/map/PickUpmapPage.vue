<template>
  <div class="uber-map-page-root">
    <!-- Map (Always mounted so Google Maps initializes and stays warm) -->
    <DriverMap
      ref="driverMapRef"
      :current-driver-id="activeDriverId"
      :driver-name="driverDisplayName"
      :driver-locations="driverLocations"
      :location-version="locationVersion"
      :pickups="pickups"
      :is-playing-route="isPlayingRoute"
      :center="DEFAULT_CENTER"
      :zoom="DEFAULT_ZOOM"
    />

    <!-- SCREEN 1: "Plan your ride" View (Image 1) -->
    <transition name="fade-slide">
      <div v-if="viewMode === 'plan'" class="plan-ride-overlay">
        <!-- Auth Login Prompt if not authenticated -->
        <div v-if="!driverToken" class="auth-required-box">
          <div class="auth-box-header">
            <h3>Driver Login Required</h3>
            <p>Please log in to view and plan your pickup routes.</p>
          </div>
          <DriverLoginForm
            :login-error="driverLoginError"
            :logging-in="driverLoggingIn"
            @login="handleLogin"
          />
        </div>

        <PlanRideView
          v-else
          :origin-address="originAddress"
          :pickups="pickups"
          :is-online="isOnline"
          :is-syncing="isSyncingPresence"
          :location-mode="locationMode"
          :selected-date="selectedPickupDate"
          :selected-pickup-time="selectedPickupTime"
          :driver-display-name="driverDisplayName"
          :is-authenticated="!!driverToken"
          @back="handleBackToHome"
          @select-pickup="handleSelectPickup"
          @toggle-online="handleToggleOnline"
          @toggle-mode="toggleLocationMode"
          @change-filter="handleChangeFilter"
          @set-location-on-map="handleSetLocationOnMap"
        />

        <!-- Floating dev tools pill in development -->
        <div v-if="DevPublishPanel" class="dev-tools-fab">
          <component
            :is="DevPublishPanel"
            :default-driver-id="activeDriverId"
            @publish="handleDevPublish"
            @set-drive-speed="driveSpeedMs = $event"
          />
        </div>
      </div>
    </transition>

    <!-- SCREEN 2: "Choose a ride" / Route Preview Overlay (Image 2 & 3) -->
    <template v-if="viewMode === 'choose-ride'">
      <!-- Top Floating Navigation Capsule -->
      <header class="top-floating-header">
        <button
          type="button"
          class="floating-circle-btn"
          aria-label="Back to planning"
          @click="backToPlan"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <button
          type="button"
          class="floating-destination-capsule"
          title="Change destination"
          @click="backToPlan"
        >
          <span class="capsule-destination-name">{{ activeDestinationName }}</span>
          <svg class="capsule-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </header>

      <!-- Floating Re-center Target Button (Image 2) -->
      <button
        type="button"
        class="floating-recenter-btn"
        title="Re-center location"
        @click="handleReCenter"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="7" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
        </svg>
      </button>

      <!-- Bottom Sheet Modal (Image 2 & 3) -->
      <div class="bottom-sheet-wrapper">
        <ChooseRideSheet
          :destination-name="activeDestinationName"
          :route-duration-text="routeDurationText"
          :route-distance-text="routeDistanceText"
          :route-arrival-eta="routeArrivalEta"
          :is-playing-route="isPlayingRoute"
          :is-paused="isPaused"
          :is-simulating="isSimulating"
          :has-live-position="hasLivePosition"
          :location-error="locationError"
          :is-online="isOnline"
          :active-pickup="selectedPickup"
          @choose-ride="handleChooseRide"
          @pause-route="pauseRoute"
          @resume-route="resumeRoute"
          @stop-route="handleStopDriving"
          @invite="() => handleInvite(selectedPickup || undefined)"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "@/composables/useAuth";
import { useDriverLocations } from "@/composables/useDriverLocations";
import { useDriverLocationPublishing } from "@/composables/useDriverLocationPublishing";
import { useDriverPresence } from "@/composables/useDriverPresence";
import { useLocationMode } from "@/composables/useLocationMode";
import { useRoutePlayback } from "@/composables/useRoutePlayback";
import DriverMap from "@/components/map/DriverMap.vue";
import DriverLoginForm from "@/components/driver-panel/DriverLoginForm.vue";
import PlanRideView from "@/components/driver-panel/PlanRideView.vue";
import ChooseRideSheet from "@/components/driver-panel/ChooseRideSheet.vue";
import { PICKUP_POLL_INTERVAL_MS } from "@/config";
import { fetchDriverOrders, updateOrderOnRoute } from "@/api/orders";
import { todayIso } from "@/utils/date";
import type { LatLng, PickupPoint, PickupTimeSlot } from "@/types";

const DevPublishPanel = shallowRef<any>(null);
if (import.meta.env.DEV) {
  import("@/components/driver-panel/DevPublishPanel.vue").then((module) => {
    DevPublishPanel.value = module.default;
  });
}

const DEFAULT_CENTER: LatLng = { lat: 11.525480965356625, lng: 104.90954542274423 };
const DEFAULT_ZOOM = 13;

const driverMapRef = ref<InstanceType<typeof DriverMap> | null>(null);
const pickups = ref<PickupPoint[]>([]);
const selectedPickupDate = ref(todayIso());
const selectedPickupTime = ref<PickupTimeSlot | "">("");
let pickupPollTimer: ReturnType<typeof setInterval> | null = null;
let pickupAbortController: AbortController | null = null;

const { driverToken, driverUser, driverProfile, driverLoginError, driverLoggingIn, loginAsDriver } = useAuth();
const router = useRouter();
const activeDriverId = ref("");
watch(driverUser, (user) => (activeDriverId.value = user?.id || ""), { immediate: true });
const driverDisplayName = computed(() => driverProfile.value?.fullName ?? driverUser.value?.fullName ?? "Driver");

const { locationMode, isLiveMode, setLocationMode } = useLocationMode();

// UI View Mode: 'plan' (Image 1) or 'choose-ride' (Image 2 & 3)
const viewMode = ref<'plan' | 'choose-ride'>('plan');
const selectedPickup = ref<PickupPoint | null>(null);
const activeDestinationPoint = ref<LatLng | null>(null);
const originAddress = ref<string>('Current location');

interface StoredActiveRoute {
  driverId: string;
  pickupId: string;
  lat: number;
  lon: number;
  isLive: boolean;
}
const ACTIVE_ROUTE_STORAGE_KEY = "jalat-active-route";
const resumedPickupId = ref("");

function readActiveRoute(): StoredActiveRoute | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_ROUTE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredActiveRoute) : null;
  } catch {
    return null;
  }
}

function writeActiveRoute(value: StoredActiveRoute | null): void {
  try {
    if (value) window.localStorage.setItem(ACTIVE_ROUTE_STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(ACTIVE_ROUTE_STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
}

const { driverLocations, locationVersion, publishOwnLocation, client: mqttClient } = useDriverLocations({
  currentDriverId: activeDriverId,
});

function toggleLocationMode(): void {
  const next = locationMode.value === 'live' ? 'test' : 'live';
  if (isPlayingRoute.value) stopRoute();
  setLocationMode(next);
}

function myPosition(): LatLng {
  const me = driverLocations.get(activeDriverId.value);
  return me ? { lat: Number(me.lat), lng: Number(me.lon) } : DEFAULT_CENTER;
}

const hasLivePosition = computed(() => driverLocations.has(activeDriverId.value));
const { isOnline, isSyncing: isSyncingPresence, toggleOnline } = useDriverPresence();
watch(isOnline, (online) => driverMapRef.value?.setOnline(online));

const { locationError } = useDriverLocationPublishing();

async function refreshPickups(): Promise<void> {
  if (!driverToken.value) return;
  pickupAbortController?.abort();
  const controller = new AbortController();
  pickupAbortController = controller;
  try {
    pickups.value = await fetchDriverOrders(driverToken.value, selectedPickupDate.value, selectedPickupTime.value, controller.signal);
  } catch (error) {
    if ((error as { name?: string }).name !== "AbortError") console.error("Failed to fetch pickups:", error);
  }
}

function stopPickupPolling(): void {
  if (pickupPollTimer) clearInterval(pickupPollTimer);
  pickupPollTimer = null;
  pickupAbortController?.abort();
}

onBeforeUnmount(() => stopPickupPolling());

async function handleLogin(payload: { phoneNumber: string; password: string }): Promise<void> {
  await loginAsDriver(payload.phoneNumber, payload.password);
}

function handleBackToHome(): void {
  router.push({ name: 'home' });
}

watch(
  [isOnline, driverToken],
  ([online, token]) => {
    stopPickupPolling();
    if (online && token) {
      refreshPickups();
      pickupPollTimer = setInterval(refreshPickups, PICKUP_POLL_INTERVAL_MS);
    } else {
      pickups.value = [];
    }
  },
  { immediate: true }
);

async function handleToggleOnline(): Promise<void> {
  if (!isPlayingRoute.value) await toggleOnline();
}

const driveSpeedMs = ref(1000);
const {
  isPlayingRoute,
  isPaused,
  isSimulating,
  routeDistanceText,
  routeDurationText,
  routeArrivalEta,
  previewRoute,
  playRoute,
  pauseRoute,
  resumeRoute,
  stopRoute,
  refreshRoute,
  clearPreview,
} = useRoutePlayback({
  getGoogle: () => driverMapRef.value?.getGoogle(),
  getMap: () => driverMapRef.value?.getMap(),
  getOrigin: myPosition,
  getMqttClient: () => mqttClient,
  getDriverId: () => activeDriverId.value,
  getStepIntervalMs: () => driveSpeedMs.value,
});

watch(locationVersion, () => {
  refreshRoute();
  geocodeDriverAddress();
});

watch(isPlayingRoute, (playing) => {
  if (!playing) {
    writeActiveRoute(null);
    resumedPickupId.value = "";
  } else {
    viewMode.value = 'choose-ride';
  }
});

let hasAttemptedResume = false;
watch(
  [activeDriverId, isOnline, () => driverMapRef.value?.isReady],
  ([driverId, online, ready]) => {
    if (hasAttemptedResume || isPlayingRoute.value || !driverId || !online || !ready) return;
    hasAttemptedResume = true;
    const stored = readActiveRoute();
    if (!stored || stored.driverId !== driverId) return;
    resumedPickupId.value = stored.pickupId;
    activeDestinationPoint.value = { lat: stored.lat, lng: stored.lon };
    viewMode.value = 'choose-ride';
    playRoute({ lat: stored.lat, lng: stored.lon }, { simulate: !stored.isLive });
  },
  { immediate: true }
);

const activeDestinationName = computed(() => {
  if (selectedPickup.value) {
    return selectedPickup.value.partnerName || selectedPickup.value.label || 'Pickup Location';
  }
  if (resumedPickupId.value) {
    const match = pickups.value.find((p) => p.id === resumedPickupId.value);
    if (match) return match.partnerName || match.label || 'Pickup Location';
  }
  return 'Destination';
});

function geocodeDriverAddress(): void {
  const google = driverMapRef.value?.getGoogle();
  if (!google) return;
  const pos = myPosition();
  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ location: pos }, (results: any, status: string) => {
    if (status === 'OK' && results?.[0]?.formatted_address) {
      originAddress.value = results[0].formatted_address;
    }
  });
}

onMounted(() => {
  setTimeout(() => geocodeDriverAddress(), 1200);
});

function handleSelectPickup(pickup: PickupPoint): void {
  selectedPickup.value = pickup;
  const origin = pickup.path?.[0];
  if (origin) {
    activeDestinationPoint.value = { lat: Number(origin.lat), lng: Number(origin.lng) };
    viewMode.value = 'choose-ride';
    previewRoute(activeDestinationPoint.value);
  }
}

function handleSetLocationOnMap(): void {
  if (pickups.value.length > 0) {
    handleSelectPickup(pickups.value[0]);
  } else {
    viewMode.value = 'choose-ride';
    const fallbackTarget = { lat: DEFAULT_CENTER.lat + 0.015, lng: DEFAULT_CENTER.lng + 0.02 };
    activeDestinationPoint.value = fallbackTarget;
    previewRoute(fallbackTarget);
  }
}

function backToPlan(): void {
  if (isPlayingRoute.value) {
    stopRoute();
  }
  clearPreview();
  viewMode.value = 'plan';
}

function handleReCenter(): void {
  const map = driverMapRef.value?.getMap();
  const google = driverMapRef.value?.getGoogle();
  if (!map || !google) return;
  const me = myPosition();

  if (activeDestinationPoint.value) {
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(me);
    bounds.extend(activeDestinationPoint.value);
    try {
      map.fitBounds(bounds, { top: 80, right: 40, bottom: 340, left: 40 });
    } catch {
      map.fitBounds(bounds, 80);
    }
  } else {
    map.panTo(me);
    map.setZoom(DEFAULT_ZOOM);
  }
}

async function handleChooseRide(_tierId: string): Promise<void> {
  if (!activeDriverId.value) return;
  if (!isOnline.value) {
    await toggleOnline();
  }

  const destination = activeDestinationPoint.value;
  if (!destination) return;

  const pickupId = selectedPickup.value?.id;
  const onRoute = selectedPickup.value?.onRoute;

  if (isLiveMode.value && pickupId && !onRoute && driverToken.value) {
    try {
      await updateOrderOnRoute(driverToken.value, pickupId);
    } catch (error) {
      console.error("Failed to set order on route:", error);
    }
  }

  resumedPickupId.value = pickupId ?? "";
  writeActiveRoute({
    driverId: activeDriverId.value,
    pickupId: pickupId ?? "",
    lat: destination.lat,
    lon: destination.lng,
    isLive: isLiveMode.value,
  });

  playRoute(destination, { simulate: !isLiveMode.value });
}

function handleStopDriving(): void {
  stopRoute();
}

function handleChangeFilter({ date, pickupTime }: { date: string; pickupTime: PickupTimeSlot | "" }): void {
  selectedPickupDate.value = date;
  selectedPickupTime.value = pickupTime;
  if (isOnline.value) refreshPickups();
}

function handleDevPublish({ lat, lon }: { driverId: string; lat: number; lon: number }): void {
  if (activeDriverId.value) publishOwnLocation(activeDriverId.value, lat, lon);
}

async function handleInvite(pickup?: PickupPoint): Promise<void> {
  if (!activeDriverId.value) return;
  const trackingUrl = new URL(`/pickup-map/${encodeURIComponent(activeDriverId.value)}`, window.location.origin);
  if (pickup?.id) {
    trackingUrl.searchParams.set("orderId", pickup.id);
    trackingUrl.searchParams.set("onRoute", String(Boolean(pickup.onRoute)));
    const [location] = pickup.path;
    if (location) {
      trackingUrl.searchParams.set("pickupLat", String(location.lat));
      trackingUrl.searchParams.set("pickupLon", String(location.lng));
    }
    trackingUrl.searchParams.set("pickupLabel", pickup.partnerName || pickup.label);
  }
  try {
    if (navigator.share) await navigator.share({ title: "Live driver location", url: trackingUrl.toString() });
    else await navigator.clipboard.writeText(trackingUrl.toString());
  } catch (error) {
    if ((error as { name?: string }).name !== "AbortError") console.error("Failed to share tracking link:", error);
  }
}
</script>

<style scoped>
.uber-map-page-root {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
}

/* SCREEN 1: Plan your ride overlay */
.plan-ride-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  background: #ffffff;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* Auth required container */
.auth-required-box {
  padding: 24px 20px;
  background: #ffffff;
}

.auth-box-header {
  margin-bottom: 20px;
  text-align: center;
}

.auth-box-header h3 {
  margin: 0 0 6px 0;
  font-size: 18px;
  color: #111827;
}

.auth-box-header p {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
}

/* Top Floating Header (Image 2 & 3) */
.top-floating-header {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 14px);
  left: 14px;
  right: 14px;
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 12px;
  pointer-events: none;
}

.floating-circle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #ffffff;
  border: none;
  color: #000000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  cursor: pointer;
  pointer-events: auto;
  transition: transform 0.15s, background-color 0.15s;
}

.floating-circle-btn:active {
  transform: scale(0.94);
}

.floating-circle-btn svg {
  width: 22px;
  height: 22px;
}

.floating-destination-capsule {
  flex: 1;
  max-width: 320px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-radius: 28px;
  background: #ffffff;
  border: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  color: #000000;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 0.15s;
}

.floating-destination-capsule:active {
  transform: scale(0.98);
}

.capsule-destination-name {
  font-size: 15px;
  font-weight: 700;
  color: #000000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.capsule-chevron {
  width: 16px;
  height: 16px;
  color: #000000;
  flex-shrink: 0;
  margin-left: 8px;
}

/* Floating Re-center Target Button (Image 2) */
.floating-recenter-btn {
  position: absolute;
  right: 16px;
  bottom: 345px;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #ffffff;
  border: none;
  color: #111827;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  cursor: pointer;
  transition: transform 0.15s;
}

.floating-recenter-btn:active {
  transform: scale(0.92);
}

.floating-recenter-btn svg {
  width: 22px;
  height: 22px;
}

/* Bottom Sheet Wrapper (Image 2 & 3) */
.bottom-sheet-wrapper {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 15;
  width: 100%;
}

/* Dev tools floating badge */
.dev-tools-fab {
  position: fixed;
  bottom: 12px;
  right: 12px;
  z-index: 30;
}

/* Transitions */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease-out;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
