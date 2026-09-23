import mqtt, { type MqttClient } from 'mqtt';
import type { ConnectionStatus, DriverLocation } from '../types';

// retain: true — lets the broker hand a fresh subscriber (e.g. a page refresh, or the
// public tracking link opening for the first time) the driver's last known position
// immediately, instead of leaving the map blank until the next live publish.
const MQTT_PUBLISH_OPTIONS = { qos: 0 as const, retain: true };

export const mqttDriverLocationBroadcastTopic = (driverId: string) => `/topic/driver/${driverId}/location`;

export interface ConnectDriverMqttOptions {
  url: string;
  username?: string;
  password?: string;
  onStatusChange?: (status: ConnectionStatus) => void;
  onLocation?: (data: DriverLocation) => void;
}

// Ref-counted (not a plain Set) so two callers tracking the same driver don't have one's
// unsubscribe kill the topic out from under the other. Module-level because the MQTT
// client below is a singleton — subscriptions live and die with that one connection,
// not with any single useDriverLocations() call site.
const driverTopicRefCounts = new Map<string, number>();
let sharedClient: MqttClient | null = null;

export function connectDriverMqtt({
  url,
  username,
  password,
  onStatusChange,
  onLocation,
}: ConnectDriverMqttOptions): MqttClient {
  const client = mqtt.connect(url, {
    username,
    password,
    reconnectPeriod: 1000,
    connectTimeout: 30000,
    keepalive: 10,
    clean: true,
  });
  sharedClient = client;

  client.on('connect', () => {
    onStatusChange?.('connected');
    // clean:true means the broker forgets every subscription on disconnect, so a network
    // blip silently stops live updates unless we resubscribe to what's still wanted.
    const topics = [...driverTopicRefCounts.keys()];
    if (topics.length) {
      client.subscribe(topics, (err) => {
        if (err) console.error('Resubscribe failed:', err);
      });
    }
  });

  client.on('reconnect', () => onStatusChange?.('connecting'));
  client.on('close', () => onStatusChange?.('disconnected'));
  client.on('error', (err) => {
    console.error('MQTT error:', err);
    onStatusChange?.('error');
  });

  client.on('message', (_topic, payloadBuffer) => {
    try {
      const data = JSON.parse(payloadBuffer.toString());
      const driverId = data.driverId;
      if (!driverId) return;
      onLocation?.({ ...data, driverId });
    } catch (err) {
      console.error('Failed to parse MQTT payload:', err, payloadBuffer.toString());
    }
  });

  return client;
}

// Subscribes to just this one driver's broadcast topic instead of the old wildcard
// (/topic/driver/+/location), which handed every active driver's live position to
// anyone connected — including an anonymous visitor on the public tracking page.
export function subscribeDriverTopic(driverId: string): void {
  if (!sharedClient || !driverId) return;
  const topic = mqttDriverLocationBroadcastTopic(driverId);
  const count = driverTopicRefCounts.get(topic) ?? 0;
  driverTopicRefCounts.set(topic, count + 1);
  if (count > 0) return; // already subscribed on behalf of another caller

  sharedClient.subscribe(topic, (err) => {
    if (err) console.error('Subscribe failed:', err);
  });
}

export function unsubscribeDriverTopic(driverId: string): void {
  if (!sharedClient || !driverId) return;
  const topic = mqttDriverLocationBroadcastTopic(driverId);
  const count = driverTopicRefCounts.get(topic) ?? 0;
  if (count <= 1) {
    driverTopicRefCounts.delete(topic);
    sharedClient.unsubscribe(topic);
  } else {
    driverTopicRefCounts.set(topic, count - 1);
  }
}

export interface PublishDriverLocationOptions {
  lat: number | string;
  lon: number | string;
  driverShift?: number;
  shiftType?: number;
}

interface DriverLocationPayload {
  driverId: string;
  lat: number;
  lon: number;
  lastUpdatedAt: number;
  driverShift: number;
  shiftType: number;
}

function validCoordinate(value: number | string, min: number, max: number): number | null {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
}

// Defaults match Jalat-Location-Service's DriverShiftEnum.PICKUP / ShiftMapEnum.MORNING —
// the only driverShift value the Order Service's getDriverLocation lookups ever query for
// (see getOrderListByUser and driver-daily-activity.service.ts, both hardcode 'PICKUP').
// A location published under any other driverShift is invisible to those lookups.
export function publishDriverLocation(
  client: MqttClient | undefined | null,
  driverId: string,
  { lat, lon, driverShift = 1, shiftType = 1 }: PublishDriverLocationOptions
): void {
  if (!client || client.disconnecting) return;
  const latitude = validCoordinate(lat, -90, 90);
  const longitude = validCoordinate(lon, -180, 180);
  if (!driverId.trim() || latitude === null || longitude === null) return;
  const payload: DriverLocationPayload = {
    driverId,
    lat: latitude,
    lon: longitude,
    lastUpdatedAt: Date.now(),
    driverShift,
    shiftType,
  };
  client.publish('/topic/driver/location', JSON.stringify(payload), MQTT_PUBLISH_OPTIONS);
}
