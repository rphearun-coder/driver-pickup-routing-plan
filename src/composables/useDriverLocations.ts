import { ref, shallowReactive, onBeforeUnmount, type Ref } from 'vue';
import { connectDriverMqtt, publishDriverLocation } from '../mqtt/driverMqtt';
import { MQTT_WS_URL, MQTT_USERNAME, MQTT_PASSWORD, MQTT_TOPIC } from '../config';
import type { ConnectionStatus, DriverLocation } from '../types';

export interface UseDriverLocationsOptions {
  url?: string;
  username?: string;
  password?: string;
  topic?: string;
  currentDriverId?: Ref<string>;
}

export function useDriverLocations({
  url = MQTT_WS_URL,
  username = MQTT_USERNAME,
  password = MQTT_PASSWORD,
  topic = MQTT_TOPIC,
  currentDriverId = ref(''),
}: UseDriverLocationsOptions = {}) {
  const connectionStatus = ref<ConnectionStatus>('connecting');
  const driverLocations = shallowReactive(new Map<string, DriverLocation>());
  const locationVersion = ref(0);

  const client = connectDriverMqtt({
    url,
    username,
    password,
    subscribeTopic: topic,
    onStatusChange: (status) => (connectionStatus.value = status),
    onLocation: (data) => {
      if (data.driverId == null || data.lat == null || data.lon == null) return;
      if (data.driverId !== currentDriverId.value) return;
      driverLocations.set(data.driverId, data);
      locationVersion.value++;
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

  onBeforeUnmount(() => client.end(true));

  return { connectionStatus, driverLocations, locationVersion, publishOwnLocation, client };
}
