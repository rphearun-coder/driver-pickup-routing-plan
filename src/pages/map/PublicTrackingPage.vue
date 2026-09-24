<template>
  <DriverMap
    ref="driverMapRef"
    :current-driver-id="driverId"
    :driver-locations="driverLocations"
    :location-version="locationVersion"
    :pickups="pickupMarker ? [pickupMarker] : []"
    :is-playing-route="false"
    :center="DEFAULT_CENTER"
    :zoom="DEFAULT_ZOOM"
  />

  <div class="tracking-card">
    <div class="tracking-card-header">
      <span class="tracking-status-dot" :class="{ online: isMarkedOnline }"></span>
      <div class="tracking-card-title">
        <strong>{{ driverName || 'Your driver' }}</strong>
        <span class="tracking-card-sub">{{ pickupMarker?.label || 'Live tracking' }}</span>
      </div>
    </div>
    <div class="tracking-card-body">
      <p v-if="!hasDriverFix" class="tracking-status-text">Waiting for the driver's location…</p>
      <p v-else-if="!isMarkedOnline" class="tracking-status-text tracking-status-text--offline">
        Driver appears offline<template v-if="lastUpdatedText"> — last seen {{ lastUpdatedText }}</template>
      </p>
      <template v-else>
        <p class="tracking-status-text">
          On the way
          <span v-if="routeDurationText">
            · {{ routeDurationText }}<template v-if="routeDistanceText"> ({{ routeDistanceText }})</template>
          </span>
        </p>
        <p v-if="lastUpdatedText" class="tracking-updated">Updated {{ lastUpdatedText }}</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import DriverMap from "@/components/map/DriverMap.vue";
import { useDriverLocations } from "@/composables/useDriverLocations";
import { getDriverDisplayName } from "@/api/driver-location";
import { formatAge } from "@/utils/gpsStatus";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from "@/map/constants";
import type { LatLng, PickupPoint } from "@/types";

const DEFAULT_CENTER: LatLng = DEFAULT_MAP_CENTER;
const DEFAULT_ZOOM = DEFAULT_MAP_ZOOM;
const route = useRoute();
const driverMapRef = ref<InstanceType<typeof DriverMap> | null>(null);
const driverId = computed(() => String(route.params.driverId ?? "").trim());
const pickupMarker = computed<PickupPoint | null>(() => {
  const orderId = typeof route.query.orderId === "string" ? route.query.orderId : "";
  const lat = Number(route.query.pickupLat);
  const lon = Number(route.query.pickupLon);
  if (!orderId || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const onRoute = route.query.onRoute === "true";
  return {
    id: orderId,
    path: [{ lat, lng: lon }],
    label: typeof route.query.pickupLabel === "string" ? route.query.pickupLabel : "Pickup",
    status: onRoute ? "ON_ROUTE" : "IN_PROGRESS",
    onRoute,
  };
});

const { driverLocations, locationVersion } = useDriverLocations({ currentDriverId: driverId });

// Shown in the tracking card so the customer sees who they're looking at instead of a
// raw id. Fetched once, independent of driverLocations — that map gets overwritten by
// every live MQTT tick (which never carries a name), so storing it there would make the
// name flicker away the moment the driver's next GPS update arrives.
const driverName = ref("");
watch(
  driverId,
  async (id) => {
    driverName.value = "";
    if (!id) return;
    try {
      driverName.value = (await getDriverDisplayName(id)) ?? "";
    } catch (err) {
      console.error("Failed to load driver name:", err);
    }
  },
  { immediate: true }
);

const hasDriverFix = computed(() => driverLocations.has(driverId.value));

// `${orderId}:${driverId}` — identifies which driver/pickup pairing is currently being
// tracked, so both the route redraw throttle and the bounds-fit-once logic below can
// tell "still the same delivery" apart from "a new one just started."
function trackingTargetKey(): string {
  return `${pickupMarker.value?.id ?? ''}:${driverId.value}`;
}

let routePolyline: any = null;
let lastRouteKey = '';
let lastRouteRefreshAt = 0;
let lastBoundsFitKey = '';
const ROUTE_REFRESH_MIN_INTERVAL_MS = 20000; // throttle so a ~4s location feed doesn't hammer Directions
const routeDistanceText = ref('');
const routeDurationText = ref('');

// A live MQTT position means the driver is actively broadcasting — there's no separate
// presence check on this public page, only the location feed itself. But without a
// staleness check, the "online" pulse would stay on forever once seen even after the
// driver's phone dies or loses signal, since driverLocations entries are never cleared.
const DRIVER_STALE_TIMEOUT_MS = 45000;
const TICK_INTERVAL_MS = 5000;
let lastDriverSeenAt = 0;
const isMarkedOnline = ref(false);
const now = ref(Date.now());
const lastUpdatedText = computed(() => (lastDriverSeenAt ? formatAge(now.value - lastDriverSeenAt) : ''));

const tickTimer = setInterval(() => {
  now.value = Date.now();
  if (isMarkedOnline.value && now.value - lastDriverSeenAt > DRIVER_STALE_TIMEOUT_MS) {
    isMarkedOnline.value = false;
    driverMapRef.value?.setOnline(false);
  }
}, TICK_INTERVAL_MS);

async function drawRoute(google: any, map: any, origin: LatLng, destination: LatLng): Promise<void> {
  const key = trackingTargetKey();
  const at = Date.now();
  const isNewTarget = key !== lastRouteKey;
  if (!isNewTarget && at - lastRouteRefreshAt < ROUTE_REFRESH_MIN_INTERVAL_MS) return;
  lastRouteKey = key;
  lastRouteRefreshAt = at;

  try {
    const directionsService = new google.maps.DirectionsService();
    const result = await directionsService.route({
      origin,
      destination,
      travelMode: google.maps.TravelMode.DRIVING,
    });
    const leg = result.routes?.[0]?.legs?.[0];
    routeDistanceText.value = leg?.distance?.text ?? '';
    routeDurationText.value = leg?.duration?.text ?? '';

    const path = result.routes?.[0]?.overview_path;
    if (!path || !path.length) return;

    routePolyline?.setMap(null);
    routePolyline = new google.maps.Polyline({
      path,
      map,
      strokeColor: '#1a73e8',
      strokeOpacity: 0.85,
      strokeWeight: 4,
    });
  } catch (err) {
    console.error('Failed to fetch tracking route:', err);
    lastRouteRefreshAt = 0; // let the next tick retry immediately instead of waiting out the throttle
  }
}

// immediate: true, and watching isReady too — otherwise the first driver location and
// the map finishing its async init can each land before this watcher exists to react,
// leaving the view stuck on the default center instead of framing both markers.
watch(
  [locationVersion, pickupMarker, () => driverMapRef.value?.isReady],
  () => {
    const map = driverMapRef.value?.getMap();
    const google = driverMapRef.value?.getGoogle();
    const driver = driverLocations.get(driverId.value);

    if (driver) {
      lastDriverSeenAt = Date.now();
      now.value = lastDriverSeenAt;
      if (!isMarkedOnline.value) {
        isMarkedOnline.value = true;
        driverMapRef.value?.setOnline(true);
      }
    }

    const pickup = pickupMarker.value?.path[0];
    if (!map || !google || !driver || !pickup) return;

    const driverPosition = { lat: Number(driver.lat), lng: Number(driver.lon) };
    const targetKey = trackingTargetKey();
    const isNewTarget = targetKey !== lastBoundsFitKey;
    drawRoute(google, map, driverPosition, { lat: pickup.lat, lng: pickup.lng });

    // Only snap the viewport when the driver/pickup pairing first appears — refitting on
    // every ~4s GPS tick would fight any manual pan/zoom the viewer does meanwhile.
    if (isNewTarget) {
      lastBoundsFitKey = targetKey;
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(driverPosition);
      bounds.extend({ lat: pickup.lat, lng: pickup.lng });
      map.fitBounds(bounds, 80);
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  routePolyline?.setMap(null);
  clearInterval(tickTimer);
});
</script>

<style scoped>
.tracking-card {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 10;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22);
  font-family: system-ui, -apple-system, sans-serif;
}
.tracking-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tracking-status-dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--faint);
  box-shadow: 0 0 0 3px rgba(154, 160, 166, 0.14);
}
.tracking-status-dot.online {
  background: #1a9c4b;
  box-shadow: 0 0 0 3px rgba(26, 156, 75, 0.14);
}
.tracking-card-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.tracking-card-title strong {
  color: #1f2937;
  font-size: 15px;
  line-height: 1.3;
}
.tracking-card-sub {
  color: var(--muted);
  font-size: 12px;
}
.tracking-card-body {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}
.tracking-status-text {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
}
.tracking-status-text--offline {
  color: var(--red-strong);
}
.tracking-updated {
  margin: 2px 0 0;
  color: var(--faint);
  font-size: 11px;
}
</style>
