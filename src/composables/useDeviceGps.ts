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
      (position) => {
        checking.value = false;
        permissionState.value = 'granted';
        reading.value = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          at: position.timestamp,
        };
      },
      (error) => {
        checking.value = false;
        checkError.value = error.message || 'Unable to read your location.';
        if (error.code === error.PERMISSION_DENIED) permissionState.value = 'denied';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  onMounted(refreshPermissionState);

  return { platform, browserName, permissionState, checking, reading, checkError, checkNow, refreshPermissionState };
}
