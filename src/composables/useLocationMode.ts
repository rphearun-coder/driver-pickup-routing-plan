import { computed, ref } from 'vue';
import { APP_MODE } from '@/config';

export type LocationMode = 'test' | 'live';

const MODE_STORAGE_KEY = 'jalat-location-mode';

function readStoredMode(): LocationMode {
  const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === 'test' || stored === 'live') return stored;
  return APP_MODE === 'production' ? 'live' : 'test';
}

// Singleton (module-level ref, mirrors useAuth.ts) — the map page's Test/Live
// switch and App.vue's app-wide location publisher must agree on the same
// value, not each read their own copy of localStorage.
const locationMode = ref<LocationMode>(readStoredMode());
const isLiveMode = computed(() => locationMode.value === 'live');

function setLocationMode(mode: LocationMode): void {
  if (locationMode.value === mode) return;
  locationMode.value = mode;
  window.localStorage.setItem(MODE_STORAGE_KEY, mode);
}

export function useLocationMode() {
  return { locationMode, isLiveMode, setLocationMode };
}
