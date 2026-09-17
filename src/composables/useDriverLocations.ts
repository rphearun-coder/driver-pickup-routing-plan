import { onBeforeUnmount, ref, shallowReactive, type Ref } from 'vue';
import { connectDriverMqtt, publishDriverLocation } from '../mqtt/driverMqtt';
import { MQTT_WS_URL, MQTT_USERNAME, MQTT_PASSWORD, MQTT_TOPIC } from '../config';
import type { ConnectionStatus, DriverLocation } from '../types';

// Singleton MQTT connection (module-level, mirrors useAuth.ts) — one socket for
// the whole app session instead of one per page mount, so App.vue's app-wide
// publisher keeps working across navigation. Each caller below still gets its
// own filtered view (own driver, or an arbitrary driver for public tracking)
// on top of this one shared connection.
const connectionStatus = ref<ConnectionStatus>('connecting');
const locationListeners = new Set<(data: DriverLocation) => void>();

const client = connectDriverMqtt({
  url: MQTT_WS_URL,
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  subscribeTopic: MQTT_TOPIC,
  onStatusChange: (status) => (connectionStatus.value = status),
  onLocation: (data) => {
    if (data.driverId == null || data.lat == null || data.lon == null) return;
    locationListeners.forEach((listener) => listener(data));
  },
});

function publishOwnLocation(
  driverId: string,
  lat: number | string,
  lon: number | string,
  extra?: Record<string, unknown>
): void {
  publishDriverLocation(client, driverId, { lat, lon, ...extra });
}

export interface UseDriverLocationsOptions {
  // The one driver id this caller cares about — the logged-in driver's own id
  // on Home/the map page, or an arbitrary driver id from the URL on the public
  // tracking page. Omit it to just get `publishOwnLocation`/`client` without
  // tracking any particular driver's incoming locations.
  currentDriverId?: Ref<string>;
}

export function useDriverLocations({ currentDriverId }: UseDriverLocationsOptions = {}) {
  const driverLocations = shallowReactive(new Map<string, DriverLocation>());
  const locationVersion = ref(0);

  if (currentDriverId) {
    const onLocation = (data: DriverLocation): void => {
      if (data.driverId !== currentDriverId.value) return;
      driverLocations.set(data.driverId, data);
      locationVersion.value++;
    };
    locationListeners.add(onLocation);
    onBeforeUnmount(() => locationListeners.delete(onLocation));
  }

  return { connectionStatus, driverLocations, locationVersion, publishOwnLocation, client };
}
