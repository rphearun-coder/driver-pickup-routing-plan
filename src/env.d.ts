/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_MODE: string;
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  readonly VITE_MQTT_WS_URL: string;
  readonly VITE_MQTT_USERNAME: string;
  readonly VITE_MQTT_PASSWORD: string;
  readonly VITE_MQTT_TOPIC: string;
  readonly VITE_PICKUP_POLL_INTERVAL_MS: string;
  readonly VITE_USER_SERVICE_URL: string;
  readonly VITE_LOCATION_SERVICE_URL: string;
  readonly VITE_ORDER_SERVICE_URL: string;
  readonly VITE_DEV_BYPASS_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    google?: any;
  }
}

export {};
