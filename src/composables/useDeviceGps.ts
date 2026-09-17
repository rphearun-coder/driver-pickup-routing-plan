import { onMounted, ref } from 'vue';
import { getBrowserName, getDevicePlatform, queryGeoPermission, type GeoPermissionState } from '@/utils/deviceInfo';

export interface GpsReading {
  lat: number;
  lon: number;
  accuracyMeters: number;
  at: number;
}

export function useDeviceGps() {
  const platform = getDevicePlatform();
  const browserName = getBrowserName();
  const permissionState = ref<GeoPermissionState>('unsupported');
  const checking = ref(false);
  const reading = ref<GpsReading | null>(null);
  const checkError = ref('');

  async function refreshPermissionState(): Promise<void> {
    permissionState.value = await queryGeoPermission();
  }

  function onFix(position: GeolocationPosition): void {
    checking.value = false;
    permissionState.value = 'granted';
    reading.value = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracyMeters: position.coords.accuracy,
      at: position.timestamp,
    };
  }

  function onError(error: GeolocationPositionError): void {
    checking.value = false;
    checkError.value = error.message || 'Unable to read your location.';
    if (error.code === error.PERMISSION_DENIED) permissionState.value = 'denied';
  }

  // getCurrentPosition (not the Permissions API) is the real source of truth for whether
  // location actually works right now — iOS Safari's Permissions API support is spotty,
  // and this also doubles as a live GPS fix test the driver can trigger on demand.
  function checkNow(): void {
    if (!navigator.geolocation) {
      checkError.value = 'This browser has no location support.';
      permissionState.value = 'unsupported';
      return;
    }
    checking.value = true;
    checkError.value = '';
    navigator.geolocation.getCurrentPosition(
      onFix,
      (error) => {
        // A high-accuracy GPS fix can time out indoors/on desktops with only Wi-Fi-based
        // positioning available. Retry once at low accuracy before surfacing an error —
        // that's typically faster to resolve and still good enough for this check.
        if (error.code !== error.TIMEOUT) return onError(error);
        navigator.geolocation.getCurrentPosition(onFix, onError, {
          enableHighAccuracy: false,
          timeout: 20000,
          maximumAge: 0,
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  onMounted(refreshPermissionState);

  return { platform, browserName, permissionState, checking, reading, checkError, checkNow, refreshPermissionState };
}
