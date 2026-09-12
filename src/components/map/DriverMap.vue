<template>
  <div id="map" ref="mapEl" style="width: 100%; height: 100vh; height: 100dvh;"></div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import { useGoogleMap } from '@/composables/useGoogleMap';
import { createDriverMarkerLayer } from '@/map/driverMarkers';
import { createPickupMarkerLayer } from '@/map/pickupMarkers';
import type { DriverLocation, LatLng, PickupPoint } from '@/types';

const props = withDefaults(
  defineProps<{
    currentDriverId: string;
    driverName?: string;
    driverLocations: Map<string, DriverLocation>;
    locationVersion: number;
    pickups: PickupPoint[];
    isPlayingRoute: boolean;
    center: LatLng;
    zoom: number;
  }>(),
  {
    driverName: '',
  }
);

// Pickup pins would clutter the route polyline while actively driving to one.
const visiblePickups = computed(() => (props.isPlayingRoute ? [] : props.pickups));

const mapEl = ref<HTMLDivElement | null>(null);
const { google, map, init } = useGoogleMap(mapEl, { center: props.center, zoom: props.zoom });

let markerLayer: ReturnType<typeof createDriverMarkerLayer> | null = null;
let pickupLayer: ReturnType<typeof createPickupMarkerLayer> | null = null;

// Lets parents (e.g. PublicTrackingPage) know when it's safe to call getMap()/getGoogle() —
// map init is async, so a watcher keyed only on incoming data can fire before the map exists.
const isReady = ref(false);

onMounted(async () => {
  const { google: g, map: m } = await init();

  markerLayer = createDriverMarkerLayer(g, m, {
    currentDriverId: props.currentDriverId,
    driverName: props.driverName,
  });
  pickupLayer = createPickupMarkerLayer(g, m);
  pickupLayer.setPickups(visiblePickups.value);

  // immediate: true — a location update can arrive (bumping locationVersion) while the
  // Google Maps script is still loading, before this watcher exists to catch the change.
  // Without it, that first position is silently dropped until the next MQTT message.
  watch(
    () => props.locationVersion,
    () => {
      Array.from(props.driverLocations.values()).forEach((data) => markerLayer?.upsert(data));
    },
    { immediate: true }
  );

  watch(visiblePickups, (pickups) => pickupLayer?.setPickups(pickups));

  watch(
    () => props.driverName,
    (name) => markerLayer?.setDriverName(name)
  );

  watch(
    () => props.currentDriverId,
    (id) => markerLayer?.setCurrentDriverId(id)
  );

  isReady.value = true;
});

function setOnline(online: boolean): void {
  markerLayer?.setOnline(online);
}

defineExpose({
  getGoogle: () => google.value,
  getMap: () => map.value,
  setOnline,
  isReady,
});
</script>
