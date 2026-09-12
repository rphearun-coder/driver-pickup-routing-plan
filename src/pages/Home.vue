<template>
  <LocationModeSwitch :model-value="locationMode" @update:model-value="setMode" />

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

  <DriverPanel
    :default-driver-id="activeDriverId"
    :is-authenticated="!!driverToken"
    :login-error="driverLoginError"
    :logging-in="driverLoggingIn"
    :is-online="isOnline"
    :is-syncing="isSyncingPresence"
    :presence-error="presenceError"
    :connection-status="connectionStatus"
    :pickups="pickups"
    :selected-date="selectedPickupDate"
    :selected-pickup-time="selectedPickupTime"
    :is-playing-route="isPlayingRoute"
    :is-paused="isPaused"
    :is-simulating="isSimulating"
    :has-live-position="hasLivePosition"
    :active-pickup-id="resumedPickupId"
    :location-error="locationError"
    @login="handleLogin"
    @logout="logoutDriver"
    @invite="handleInvite"
    @toggle-online="handleToggleOnline"
    @refresh="handleRefresh"
    @change-filter="handleChangeFilter"
    @view-pickup="handleViewPickup"
    @preview-route="handlePreviewRoute"
    @play-route="handlePlayRoute"
    @pause-route="pauseRoute"
    @resume-route="resumeRoute"
    @stop-route="stopRoute"
  >
    <template #dev-tools>
      <component
        :is="DevPublishPanel"
        v-if="DevPublishPanel"
        :default-driver-id="activeDriverId"
        @publish="handleDevPublish"
        @set-drive-speed="driveSpeedMs = $event"
      />
    </template>
  </DriverPanel>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useAuth } from "@/composables/useAuth";
import { useDriverLocations } from "@/composables/useDriverLocations";
import { useDriverLocationPublishing } from "@/composables/useDriverLocationPublishing";
import { useDriverPresence } from "@/composables/useDriverPresence";
import { useRoutePlayback } from "@/composables/useRoutePlayback";
import DriverMap from "@/components/map/DriverMap.vue";
import DriverPanel from "@/components/driver-panel/DriverPanel.vue";
import LocationModeSwitch from "@/components/LocationModeSwitch.vue";
import { APP_MODE, PICKUP_POLL_INTERVAL_MS } from "@/config";
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
const DEFAULT_ZOOM = 12;
const driverMapRef = ref<InstanceType<typeof DriverMap> | null>(null);
const pickups = ref<PickupPoint[]>([]);
const selectedPickupDate = ref(todayIso());
const selectedPickupTime = ref<PickupTimeSlot | "">("");
let pickupPollTimer: ReturnType<typeof setInterval> | null = null;
let pickupAbortController: AbortController | null = null;

const { driverToken, driverUser, driverProfile, driverLoginError, driverLoggingIn, loginAsDriver, logoutDriver } = useAuth();
const activeDriverId = ref("");
watch(driverUser, (user) => (activeDriverId.value = user?.id || ""), { immediate: true });
const driverDisplayName = computed(() => driverProfile.value?.fullName ?? driverUser.value?.fullName ?? "");

type LocationMode = "test" | "live";
const MODE_STORAGE_KEY = "jalat-location-mode";
const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
const locationMode = ref<LocationMode>(
  storedMode === "test" || storedMode === "live" ? storedMode : APP_MODE === "production" ? "live" : "test",
);
const isLiveMode = computed(() => locationMode.value === "live");

// Persists an in-progress "drive to pickup" so a page refresh resumes it instead of
// silently dropping back to the idle pickup list, as if "Stop driving" had been pressed.
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
    // localStorage unavailable (private mode, etc.) — resume-after-refresh just won't work.
  }
}

const { connectionStatus, driverLocations, locationVersion, publishOwnLocation, client: mqttClient } = useDriverLocations({
  currentDriverId: activeDriverId,
});

function setMode(mode: LocationMode): void {
  if (locationMode.value === mode) return;
  if (isPlayingRoute.value) stopRoute();
  locationMode.value = mode;
  window.localStorage.setItem(MODE_STORAGE_KEY, mode);
}

function myPosition(): LatLng {
  const me = driverLocations.get(activeDriverId.value);
  return me ? { lat: Number(me.lat), lng: Number(me.lon) } : DEFAULT_CENTER;
}

// In live mode, playRoute() only plans the route — the marker moves purely off real GPS
// updates from the driver's device. This tells the panel once that data has actually
// started arriving, so it can stop saying "waiting for the driver's live position".
const hasLivePosition = computed(() => driverLocations.has(activeDriverId.value));

const { isOnline, isSyncing: isSyncingPresence, presenceError, toggleOnline } = useDriverPresence({
  currentDriverId: activeDriverId,
  driverToken,
  onOnlineChange: (online) => driverMapRef.value?.setOnline(online),
});

const { locationError } = useDriverLocationPublishing({
  currentDriverId: activeDriverId,
  isOnline,
  isLiveMode,
  publish: publishOwnLocation,
});

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

watch([isOnline, driverToken], ([online, token]) => {
  stopPickupPolling();
  if (online && token) {
    refreshPickups();
    pickupPollTimer = setInterval(refreshPickups, PICKUP_POLL_INTERVAL_MS);
  } else {
    pickups.value = [];
  }
}, { immediate: true });

async function handleToggleOnline(): Promise<void> {
  if (!isPlayingRoute.value) await toggleOnline();
}

const driveSpeedMs = ref(1000);
const { isPlayingRoute, isPaused, isSimulating, previewRoute, playRoute, pauseRoute, resumeRoute, stopRoute, refreshRoute } = useRoutePlayback({
  getGoogle: () => driverMapRef.value?.getGoogle(),
  getMap: () => driverMapRef.value?.getMap(),
  getOrigin: myPosition,
  getMqttClient: () => mqttClient,
  getDriverId: () => activeDriverId.value,
  getStepIntervalMs: () => driveSpeedMs.value,
});

// Each real GPS update (live mode) should nudge the drawn route to follow the driver —
// refreshRoute() itself throttles how often that actually re-hits the Directions API.
watch(locationVersion, () => refreshRoute());

// Any transition out of "playing" — manual stop, a simulated drive finishing on its own,
// or a mode switch — should drop the resume record so a later refresh doesn't replay it.
watch(isPlayingRoute, (playing) => {
  if (!playing) {
    writeActiveRoute(null);
    resumedPickupId.value = "";
  }
});

// Fires once the driver is authenticated, online, and the map has finished loading —
// exactly the state a page refresh wipes. If a route was in progress, put it back.
let hasAttemptedResume = false;
watch(
  [activeDriverId, isOnline, () => driverMapRef.value?.isReady],
  ([driverId, online, ready]) => {
    if (hasAttemptedResume || isPlayingRoute.value || !driverId || !online || !ready) return;
    hasAttemptedResume = true;
    const stored = readActiveRoute();
    if (!stored || stored.driverId !== driverId) return;
    resumedPickupId.value = stored.pickupId;
    playRoute({ lat: stored.lat, lng: stored.lon }, { simulate: !stored.isLive });
  },
  { immediate: true }
);

function handleChangeFilter({ date, pickupTime }: { date: string; pickupTime: PickupTimeSlot | "" }): void {
  selectedPickupDate.value = date;
  selectedPickupTime.value = pickupTime;
  if (isOnline.value) refreshPickups();
}

function handleRefresh(): void {
  const map = driverMapRef.value?.getMap();
  if (map && driverLocations.has(activeDriverId.value)) {
    map.panTo(myPosition());
    map.setZoom(DEFAULT_ZOOM);
  }
  if (isOnline.value) refreshPickups();
}

function handleViewPickup({ lat, lon }: { lat: number; lon: number }): void {
  const map = driverMapRef.value?.getMap();
  const google = driverMapRef.value?.getGoogle();
  if (!map || !google) return;
  const me = driverLocations.get(activeDriverId.value);
  if (!me) return map.panTo({ lat, lng: lon });
  const bounds = new google.maps.LatLngBounds();
  bounds.extend({ lat: Number(me.lat), lng: Number(me.lon) });
  bounds.extend({ lat, lng: lon });
  map.fitBounds(bounds, 80);
}

function handlePreviewRoute({ lat, lon }: { lat: number; lon: number }): void {
  previewRoute({ lat, lng: lon });
}

async function handlePlayRoute({ id, onRoute, lat, lon }: { id?: string; onRoute?: boolean; lat: number; lon: number }): Promise<void> {
  if (!activeDriverId.value) return;
  if (isLiveMode.value && id && !onRoute && driverToken.value) {
    try {
      await updateOrderOnRoute(driverToken.value, id);
    } catch (error) {
      console.error("Failed to set order on route:", error);
      return;
    }
  }
  resumedPickupId.value = id ?? "";
  writeActiveRoute({ driverId: activeDriverId.value, pickupId: id ?? "", lat, lon, isLive: isLiveMode.value });
  playRoute({ lat, lng: lon }, { simulate: !isLiveMode.value });
}

function handleDevPublish({ lat, lon }: { driverId: string; lat: number; lon: number }): void {
  if (activeDriverId.value) publishOwnLocation(activeDriverId.value, lat, lon);
}

async function handleInvite(pickup?: PickupPoint): Promise<void> {
  if (!activeDriverId.value) return;
  const trackingUrl = new URL(`/track/${encodeURIComponent(activeDriverId.value)}`, window.location.origin);
  if (pickup?.id) {
    trackingUrl.searchParams.set("orderId", pickup.id);
    trackingUrl.searchParams.set("onRoute", String(Boolean(pickup.onRoute)));
    const [location] = pickup.path;
    if (location) {
      trackingUrl.searchParams.set("pickupLat", String(location.lat));
      trackingUrl.searchParams.set("pickupLon", String(location.lng));
    }
    trackingUrl.searchParams.set("pickupLabel", pickup.label);
  }
  try {
    if (navigator.share) await navigator.share({ title: "Live driver location", url: trackingUrl.toString() });
    else await navigator.clipboard.writeText(trackingUrl.toString());
  } catch (error) {
    if ((error as { name?: string }).name !== "AbortError") console.error("Failed to share tracking link:", error);
  }
}
</script>

