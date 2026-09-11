<template>
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
    @login="handleLogin"
    @logout="logoutDriver"
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
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useDriverLocations } from '@/composables/useDriverLocations';
import { useDriverPresence } from '@/composables/useDriverPresence';
import { useRoutePlayback } from '@/composables/useRoutePlayback';
import DriverMap from '@/components/map/DriverMap.vue';
import DriverPanel from '@/components/driver-panel/DriverPanel.vue';
import { APP_MODE, PICKUP_POLL_INTERVAL_MS } from '@/config';
import { fetchDriverOrders } from '@/api/orders';
import { todayIso } from '@/utils/date';
import type { LatLng, PickupPoint, PickupTimeSlot } from '@/types';

const DevPublishPanel = shallowRef<any>(null);
if (import.meta.env.DEV) {
  import('@/components/driver-panel/DevPublishPanel.vue').then((m) => (DevPublishPanel.value = m.default));
}

const DEFAULT_CENTER: LatLng = { lat: 11.525480965356625, lng: 104.90954542274423 };
const DEFAULT_ZOOM = 12;

const driverMapRef = ref<InstanceType<typeof DriverMap> | null>(null);
const pickups = ref<PickupPoint[]>([]);
const selectedPickupDate = ref(todayIso());
const selectedPickupTime = ref<PickupTimeSlot | ''>('');

let pickupPollTimer: ReturnType<typeof setInterval> | null = null;
let pickupAbortController: AbortController | null = null;

async function refreshPickups(): Promise<void> {
  if (!driverToken.value) return;
  pickupAbortController?.abort();
  const controller = new AbortController();
  pickupAbortController = controller;
  try {
    pickups.value = await fetchDriverOrders(
      driverToken.value,
      selectedPickupDate.value,
      selectedPickupTime.value,
      controller.signal
    );
  } catch (err) {
    if ((err as { name?: string }).name !== 'AbortError') {
      console.error('Failed to fetch pickups:', err);
    }
  }
}

function stopPickupPolling(): void {
  if (pickupPollTimer) {
    clearInterval(pickupPollTimer);
    pickupPollTimer = null;
  }
  pickupAbortController?.abort();
}

onBeforeUnmount(() => {
  stopPickupPolling();
  pickups.value = [];
});

const { driverToken, driverUser, driverProfile, driverLoginError, driverLoggingIn, loginAsDriver, logoutDriver } = useAuth();

const driverDisplayName = computed(() => driverProfile.value?.fullName ?? driverUser.value?.fullName ?? '');

// The MQTT/marker/route pipeline must only track an actually authenticated driver
// (driverUser.id, from the real login response) — empty while logged out, so no
// "me" marker or profile card appears until someone has really logged in.
const activeDriverId = ref('');
watch(driverUser, (user) => (activeDriverId.value = user?.id || ''), { immediate: true });

const { connectionStatus, driverLocations, locationVersion, publishOwnLocation, client: mqttClient } = useDriverLocations({
  currentDriverId: activeDriverId,
});

function myPosition(): LatLng {
  const me = driverLocations.get(activeDriverId.value);
  return me ? { lat: Number(me.lat), lng: Number(me.lon) } : DEFAULT_CENTER;
}

const { isOnline, isSyncing: isSyncingPresence, presenceError, toggleOnline } = useDriverPresence({
  currentDriverId: activeDriverId,
  driverToken,
  onOnlineChange: (online) => driverMapRef.value?.setOnline(online),
});

async function handleLogin({ phoneNumber, password }: { phoneNumber: string; password: string }): Promise<void> {
  await loginAsDriver(phoneNumber, password);
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
  if (isPlayingRoute.value) return;
  const goingOnline = !isOnline.value;
  await toggleOnline();
  if (goingOnline && isOnline.value && activeDriverId.value && !driverLocations.has(activeDriverId.value)) {
    publishOwnLocation(activeDriverId.value, DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);
  }
}

const driveSpeedMs = ref(1000);

const { isPlayingRoute, isPaused, isSimulating, previewRoute, playRoute, pauseRoute, resumeRoute, stopRoute } = useRoutePlayback({
  getGoogle: () => driverMapRef.value?.getGoogle(),
  getMap: () => driverMapRef.value?.getMap(),
  getOrigin: myPosition,
  getMqttClient: () => mqttClient,
  getDriverId: () => activeDriverId.value,
  getStepIntervalMs: () => driveSpeedMs.value,
});

function handleChangeFilter({ date, pickupTime }: { date: string; pickupTime: PickupTimeSlot | '' }) {
  selectedPickupDate.value = date;
  selectedPickupTime.value = pickupTime;
  if (isOnline.value) refreshPickups();
}

function handleRefresh() {
  if (driverLocations.has(activeDriverId.value)) {
    const map = driverMapRef.value?.getMap();
    map?.panTo(myPosition());
    map?.setZoom(DEFAULT_ZOOM);
  }
  if (isOnline.value) {
    refreshPickups();
  }
}

function handleViewPickup({ lat, lon }: { lat: number; lon: number }) {
  const map = driverMapRef.value?.getMap();
  const google = driverMapRef.value?.getGoogle();
  if (!map || !google) return;
  const me = driverLocations.get(activeDriverId.value);
  if (!me) {
    map.panTo({ lat, lng: lon });
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  bounds.extend({ lat: Number(me.lat), lng: Number(me.lon) });
  bounds.extend({ lat, lng: lon });
  map.fitBounds(bounds, 80);
}

function handlePreviewRoute({ lat, lon }: { lat: number; lon: number }) {
  previewRoute({ lat, lng: lon });
}

// simulate semantics: see useRoutePlayback.ts's playRoute()
function handlePlayRoute({ lat, lon }: { lat: number; lon: number }) {
  if (!activeDriverId.value) return;
  playRoute({ lat, lng: lon }, { simulate: APP_MODE !== 'production' });
}

function handleDevPublish({ driverId, lat, lon }: { driverId: string; lat: number; lon: number }) {
  publishOwnLocation(driverId, lat, lon);
}
</script>
