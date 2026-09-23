import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { computeGpsStatus, GPS_STALE_AFTER_MS, isAccurateEnoughToPublish } from '@/utils/gpsStatus';

export interface GpsFix {
  lat: number;
  lon: number;
  accuracyMeters: number;
  /** When the device measured this position (GeolocationPosition.timestamp). */
  fixAt: number;
}

const LAST_FIX_STORAGE_KEY = 'jalat-last-gps-fix';
const KEEP_SCREEN_ON_KEY = 'jalat-keep-screen-on';
const FIX_STORAGE_INTERVAL_MS = 5000;

// sessionStorage, not localStorage: a reload keeps the "last known" position, but it does not
// outlive the tab and is dropped on sign-out — a driver's whereabouts shouldn't linger on a
// shared device.
function readStoredFix(): GpsFix | null {
  try {
    const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(LAST_FIX_STORAGE_KEY);
    const fix = raw ? JSON.parse(raw) : null;
    return fix && [fix.lat, fix.lon, fix.accuracyMeters, fix.fixAt].every(Number.isFinite) ? fix : null;
  } catch {
    return null;
  }
}

function storeFix(fix: GpsFix | null): void {
  try {
    if (fix) sessionStorage.setItem(LAST_FIX_STORAGE_KEY, JSON.stringify(fix));
    else sessionStorage.removeItem(LAST_FIX_STORAGE_KEY);
  } catch {
    // Storage blocked (private mode) — the in-memory copy still works.
  }
}

function readKeepScreenOn(): boolean {
  try {
    return localStorage.getItem(KEEP_SCREEN_ON_KEY) !== 'false';
  } catch {
    return true;
  }
}

// The app's single source of truth for the device's GPS. The location publisher and the manual GPS
// check write here; every page reads from here instead of talking to navigator.geolocation itself.
export const useGpsStore = defineStore('gps', () => {
  const latestFix = ref<GpsFix | null>(readStoredFix());
  // When the newest fix *this session* was measured (0 = none yet); latestFix may be a restored one.
  const lastFixAt = ref(0);
  const lastPublishedAt = ref<number | null>(null);
  /** Live mode + online + signed in — location is supposed to be flowing. */
  const tracking = ref(false);
  const blocked = ref<'' | 'denied' | 'unavailable'>('');
  const error = ref('');
  const keepScreenOn = ref(readKeepScreenOn());
  const screenAwake = ref<'off' | 'on' | 'unsupported'>('off');
  const now = ref(Date.now());
  let lastStoredAt = 0;

  // Drives the "3s ago" readouts and lets a silent GPS turn "stale" without any new event.
  if (typeof window !== 'undefined') setInterval(() => (now.value = Date.now()), 1000);

  const status = computed(() =>
    computeGpsStatus({
      tracking: tracking.value,
      blocked: blocked.value,
      lastFixAt: lastFixAt.value,
      accuracyMeters: latestFix.value?.accuracyMeters ?? null,
      now: now.value,
    }),
  );

  /** The latest fix if it is recent and accurate enough to act on (map centring, routing) — else null. */
  function usableFix(maxAgeMs = GPS_STALE_AFTER_MS): GpsFix | null {
    const fix = latestFix.value;
    return fix && Date.now() - fix.fixAt <= maxAgeMs && isAccurateEnoughToPublish(fix.accuracyMeters) ? fix : null;
  }

  function recordFix(fix: GpsFix): void {
    blocked.value = '';
    error.value = '';
    lastFixAt.value = fix.fixAt;
    latestFix.value = fix;
    const at = Date.now();
    if (at - lastStoredAt >= FIX_STORAGE_INTERVAL_MS) {
      storeFix(fix);
      lastStoredAt = at;
    }
  }

  function markPublished(at: number): void {
    lastPublishedAt.value = at;
  }

  function block(reason: 'denied' | 'unavailable', message: string): void {
    blocked.value = reason;
    error.value = message;
  }

  function clearBlock(): void {
    blocked.value = '';
    error.value = '';
  }

  function setKeepScreenOn(value: boolean): void {
    keepScreenOn.value = value;
    try {
      localStorage.setItem(KEEP_SCREEN_ON_KEY, String(value));
    } catch {
      // Preference just won't persist.
    }
  }

  /** Tracking stopped (offline, test mode, or signed out). The last known fix is kept unless signed out. */
  function stopTracking(signedOut: boolean): void {
    tracking.value = false;
    lastFixAt.value = 0;
    lastPublishedAt.value = null;
    clearBlock();
    if (signedOut) {
      latestFix.value = null;
      storeFix(null);
    }
  }

  return {
    latestFix, lastFixAt, lastPublishedAt, tracking, blocked, error, keepScreenOn, screenAwake, now, status,
    usableFix, recordFix, markPublished, block, clearBlock, setKeepScreenOn, stopTracking,
  };
});
