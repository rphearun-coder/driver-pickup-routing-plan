import mqtt, { type MqttClient } from 'mqtt';
import type { ConnectionStatus, DriverLocation } from '../types';

const TOPIC_PATTERN = /^\/topic\/driver\/([^/]+)\/location$/;

function topicForDriver(driverId: string): string {
  return `/topic/driver/${driverId}/location`;
}

function driverIdFromTopic(topic: string): string | null {
  const match = topic.match(TOPIC_PATTERN);
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
    const driverId = driverIdFromTopic(topic);
    if (!driverId) return;
    try {
      const data = JSON.parse(payloadBuffer.toString());
      onLocation?.({ ...data, driverId: data.driverId ?? driverId });
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

export function publishDriverLocation(
  client: MqttClient | undefined | null,
  driverId: string,
  { lat, lon, driverShift = 1, shiftType = 1 }: PublishDriverLocationOptions
): void {
  if (!client || client.disconnecting) return;
  const payload = { driverId, lat, lon, driverShift, shiftType };
  client.publish(topicForDriver(driverId), JSON.stringify(payload));
}
