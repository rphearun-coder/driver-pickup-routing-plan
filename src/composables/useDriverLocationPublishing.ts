import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

export interface PublishLocation {
  (
    driverId: string,
    lat: number,
    lon: number,
    extra?: { driverShift?: number; shiftType?: number }
  ): void;
}

interface PublishedPosition {
  lat: number;
  lon: number;
  publishedAt: number;
}

export interface UseDriverLocationPublishingOptions {
  currentDriverId: Ref<string>;
  isOnline: Ref<boolean>;
  isLiveMode: Ref<boolean>;
  publish: PublishLocation;
  foregroundIntervalMs?: number;
  backgroundIntervalMs?: number;
  minimumDistanceMeters?: number;
}

const DEFAULT_FOREGROUND_INTERVAL_MS = 4000;
const DEFAULT_BACKGROUND_INTERVAL_MS = 30000;
const DEFAULT_MINIMUM_DISTANCE_METERS = 15;

function distanceMeters(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const earthRadiusMeters = 6371000;
  const latitudeDelta = ((to.lat - from.lat) * Math.PI) / 180;
  const longitudeDelta = ((to.lon - from.lon) * Math.PI) / 180;
  const fromLatitude = (from.lat * Math.PI) / 180;
  const toLatitude = (to.lat * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 * Math.cos(fromLatitude) * Math.cos(toLatitude);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useDriverLocationPublishing({
  currentDriverId,
  isOnline,
  isLiveMode,
  publish,
  foregroundIntervalMs = DEFAULT_FOREGROUND_INTERVAL_MS,
  backgroundIntervalMs = DEFAULT_BACKGROUND_INTERVAL_MS,
  minimumDistanceMeters = DEFAULT_MINIMUM_DISTANCE_METERS,
}: UseDriverLocationPublishingOptions) {
  let watchId: number | null = null;
  let positionPollTimer: ReturnType<typeof setInterval> | null = null;
  let lastPublishedPosition: PublishedPosition | null = null;

  // Geolocation failures (permission denied, insecure-origin block, no fix, timeout) used to
  // only hit console.warn — invisible to the driver, who'd just see the marker never move.
  const locationError = ref('');

  function stopWatching(): void {
    if (watchId !== null) {
      navigator.geolocation?.clearWatch(watchId);
      watchId = null;
    }
    if (positionPollTimer) {
      clearInterval(positionPollTimer);
      positionPollTimer = null;
    }
  }

  function publishPosition(position: GeolocationPosition): void {
    locationError.value = '';
    const driverId = currentDriverId.value;
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const timestamp = position.timestamp;
    if (!driverId || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(timestamp)) return;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

    const publishedAt = Date.now();
    const isBackground = document.visibilityState === 'hidden';
    const intervalMs = isBackground ? backgroundIntervalMs : foregroundIntervalMs;
    const movedEnough =
      !lastPublishedPosition ||
      distanceMeters(lastPublishedPosition, { lat, lon }) >= minimumDistanceMeters;
    const intervalElapsed =
      !lastPublishedPosition || publishedAt - lastPublishedPosition.publishedAt >= intervalMs;
    if (isBackground ? !intervalElapsed : !movedEnough && !intervalElapsed) return;

    publish(driverId, lat, lon, { driverShift: 2, shiftType: 1 });
    lastPublishedPosition = { lat, lon, publishedAt };
  }

  function startWatching(): void {
    stopWatching();
    if (!isLiveMode.value || !isOnline.value || !currentDriverId.value) return;
    if (!navigator.geolocation) {
      locationError.value = 'This browser has no location support.';
      return;
    }
    if (!window.isSecureContext) {
      // Geolocation is blocked outright on non-HTTPS, non-localhost origins — e.g. testing
      // over a plain http://<lan-ip> address on a phone. watchPosition would just silently
      // never fire, so surface this before even trying.
      locationError.value = 'Location requires a secure (HTTPS) connection — this page was opened over plain HTTP.';
      return;
    }
    const geoOptions: PositionOptions = {
      enableHighAccuracy: document.visibilityState !== 'hidden',
      maximumAge: document.visibilityState === 'hidden' ? backgroundIntervalMs : 1000,
      timeout: 10000,
    };
    const handleLocationError = (error: GeolocationPositionError) => {
      console.warn('Unable to read driver location:', error.message);
      locationError.value = error.message || 'Unable to read your location.';
    };

    watchId = navigator.geolocation.watchPosition(publishPosition, handleLocationError, geoOptions);
    const pollIntervalMs = document.visibilityState === 'hidden' ? backgroundIntervalMs : foregroundIntervalMs;
    positionPollTimer = setInterval(() => {
      navigator.geolocation.getCurrentPosition(publishPosition, handleLocationError, geoOptions);
    }, pollIntervalMs);
  }

  watch([isLiveMode, isOnline, currentDriverId], ([live, online, driverId]) => {
    if (!live || !online || !driverId) {
      stopWatching();
      lastPublishedPosition = null;
      locationError.value = '';
      return;
    }
    startWatching();
  }, { immediate: true });

  document.addEventListener('visibilitychange', startWatching);
  onBeforeUnmount(() => {
    stopWatching();
    document.removeEventListener('visibilitychange', startWatching);
  });

  return { locationError };
}