import mqtt, { type MqttClient } from 'mqtt';
import type { ConnectionStatus, DriverLocation } from '../types';

const DRIVER_LOCATION_TOPIC_PATTERN = /^\/topic\/driver\/([^/]+)\/location$/;
const DRIVER_LOCATION_TOPIC_SUFFIX = '/location';
// retain: true — lets the broker hand a fresh subscriber (e.g. a page refresh, or the
// public tracking link opening for the first time) the driver's last known position
// immediately, instead of leaving the map blank until the next live publish.
const MQTT_PUBLISH_OPTIONS = { qos: 0 as const, retain: true };

function topicForDriver(driverId: string): string {
  return `/topic/driver/${driverId}${DRIVER_LOCATION_TOPIC_SUFFIX}`;
}

function driverIdFromTopic(topic: string): string | null {
  const match = topic.match(DRIVER_LOCATION_TOPIC_PATTERN);
  return match ? match[1] : null;
}

export interface ConnectDriverMqttOptions {
  url: string;
  username?: string;
  password?: string;
  subscribeTopic?: string;
  onStatusChange?: (status: ConnectionStatus) => void;
  onLocation?: (data: DriverLocation) => void;
}

export function connectDriverMqtt({
  url,
  username,
  password,
  subscribeTopic = '/topic/driver/+/location',
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

  client.on('connect', () => {
    onStatusChange?.('connected');
    client.subscribe(subscribeTopic, (err) => {
      if (err) console.error('Subscribe failed:', err);
    });
  });

  client.on('reconnect', () => onStatusChange?.('connecting'));
  client.on('close', () => onStatusChange?.('disconnected'));
  client.on('error', (err) => {
    console.error('MQTT error:', err);
    onStatusChange?.('error');
  });

  client.on('message', (topic, payloadBuffer) => {
    try {
      const data = JSON.parse(payloadBuffer.toString());
      const driverId = data.driverId ?? driverIdFromTopic(topic);
      if (!driverId) return;
      onLocation?.({ ...data, driverId });
    } catch (err) {
      console.error('Failed to parse MQTT payload:', err, payloadBuffer.toString());
    }
  });

  return client;
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
  client.publish(topicForDriver(driverId), JSON.stringify(payload), MQTT_PUBLISH_OPTIONS);
}
