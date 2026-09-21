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
  const routeDistanceText = ref('');
  const routeDurationText = ref('');
  const routeDurationSeconds = ref(0);
  const routeArrivalEta = ref('');

  let routePolyline: any = null;
  let previewPolyline: any = null;
  let routeTimer: ReturnType<typeof setInterval> | null = null;
  let activePath: any[] | null = null;
  let activeIndex = 0;
  let activeDestination: LatLng | null = null;
  let lastRouteRefreshAt = 0;
  const ROUTE_REFRESH_MIN_INTERVAL_MS = 20000;

  function formatEta(seconds: number): string {
    const arrivalTime = new Date(Date.now() + seconds * 1000);
    return arrivalTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  async function fetchDrivingDetails(destination: LatLng): Promise<{ path: any[]; distanceText: string; durationText: string; durationSeconds: number } | null> {
    const google = getGoogle();
    if (!google) return null;
    try {
      const directionsService = new google.maps.DirectionsService();
      const result = await directionsService.route({
        origin: getOrigin(),
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      });
      const route = result.routes?.[0];
      const path = route?.overview_path;
      if (!path || !path.length) return null;

      const leg = route.legs?.[0];
      const distanceText = leg?.distance?.text ?? '';
      const durationText = leg?.duration?.text ?? '';
      const durationSeconds = leg?.duration?.value ?? 0;

      return { path, distanceText, durationText, durationSeconds };
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

    const details = await fetchDrivingDetails(destination);
    if (!details) return;

    routeDistanceText.value = details.distanceText;
    routeDurationText.value = details.durationText;
    routeDurationSeconds.value = details.durationSeconds;
    routeArrivalEta.value = formatEta(details.durationSeconds);

    previewPolyline = new google.maps.Polyline({
      path: details.path,
      map,
      strokeColor: '#000000',
      strokeOpacity: 0.95,
      strokeWeight: 5,
    });

    const bounds = new google.maps.LatLngBounds();
    details.path.forEach((point: any) => bounds.extend(point));
    try {
      map.fitBounds(bounds, { top: 80, right: 40, bottom: 320, left: 40 });
    } catch {
      map.fitBounds(bounds, 80);
    }
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
    activeDestination = null;
    lastRouteRefreshAt = 0;
    isPlayingRoute.value = false;
    isPaused.value = false;
  }

  // In live mode the drawn line was only ever computed once, from wherever the driver was
  // when "Drive to pickup" was tapped — it never followed them after that. Call this on
  // every real location update; it re-fetches Directions from the driver's current position
  // to the same destination, throttled so a ~4s GPS cadence doesn't hammer the Directions API.
  async function refreshRoute(): Promise<void> {
    if (!isPlayingRoute.value || isSimulating.value || !activeDestination) return;
    const now = Date.now();
    if (now - lastRouteRefreshAt < ROUTE_REFRESH_MIN_INTERVAL_MS) return;
    lastRouteRefreshAt = now;

    const google = getGoogle();
    const map = getMap();
    if (!google || !map) return;

    const details = await fetchDrivingDetails(activeDestination);
    if (!details || !isPlayingRoute.value) return;

    routeDistanceText.value = details.distanceText;
    routeDurationText.value = details.durationText;
    routeDurationSeconds.value = details.durationSeconds;
    routeArrivalEta.value = formatEta(details.durationSeconds);

    routePolyline?.setMap(null);
    routePolyline = new google.maps.Polyline({
      path: details.path,
      map,
      strokeColor: '#000000',
      strokeOpacity: 0.95,
      strokeWeight: 5,
    });
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

    const details = await fetchDrivingDetails(destination);
    if (!details) return;

    routeDistanceText.value = details.distanceText;
    routeDurationText.value = details.durationText;
    routeDurationSeconds.value = details.durationSeconds;
    routeArrivalEta.value = formatEta(details.durationSeconds);

    clearPreview();

    routePolyline = new google.maps.Polyline({
      path: details.path,
      map,
      strokeColor: '#000000',
      strokeOpacity: 0.95,
      strokeWeight: 5,
    });

    const bounds = new google.maps.LatLngBounds();
    details.path.forEach((point: any) => bounds.extend(point));
    try {
      map.fitBounds(bounds, { top: 80, right: 40, bottom: 320, left: 40 });
    } catch {
      map.fitBounds(bounds, 80);
    }

    activeDestination = destination;
    lastRouteRefreshAt = Date.now();
    isSimulating.value = simulate;
    isPlayingRoute.value = true;
    if (simulate) {
      activePath = details.path;
      activeIndex = 0;
      startTimer();
    }
  }

  onBeforeUnmount(() => {
    stopRoute();
    clearPreview();
  });

  return {
    isPlayingRoute,
    isPaused,
    isSimulating,
    routeDistanceText,
    routeDurationText,
    routeDurationSeconds,
    routeArrivalEta,
    previewRoute,
    playRoute,
    pauseRoute,
    resumeRoute,
    stopRoute,
    refreshRoute,
    clearPreview,
  };
}
