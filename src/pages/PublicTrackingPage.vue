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
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import DriverMap from "@/components/map/DriverMap.vue";
import { useDriverLocations } from "@/composables/useDriverLocations";
import { filterSharedOrder } from "@/api/orders";
import type { LatLng, PickupPoint } from "@/types";

const DEFAULT_CENTER: LatLng = { lat: 11.525480965356625, lng: 104.90954542274423 };
const DEFAULT_ZOOM = 12;
const route = useRoute();
const driverMapRef = ref<InstanceType<typeof DriverMap> | null>(null);
const driverId = computed(() => String(route.params.driverId ?? "").trim());
const pickupMarker = computed<PickupPoint | null>(() => {
  const orderId = typeof route.query.orderId === "string" ? route.query.orderId : "";
  const lat = Number(route.query.pickupLat);
  const lon = Number(route.query.pickupLon);
  if (!orderId || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const onRoute = route.query.onRoute === "true";
  return filterSharedOrder({
    id: orderId,
    path: [{ lat, lng: lon }],
    label: typeof route.query.pickupLabel === "string" ? route.query.pickupLabel : "Pickup",
    status: onRoute ? "ON_ROUTE" : "IN_PROGRESS",
    onRoute,
  }, orderId, onRoute);
});

const currentDriverId = ref(driverId.value);
watch(driverId, (id) => (currentDriverId.value = id), { immediate: true });
const { driverLocations, locationVersion } = useDriverLocations({ currentDriverId });

let routePolyline: any = null;
let routeDrawnFor = ''; // `${orderId}:${driverId}` — avoids re-hitting Directions on every location tick

async function drawRoute(google: any, map: any, origin: LatLng, destination: LatLng): Promise<void> {
  const key = `${pickupMarker.value?.id ?? ''}:${driverId.value}`;
  if (routeDrawnFor === key) return;
  routeDrawnFor = key;

  try {
    const directionsService = new google.maps.DirectionsService();
    const result = await directionsService.route({
      origin,
      destination,
      travelMode: google.maps.TravelMode.DRIVING,
    });
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
    routeDrawnFor = ''; // let a later tick retry
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

    // A live MQTT position means the driver is actively broadcasting — treat that as
    // "online" so the marker pulses. There's no separate presence check on this public
    // page, only the location feed itself.
    if (driver) driverMapRef.value?.setOnline(true);

    const pickup = pickupMarker.value?.path[0];
    if (!map || !google || !driver || !pickup) return;

    const driverPosition = { lat: Number(driver.lat), lng: Number(driver.lon) };
    drawRoute(google, map, driverPosition, { lat: pickup.lat, lng: pickup.lng });

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(driverPosition);
    bounds.extend({ lat: pickup.lat, lng: pickup.lng });
    map.fitBounds(bounds, 80);
  },
  { immediate: true }
);

onBeforeUnmount(() => routePolyline?.setMap(null));
</script>

