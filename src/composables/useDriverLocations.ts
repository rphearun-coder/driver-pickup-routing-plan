import { onBeforeUnmount, ref, shallowReactive, watch, type Ref } from 'vue';
import { connectDriverMqtt, publishDriverLocation, subscribeDriverTopic, unsubscribeDriverTopic } from '../mqtt/driverMqtt';
import { getDriverLastedLocation } from '../api/driver-location';
import { MQTT_WS_URL, MQTT_USERNAME, MQTT_PASSWORD } from '../config';
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
      const lastUpdatedAt = Number(data.lastUpdatedAt);
      driverLocations.set(data.driverId, {
        ...data,
        lastUpdatedAt: Number.isFinite(lastUpdatedAt) ? lastUpdatedAt : Date.now(),
      });
      locationVersion.value++;
    };
    locationListeners.add(onLocation);
    onBeforeUnmount(() => locationListeners.delete(onLocation));

    // publishDriverLocationByDriverId only fires off the back of a driver's real GPS
    // heartbeat — it's a push, not a repeating cycle — so a subscriber that starts
    // listening between heartbeats (e.g. a public tracking link opened mid-gap) sees
    // nothing until the driver's next update. Seed from the backend's last known
    // position once we know which driver to track, so the map isn't blank meanwhile.
    const seedFromLastKnown = async (driverId: string): Promise<void> => {
      if (!driverId || driverLocations.has(driverId)) return;
      try {
        const last = await getDriverLastedLocation(driverId);
        if (!last || driverLocations.has(driverId) || driverId !== currentDriverId.value) return;
        driverLocations.set(driverId, last);
        locationVersion.value++;
      } catch (err) {
        console.error('Failed to load last known driver location:', err);
      }
    };

    // Subscribe to just this driver's own broadcast topic rather than the wildcard the
    // MQTT client used to sit on — that wildcard handed every active driver's live
    // position to whoever held this connection, including an anonymous public-tracking
    // page visitor watching just one delivery.
    watch(
      currentDriverId,
      (id, previousId) => {
        if (previousId) unsubscribeDriverTopic(previousId);
        if (id) subscribeDriverTopic(id);
        seedFromLastKnown(id);
      },
      { immediate: true }
    );
    onBeforeUnmount(() => {
      if (currentDriverId.value) unsubscribeDriverTopic(currentDriverId.value);
    });
  }

  return { connectionStatus, driverLocations, locationVersion, publishOwnLocation, client };
}
