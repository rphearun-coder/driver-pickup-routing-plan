export const APP_MODE = import.meta.env.VITE_MODE;

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export const MQTT_WS_URL = import.meta.env.VITE_MQTT_WS_URL;
export const MQTT_USERNAME = import.meta.env.VITE_MQTT_USERNAME;
export const MQTT_PASSWORD = import.meta.env.VITE_MQTT_PASSWORD;

export const PICKUP_POLL_INTERVAL_MS = Number(import.meta.env.VITE_PICKUP_POLL_INTERVAL_MS) || 15000;

export const USER_SERVICE_URL = import.meta.env.VITE_USER_SERVICE_URL || 'http://localhost:8081/v1';
export const LOCATION_SERVICE_URL = import.meta.env.VITE_LOCATION_SERVICE_URL || 'http://localhost:8084/v1';
export const ORDER_SERVICE_URL = import.meta.env.VITE_ORDER_SERVICE_URL || 'http://localhost:8082/v1';

// Dev-only: skip the real GraphQL login/online-toggle calls (no backend needed locally)
// and use the bundled sample driver profile instead. Never true in a production build.
export const DEV_BYPASS_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
