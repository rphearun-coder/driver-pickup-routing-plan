import { computed, ref, watch } from 'vue';
import { useAuth } from './useAuth';
import { useDriverLocations } from './useDriverLocations';
import { useDriverPresence } from './useDriverPresence';
import { useLocationMode } from './useLocationMode';

interface PublishedPosition {
  lat: number;
  lon: number;
  publishedAt: number;
  accuracy: number;
}

const FOREGROUND_INTERVAL_MS = 4000;
const BACKGROUND_INTERVAL_MS = 30000;
const MINIMUM_DISTANCE_METERS = 30;
const MAXIMUM_ACCEPTED_ACCURACY_METERS = 50;

// Matches Jalat-Location-Service's ShiftMapEnum (MORNING = 1, AFTERNOON = 2) — the Order
// Service looks up the driver's location tagged with the pickup order's own time slot, so
// this is a best-effort match against "now" rather than a guaranteed hit for every order.
export function currentShiftType(): number {
  return new Date().getHours() < 12 ? 1 : 2;
}

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

// Singleton (module-level state, mirrors useAuth.ts) — driven once from
// App.vue so the driver's live position keeps publishing across every page
// the moment they go online, not just while they happen to be on the map page.
let watchId: number | null = null;
let positionPollTimer: ReturnType<typeof setInterval> | null = null;
let lastPublishedPosition: PublishedPosition | null = null;

// Geolocation failures (permission denied, insecure-origin block, no fix, timeout) used to
// only hit console.warn — invisible to the driver, who'd just see the marker never move.
const locationError = ref('');

const { driverUser } = useAuth();
const { isOnline } = useDriverPresence();
const { isLiveMode } = useLocationMode();
const { publishOwnLocation } = useDriverLocations();
const currentDriverId = computed(() => driverUser.value?.id || '');

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
  const accuracy = position.coords.accuracy;
  const timestamp = position.timestamp;
  if (!driverId || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(timestamp)) return;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
  if (!Number.isFinite(accuracy) || accuracy > MAXIMUM_ACCEPTED_ACCURACY_METERS) return;

  const publishedAt = Date.now();
  const distance = lastPublishedPosition
    ? distanceMeters(lastPublishedPosition, { lat, lon })
    : Number.POSITIVE_INFINITY;
  const uncertaintyThreshold = lastPublishedPosition
    ? lastPublishedPosition.accuracy + accuracy
    : 0;
  const movedEnough = distance >= Math.max(MINIMUM_DISTANCE_METERS, uncertaintyThreshold);
  if (!movedEnough) return;

  // driverShift 1 = PICKUP (Jalat-Location-Service's DriverShiftEnum) — every distance
  // lookup on the Order service side (pickup list, driver daily activity) hardcodes
  // 'PICKUP' when reading this driver's last location back, so anything published under
  // a different driverShift is never found, silently leaving pickup distance at 0.
  publishOwnLocation(driverId, lat, lon, { driverShift: 1, shiftType: currentShiftType() });
  lastPublishedPosition = { lat, lon, publishedAt, accuracy };
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
    maximumAge: document.visibilityState === 'hidden' ? BACKGROUND_INTERVAL_MS : 1000,
    timeout: 20000,
  };
  const handleLocationError = (error: GeolocationPositionError) => {
    console.warn('Unable to read driver location:', error.message);
    // watchPosition runs continuously alongside this poll's own getCurrentPosition calls —
    // a slow/timed-out poll doesn't mean location has actually stopped working if watchPosition
    // delivered a fix recently. Only surface the error once there's truly been no fix in a while,
    // instead of flashing "Timeout expired" over an otherwise-healthy live feed.
    const recentFix = lastPublishedPosition && Date.now() - lastPublishedPosition.publishedAt < geoOptions.timeout!;
    if (!recentFix) locationError.value = error.message || 'Unable to read your location.';
  };

  watchId = navigator.geolocation.watchPosition(publishPosition, handleLocationError, geoOptions);
  const pollIntervalMs = document.visibilityState === 'hidden' ? BACKGROUND_INTERVAL_MS : FOREGROUND_INTERVAL_MS;
  positionPollTimer = setInterval(() => {
    navigator.geolocation.getCurrentPosition(publishPosition, handleLocationError, geoOptions);
  }, pollIntervalMs);
}

export function refreshDriverLocation(): void {
  if (!isLiveMode.value || !isOnline.value || !currentDriverId.value || !navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    publishPosition,
    () => undefined,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
  );
}

watch(
  [isLiveMode, isOnline, currentDriverId],
  ([live, online, driverId]) => {
    if (!live || !online || !driverId) {
      stopWatching();
      lastPublishedPosition = null;
      locationError.value = '';
      return;
    }
    startWatching();
  },
  { immediate: true },
);

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', startWatching);
}

export function useDriverLocationPublishing() {
  return { locationError, refreshLocation: refreshDriverLocation };
}
