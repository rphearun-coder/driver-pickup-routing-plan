import { onBeforeUnmount, ref } from 'vue';
import type { MqttClient } from 'mqtt';
import { publishDriverLocation } from '@/mqtt/driverMqtt';
import type { LatLng } from '@/types';

export interface UseRoutePlaybackOptions {
  getGoogle: () => any;
  getMap: () => any;
  getOrigin: () => LatLng;
  getMqttClient: () => MqttClient | null | undefined;
  getDriverId: () => string;
  getStepIntervalMs?: () => number;
}

export function useRoutePlayback({
  getGoogle,
  getMap,
  getOrigin,
  getMqttClient,
  getDriverId,
  getStepIntervalMs = () => 1000,
}: UseRoutePlaybackOptions) {
  const isPlayingRoute = ref(false);
  const isPaused = ref(false);
  const isSimulating = ref(true);

  let routePolyline: any = null;
  let previewPolyline: any = null;
  let routeTimer: ReturnType<typeof setInterval> | null = null;
  let activePath: any[] | null = null;
  let activeIndex = 0;

  async function fetchDrivingPath(destination: LatLng): Promise<any[] | null> {
    const google = getGoogle();
    if (!google) return null;
    try {
      const directionsService = new google.maps.DirectionsService();
      const result = await directionsService.route({
        origin: getOrigin(),
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      });
      const path = result.routes?.[0]?.overview_path;
      return path && path.length ? path : null;
    } catch (err) {
      console.error('Directions request failed:', err);
      return null;
    }
  }

  function clearPreview(): void {
    previewPolyline?.setMap(null);
    previewPolyline = null;
  }

  async function previewRoute(destination: LatLng): Promise<void> {
    const google = getGoogle();
    const map = getMap();
    if (!google || !map) return;

    clearPreview();

    const path = await fetchDrivingPath(destination);
    if (!path) return;

    previewPolyline = new google.maps.Polyline({
      path,
      map,
      strokeColor: '#1a73e8',
      strokeOpacity: 0,
      strokeWeight: 5,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeWeight: 5, scale: 4 }, offset: '0', repeat: '16px' }],
    });
  }

  function stopRoute(): void {
    if (routeTimer) {
      clearInterval(routeTimer);
      routeTimer = null;
    }
    routePolyline?.setMap(null);
    routePolyline = null;
    activePath = null;
    activeIndex = 0;
    isPlayingRoute.value = false;
    isPaused.value = false;
  }

  function startTimer(): void {
    routeTimer = setInterval(() => {
      if (!activePath || activeIndex >= activePath.length) {
        stopRoute();
        return;
      }
      const client = getMqttClient();
      if (client) {
        const point = activePath[activeIndex];
        publishDriverLocation(client, getDriverId(), { lat: point.lat(), lon: point.lng() });
      }
      activeIndex++;
    }, getStepIntervalMs());
  }

  function pauseRoute(): void {
    if (!isPlayingRoute.value || isPaused.value || !activePath) return;
    if (routeTimer) {
      clearInterval(routeTimer);
      routeTimer = null;
    }
    isPaused.value = true;
  }

  function resumeRoute(): void {
    if (!isPlayingRoute.value || !isPaused.value) return;
    isPaused.value = false;
    startTimer();
  }

  // `simulate: true` (dev) fakes the drive by publishing points along the
  // route on a timer. `simulate: false` (prod) only plans and draws the
  // route — the marker then moves purely off real location updates arriving
  // over MQTT from the driver's own mobile device.
  async function playRoute(destination: LatLng, { simulate = true }: { simulate?: boolean } = {}): Promise<void> {
    if (simulate) {
      const client = getMqttClient();
      if (!client || !getDriverId()) {
        console.error('playRoute: no MQTT client or driverId configured');
        return;
      }
    }

    const google = getGoogle();
    const map = getMap();
    if (!google || !map) return;

    stopRoute();

    const path = await fetchDrivingPath(destination);
    if (!path) return;

    clearPreview();

    routePolyline = new google.maps.Polyline({
      path,
      map,
      strokeColor: '#1a73e8',
      strokeOpacity: 0.85,
      strokeWeight: 4,
    });

    const bounds = new google.maps.LatLngBounds();
    path.forEach((point: any) => bounds.extend(point));
    map.fitBounds(bounds, 80);

    isSimulating.value = simulate;
    isPlayingRoute.value = true;
    if (simulate) {
      activePath = path;
      activeIndex = 0;
      startTimer();
    }
  }

  onBeforeUnmount(() => {
    stopRoute();
    clearPreview();
  });

  return { isPlayingRoute, isPaused, isSimulating, previewRoute, playRoute, pauseRoute, resumeRoute, stopRoute };
}
