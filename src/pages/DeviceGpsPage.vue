<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { useDeviceGps } from '@/composables/useDeviceGps';
import { useDriverLocationPublishing, currentShiftType } from '@/composables/useDriverLocationPublishing';
import { useDriverLocations } from '@/composables/useDriverLocations';
import { useDriverPresence } from '@/composables/useDriverPresence';
import { useGoogleMap } from '@/composables/useGoogleMap';
import { useLocationMode, type LocationMode } from '@/composables/useLocationMode';

const router = useRouter();

const { platform, browserName, permissionState, checking, reading, checkError, checkNow, refreshPermissionState } =
  useDeviceGps();
const { locationError } = useDriverLocationPublishing();
const { locationMode, setLocationMode } = useLocationMode();
const { driverUser } = useAuth();
const { isOnline, isSyncing: presenceSyncing, presenceError, toggleOnline } = useDriverPresence();
const { publishOwnLocation } = useDriverLocations();

const syncStatus = ref<'idle' | 'syncing' | 'done' | 'error'>('idle');
const isWatching = ref(false);
const watchError = ref('');
let watchId: number | null = null;
const fixHistory = ref<Array<{ lat: number; lon: number; acc: number; at: number }>>([]);
const MAX_HISTORY = 5;

// ───────────────────────────── Live watch ─────────────────────────────
function startWatch(): void {
  if (!navigator.geolocation) {
    watchError.value = 'Geolocation not supported in this browser.';
    return;
  }
  watchError.value = '';
  isWatching.value = true;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const fix = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        acc: Math.round(pos.coords.accuracy),
        at: pos.timestamp,
      };
      // Update reading via fake watcher
      fixHistory.value = [fix, ...fixHistory.value].slice(0, MAX_HISTORY);
    },
    (err) => {
      watchError.value = err.message || 'Watch error';
      if (err.code === err.PERMISSION_DENIED) stopWatch();
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
}

function stopWatch(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  isWatching.value = false;
}

onBeforeUnmount(stopWatch);

// ─────────── When a GPS check returns → sync online + push location ───
watch(reading, async (value) => {
  if (!value) return;
  const driverId = driverUser.value?.id;
  if (!driverId) return;
  syncStatus.value = 'syncing';
  try {
    if (!isOnline.value) await toggleOnline();
    publishOwnLocation(driverId, value.lat, value.lon, { driverShift: 1, shiftType: currentShiftType() });
    syncStatus.value = 'done';
  } catch {
    syncStatus.value = 'error';
  }
});

// ─────────────────────── Map preview ─────────────────────────────────
const mapEl = ref<HTMLDivElement | null>(null);
const { google, map, init: initMap } = useGoogleMap(mapEl, {
  center: { lat: 0, lng: 0 },
  zoom: 16,
  disableDefaultUI: true,
});
let marker: any = null;
let accuracyCircle: any = null;
let mapReady = false;

watch(
  reading,
  async (value) => {
    if (!value) return;
    const position = { lat: value.lat, lng: value.lon };
    if (!mapReady) {
      mapReady = true;
      await initMap();
      map.value.setCenter(position);
      marker = new google.value.maps.Marker({ map: map.value, position });
      accuracyCircle = new google.value.maps.Circle({
        map: map.value,
        center: position,
        radius: value.accuracyMeters,
        fillColor: '#000000',
        fillOpacity: 0.08,
        strokeColor: '#000000',
        strokeOpacity: 0.35,
        strokeWeight: 1.5,
      });
      return;
    }
    map.value.panTo(position);
    marker?.setPosition(position);
    accuracyCircle?.setCenter(position);
    accuracyCircle?.setRadius(value.accuracyMeters);
  },
  { flush: 'post' }
);

// ─────────────────────── Computed helpers ────────────────────────────
const permissionColor = computed(() => {
  switch (permissionState.value) {
    case 'granted': return 'perm-granted';
    case 'denied': return 'perm-denied';
    case 'prompt': return 'perm-prompt';
    default: return 'perm-unknown';
  }
});

const permissionLabel = computed(() => {
  switch (permissionState.value) {
    case 'granted': return 'Allowed';
    case 'denied': return 'Blocked';
    case 'prompt': return 'Not asked yet';
    default: return 'Unknown';
  }
});

const gpsSignalStrength = computed(() => {
  if (!reading.value) return null;
  const acc = reading.value.accuracyMeters;
  if (acc <= 10) return { label: 'Excellent', bars: 4, color: '#16a34a' };
  if (acc <= 25) return { label: 'Good', bars: 3, color: '#2563eb' };
  if (acc <= 50) return { label: 'Fair', bars: 2, color: '#d97706' };
  return { label: 'Poor', bars: 1, color: '#dc2626' };
});

const activeIssues = computed<string[]>(() => {
  const issues: string[] = [];
  if (permissionState.value === 'denied') issues.push('Location permission is blocked for this site.');
  if (permissionState.value === 'unsupported') issues.push("This browser doesn't support location services.");
  if (checkError.value) issues.push(checkError.value);
  if (watchError.value) issues.push(watchError.value);
  if (locationError.value) issues.push(`Live tracking: ${locationError.value}`);
  return issues;
});

const needsRepair = computed(() => activeIssues.value.length > 0);

const helpSteps = computed<string[]>(() => {
  if (permissionState.value === 'unsupported') {
    return [`Try Chrome or Safari — they have the most reliable location support.`];
  }
  if (platform === 'iOS') {
    return [
      `Open iPhone Settings → Privacy & Security → Location Services → make sure Location Services is ON.`,
      `Scroll down to ${browserName} → tap it → set access to "While Using the App".`,
      `Then come back here and tap "Request GPS access" below.`,
    ];
  }
  if (platform === 'Android') {
    return [
      `Open Android Settings → Apps → ${browserName} → Permissions → Location → set to Allow.`,
      `If location is disabled system-wide, enable it from quick-settings or Settings → Location.`,
      `Then tap "Request GPS access" below.`,
    ];
  }
  return [
    `Click the 🔒 lock icon in your browser's address bar.`,
    `Find "Location" and change it to "Allow".`,
    `Refresh the page if needed, then tap "Request GPS access".`,
  ];
});

async function repairNow(): Promise<void> {
  await refreshPermissionState();
  checkNow();
}

async function requestPermission(): Promise<void> {
  await refreshPermissionState();
  checkNow();
}

function formatCoord(v: number): string {
  return v.toFixed(6);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function onModeChange(mode: LocationMode): void {
  setLocationMode(mode);
}
</script>

<template>
  <div class="gps-page">
    <!-- ─── Header ─── -->
    <header class="gps-header">
      <button type="button" class="btn-header-back" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <div class="header-title-block">
        <h1 class="header-title">Device &amp; GPS</h1>
        <span class="header-sub">{{ platform }} · {{ browserName }}</span>
      </div>
      <!-- Global permission badge -->
      <div class="perm-badge-wrap" :class="permissionColor">
        <span class="perm-dot"></span>
        <span class="perm-label">{{ permissionLabel }}</span>
      </div>
    </header>

    <main class="gps-body">

      <!-- ══════════════ ISSUES ALERT ══════════════ -->
      <section v-if="needsRepair" class="issue-alert-card">
        <div class="issue-alert-top">
          <div class="issue-icon-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <p class="issue-title">Location isn't working</p>
            <ul class="issue-list">
              <li v-for="(issue, i) in activeIssues" :key="i">{{ issue }}</li>
            </ul>
          </div>
        </div>

        <div class="issue-steps-box">
          <p class="steps-label">How to fix on {{ platform }}</p>
          <ol class="steps-ol">
            <li v-for="(step, i) in helpSteps" :key="i">{{ step }}</li>
          </ol>
        </div>

        <button type="button" class="btn-repair" :disabled="checking" @click="repairNow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          {{ checking ? 'Checking…' : 'I fixed it — check again' }}
        </button>
      </section>

      <!-- ══════════════ GPS CHECK ══════════════ -->
      <section class="card">
        <div class="card-header-row">
          <div class="card-icon-box icon-satellite">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M6.3 6.3a8.8 8.8 0 0 0 0 11.4" />
              <path d="M17.7 6.3a8.8 8.8 0 0 1 0 11.4" />
              <path d="M3.7 3.7a13.5 13.5 0 0 0 0 16.6" />
              <path d="M20.3 3.7a13.5 13.5 0 0 1 0 16.6" />
            </svg>
          </div>
          <div>
            <p class="card-label">GPS Fix</p>
            <p class="card-sub">{{ reading ? 'Position acquired' : 'No reading yet' }}</p>
          </div>
          <!-- Signal strength bars -->
          <div v-if="gpsSignalStrength" class="signal-bars" :title="gpsSignalStrength.label">
            <div
              v-for="b in 4"
              :key="b"
              class="signal-bar"
              :class="{ lit: b <= gpsSignalStrength.bars }"
              :style="b <= gpsSignalStrength.bars ? { background: gpsSignalStrength.color } : {}"
            ></div>
            <span class="signal-label" :style="{ color: gpsSignalStrength.color }">{{ gpsSignalStrength.label }}</span>
          </div>
        </div>

        <!-- Permission not granted → big request button -->
        <div v-if="permissionState !== 'granted'" class="permission-prompt-box">
          <p class="perm-prompt-text">
            <span v-if="permissionState === 'denied'">GPS permission is <strong>blocked</strong>. Follow the steps above, then tap the button below.</span>
            <span v-else>The app needs access to your device GPS to track your location while on duty.</span>
          </p>
          <button type="button" class="btn-request-permission" @click="requestPermission">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Request GPS access
          </button>
        </div>

        <!-- Granted → check button + reading -->
        <template v-else>
          <button type="button" class="btn-check-gps" :disabled="checking" @click="checkNow">
            <svg v-if="!checking" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <svg v-else class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {{ checking ? 'Getting GPS fix…' : 'Check GPS now' }}
          </button>

          <!-- Reading result -->
          <div v-if="reading" class="reading-block">
            <div class="reading-coords-row">
              <div class="coord-pill">
                <span class="coord-axis">LAT</span>
                <span class="coord-val">{{ formatCoord(reading.lat) }}</span>
              </div>
              <div class="coord-pill">
                <span class="coord-axis">LNG</span>
                <span class="coord-val">{{ formatCoord(reading.lon) }}</span>
              </div>
            </div>
            <div class="reading-meta-row">
              <span class="meta-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {{ formatTime(reading.at) }}
              </span>
              <span class="meta-chip accuracy">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                ±{{ Math.round(reading.accuracyMeters) }} m accuracy
              </span>
            </div>

            <!-- Status feedback -->
            <div v-if="syncStatus === 'syncing'" class="status-feedback syncing">
              <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Syncing location…
            </div>
            <div v-else-if="syncStatus === 'done' && !presenceError" class="status-feedback success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {{ isOnline ? 'Online' : 'Offline' }} · Location pushed
            </div>
            <div v-else-if="syncStatus === 'error' || presenceError" class="status-feedback error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/>
              </svg>
              {{ presenceError || 'Sync failed' }}
            </div>

            <!-- Map Preview -->
            <div ref="mapEl" class="gps-map-preview"></div>
          </div>

          <!-- Error state -->
          <div v-if="checkError" class="inline-error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {{ checkError }}
          </div>
        </template>
      </section>

      <!-- ══════════════ LIVE WATCH ══════════════ -->
      <section class="card">
        <div class="card-header-row">
          <div class="card-icon-box icon-live">
            <div v-if="isWatching" class="live-pulse-dot">
              <span class="pulse-ring"></span>
              <span class="pulse-core"></span>
            </div>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <p class="card-label">Live GPS Watch</p>
            <p class="card-sub">{{ isWatching ? 'Streaming position updates' : 'Start tracking continuously' }}</p>
          </div>
          <div v-if="isWatching" class="live-badge">LIVE</div>
        </div>

        <div class="watch-actions-row">
          <button
            v-if="!isWatching"
            type="button"
            class="btn-watch-start"
            :disabled="permissionState === 'denied'"
            @click="startWatch"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Start watching
          </button>
          <button v-else type="button" class="btn-watch-stop" @click="stopWatch">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
            Stop watching
          </button>
        </div>

        <!-- Fix history -->
        <div v-if="fixHistory.length" class="fix-history">
          <p class="history-label">Recent Fixes</p>
          <div v-for="(fix, i) in fixHistory" :key="i" class="fix-row" :class="{ latest: i === 0 }">
            <span class="fix-num">#{{ i === 0 ? 'LATEST' : fixHistory.length - i }}</span>
            <span class="fix-coords">{{ fix.lat.toFixed(5) }}, {{ fix.lon.toFixed(5) }}</span>
            <span class="fix-acc">±{{ fix.acc }}m</span>
            <span class="fix-time">{{ formatTime(fix.at) }}</span>
          </div>
        </div>

        <div v-if="watchError" class="inline-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
          </svg>
          {{ watchError }}
        </div>
      </section>

      <!-- ══════════════ ONLINE STATUS ══════════════ -->
      <section class="card">
        <div class="card-header-row">
          <div class="card-icon-box" :class="isOnline ? 'icon-online' : 'icon-offline'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <circle cx="12" cy="20" r="1" fill="currentColor" />
            </svg>
          </div>
          <div class="flex-grow">
            <p class="card-label">Driver Online Status</p>
            <p class="card-sub">{{ isOnline ? 'You are online — receiving pickups' : 'You are offline — no pickups' }}</p>
          </div>
          <div class="online-pill" :class="isOnline ? 'is-online' : 'is-offline'">
            {{ isOnline ? 'Online' : 'Offline' }}
          </div>
        </div>

        <button
          type="button"
          class="btn-toggle-online"
          :class="isOnline ? 'btn-go-offline' : 'btn-go-online'"
          :disabled="presenceSyncing"
          @click="toggleOnline"
        >
          <svg v-if="presenceSyncing" class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {{ presenceSyncing ? 'Updating…' : (isOnline ? 'Go Offline' : 'Go Online') }}
        </button>

        <p v-if="presenceError" class="inline-error mt-8">{{ presenceError }}</p>
      </section>

      <!-- ══════════════ LOCATION MODE ══════════════ -->
      <section class="card">
        <div class="card-header-row">
          <div class="card-icon-box icon-mode">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          </div>
          <div>
            <p class="card-label">Location Mode</p>
            <p class="card-sub">
              <span v-if="locationMode === 'live'" class="mode-live-text">Publishing real GPS while online</span>
              <span v-else class="mode-test-text">Using simulated positions only</span>
            </p>
          </div>
        </div>

        <div class="mode-selector">
          <button
            type="button"
            class="mode-option"
            :class="{ selected: locationMode === 'test' }"
            @click="onModeChange('test')"
          >
            <div class="mode-option-icon mode-icon-test">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div class="mode-option-text">
              <strong>Test GPS</strong>
              <span>Simulated route — safe for dev & testing</span>
            </div>
            <div v-if="locationMode === 'test'" class="mode-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </button>

          <button
            type="button"
            class="mode-option"
            :class="{ selected: locationMode === 'live' }"
            @click="onModeChange('live')"
          >
            <div class="mode-option-icon mode-icon-live">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div class="mode-option-text">
              <strong>Live GPS</strong>
              <span>Real device location published to MQTT</span>
            </div>
            <div v-if="locationMode === 'live'" class="mode-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </button>
        </div>

        <div v-if="locationError" class="inline-error mt-8">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
          </svg>
          {{ locationError }}
        </div>
      </section>

      <!-- ══════════════ DEVICE INFO ══════════════ -->
      <section class="card device-info-card">
        <p class="card-label">Device Info</p>
        <div class="device-info-grid">
          <div class="di-row">
            <span class="di-key">Platform</span>
            <span class="di-val">{{ platform }}</span>
          </div>
          <div class="di-row">
            <span class="di-key">Browser</span>
            <span class="di-val">{{ browserName }}</span>
          </div>
          <div class="di-row">
            <span class="di-key">Geolocation API</span>
            <span class="di-val" :class="navigator.geolocation ? 'val-green' : 'val-red'">
              {{ navigator.geolocation ? 'Supported' : 'Not supported' }}
            </span>
          </div>
          <div class="di-row">
            <span class="di-key">Secure Context</span>
            <span class="di-val" :class="window.isSecureContext ? 'val-green' : 'val-red'">
              {{ window.isSecureContext ? 'Yes (HTTPS / localhost)' : 'No — GPS blocked' }}
            </span>
          </div>
          <div class="di-row">
            <span class="di-key">Permission State</span>
            <span class="di-val">{{ permissionLabel }}</span>
          </div>
        </div>
      </section>

    </main>
  </div>
</template>

<style scoped>
/* ── Base ── */
.gps-page {
  min-height: 100%;
  background: #f3f4f6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #111827;
  padding-bottom: 40px;
}

/* ── Header ── */
.gps-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px 16px;
  background: #ffffff;
  border-bottom: 1px solid #f3f4f6;
  position: sticky;
  top: 0;
  z-index: 10;
}

.btn-header-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  color: #111827;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}
.btn-header-back:hover { background: #e5e7eb; }
.btn-header-back svg { width: 20px; height: 20px; }

.header-title-block { flex: 1; min-width: 0; }

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #000000;
  letter-spacing: -0.3px;
}

.header-sub {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

/* Permission badge */
.perm-badge-wrap {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}
.perm-granted { background: #dcfce7; color: #15803d; }
.perm-denied { background: #fee2e2; color: #dc2626; }
.perm-prompt { background: #fef9c3; color: #a16207; }
.perm-unknown { background: #f3f4f6; color: #6b7280; }
.perm-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

/* ── Body ── */
.gps-body {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 480px;
  margin: 0 auto;
}

/* ── Cards ── */
.card {
  background: #ffffff;
  border-radius: 16px;
  padding: 18px;
  border: 1px solid #f3f4f6;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.card-header-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.flex-grow { flex: 1; min-width: 0; }

.card-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  flex-shrink: 0;
  background: #f3f4f6;
  color: #111827;
}
.card-icon-box svg { width: 22px; height: 22px; }

.icon-satellite { background: #eff6ff; color: #2563eb; }
.icon-live { background: #dcfce7; color: #16a34a; }
.icon-online { background: #dcfce7; color: #16a34a; }
.icon-offline { background: #f3f4f6; color: #6b7280; }
.icon-mode { background: #fef9c3; color: #ca8a04; }

.card-label {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}
.card-sub {
  margin: 2px 0 0 0;
  font-size: 12px;
  color: #6b7280;
}

/* ── Issue Alert Card ── */
.issue-alert-card {
  background: #fff7f7;
  border: 1.5px solid #fecaca;
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.issue-alert-top { display: flex; gap: 14px; align-items: flex-start; }

.issue-icon-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #fee2e2;
  color: #dc2626;
  flex-shrink: 0;
}
.issue-icon-circle svg { width: 22px; height: 22px; }

.issue-title { margin: 0 0 6px; font-size: 14px; font-weight: 700; color: #dc2626; }

.issue-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #b91c1c;
  font-size: 12.5px;
  font-weight: 500;
}

.issue-steps-box {
  background: #fee2e2;
  border-radius: 10px;
  padding: 12px 14px;
}

.steps-label {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  color: #dc2626;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.steps-ol {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #7f1d1d;
  font-size: 12.5px;
  line-height: 1.4;
}

.btn-repair {
  width: 100%;
  height: 46px;
  border-radius: 12px;
  border: 1.5px solid #fca5a5;
  background: #ffffff;
  color: #dc2626;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s;
}
.btn-repair:hover { background: #fee2e2; }
.btn-repair:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-repair svg { width: 18px; height: 18px; }

/* ── GPS Permission Prompt ── */
.permission-prompt-box {
  background: #f9fafb;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.perm-prompt-text {
  margin: 0;
  font-size: 13.5px;
  color: #374151;
  line-height: 1.5;
}

.btn-request-permission {
  width: 100%;
  height: 50px;
  border-radius: 12px;
  border: none;
  background: #000000;
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity 0.15s;
}
.btn-request-permission:hover { opacity: 0.9; }
.btn-request-permission svg { width: 20px; height: 20px; }

/* ── GPS Check Button ── */
.btn-check-gps {
  width: 100%;
  height: 50px;
  border-radius: 12px;
  border: none;
  background: #111827;
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity 0.15s;
}
.btn-check-gps:hover { opacity: 0.9; }
.btn-check-gps:disabled { background: #9ca3af; cursor: not-allowed; }
.btn-check-gps svg { width: 18px; height: 18px; }

/* ── Signal Bars ── */
.signal-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  margin-left: auto;
  flex-shrink: 0;
}
.signal-bar {
  width: 6px;
  border-radius: 2px;
  background: #e5e7eb;
  transition: background 0.2s;
}
.signal-bar:nth-child(1) { height: 8px; }
.signal-bar:nth-child(2) { height: 12px; }
.signal-bar:nth-child(3) { height: 17px; }
.signal-bar:nth-child(4) { height: 22px; }
.signal-label {
  font-size: 11px;
  font-weight: 700;
  margin-left: 4px;
  white-space: nowrap;
}

/* ── Reading Block ── */
.reading-block {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reading-coords-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.coord-pill {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.coord-axis {
  font-size: 10px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.coord-val {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  font-variant-numeric: tabular-nums;
}

.reading-meta-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  background: #f3f4f6;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.meta-chip svg { width: 13px; height: 13px; }
.meta-chip.accuracy { background: #eff6ff; color: #2563eb; }

/* ── Status Feedback ── */
.status-feedback {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
}
.status-feedback svg { width: 16px; height: 16px; flex-shrink: 0; }
.status-feedback.syncing { background: #fef9c3; color: #92400e; }
.status-feedback.success { background: #dcfce7; color: #15803d; }
.status-feedback.error { background: #fee2e2; color: #dc2626; }

/* ── GPS Map Preview ── */
.gps-map-preview {
  width: 100%;
  height: 180px;
  border-radius: 14px;
  overflow: hidden;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
}

/* ── Live Watch ── */
.live-pulse-dot {
  position: relative;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pulse-core {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #16a34a;
  position: relative;
  z-index: 1;
}
.pulse-ring {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(22, 163, 74, 0.25);
  animation: pulse-anim 1.6s infinite;
}
@keyframes pulse-anim {
  0% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
}

.live-badge {
  padding: 4px 10px;
  border-radius: 20px;
  background: #16a34a;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  margin-left: auto;
  flex-shrink: 0;
  animation: live-pulse-badge 1.5s ease-in-out infinite;
}
@keyframes live-pulse-badge {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.watch-actions-row { margin-bottom: 0; }

.btn-watch-start {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  border: 1.5px solid #16a34a;
  background: #f0fdf4;
  color: #15803d;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s;
}
.btn-watch-start:hover { background: #dcfce7; }
.btn-watch-start:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-watch-start svg { width: 16px; height: 16px; }

.btn-watch-stop {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  border: 1.5px solid #fca5a5;
  background: #fff7f7;
  color: #dc2626;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s;
}
.btn-watch-stop:hover { background: #fee2e2; }
.btn-watch-stop svg { width: 16px; height: 16px; }

/* Fix history */
.fix-history {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}
.history-label {
  margin: 0;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}
.fix-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 12px;
  border-bottom: 1px solid #f3f4f6;
  background: #ffffff;
}
.fix-row:last-child { border-bottom: none; }
.fix-row.latest { background: #f0fdf4; }
.fix-num { font-size: 10px; font-weight: 700; color: #6b7280; min-width: 42px; }
.fix-row.latest .fix-num { color: #16a34a; }
.fix-coords { flex: 1; font-variant-numeric: tabular-nums; font-weight: 600; color: #111827; font-size: 11px; }
.fix-acc { color: #6b7280; font-weight: 600; font-size: 11px; }
.fix-time { color: #9ca3af; font-size: 11px; }

/* ── Online toggle ── */
.online-pill {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  margin-left: auto;
  flex-shrink: 0;
}
.is-online { background: #dcfce7; color: #15803d; }
.is-offline { background: #f3f4f6; color: #6b7280; }

.btn-toggle-online {
  width: 100%;
  height: 50px;
  border-radius: 12px;
  border: none;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity 0.15s;
}
.btn-go-online { background: #000000; color: #ffffff; }
.btn-go-offline { background: #f3f4f6; color: #374151; }
.btn-toggle-online:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-toggle-online svg { width: 18px; height: 18px; }

/* ── Location Mode ── */
.mode-selector { display: flex; flex-direction: column; gap: 10px; }

.mode-option {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 14px;
  border: 2px solid transparent;
  background: #f9fafb;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
  width: 100%;
}
.mode-option:hover { background: #f3f4f6; }
.mode-option.selected { border-color: #000000; background: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }

.mode-option-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  flex-shrink: 0;
}
.mode-option-icon svg { width: 20px; height: 20px; }
.mode-icon-test { background: #fef9c3; color: #a16207; }
.mode-icon-live { background: #dcfce7; color: #16a34a; }

.mode-option-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mode-option-text strong { font-size: 14.5px; color: #111827; }
.mode-option-text span { font-size: 11.5px; color: #6b7280; }

.mode-live-text { color: #16a34a; font-weight: 600; font-size: 12px; }
.mode-test-text { color: #a16207; font-weight: 600; font-size: 12px; }

.mode-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #000000;
  flex-shrink: 0;
}
.mode-check svg { width: 14px; height: 14px; }

/* ── Device Info Card ── */
.device-info-card { padding: 16px 18px; }
.device-info-grid { display: flex; flex-direction: column; gap: 0; margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
.di-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; border-bottom: 1px solid #f3f4f6; }
.di-row:last-child { border-bottom: none; }
.di-key { font-size: 12.5px; color: #6b7280; font-weight: 500; }
.di-val { font-size: 12.5px; color: #111827; font-weight: 600; }
.val-green { color: #16a34a; }
.val-red { color: #dc2626; }

/* ── Inline error ── */
.inline-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fee2e2;
  color: #dc2626;
  font-size: 12.5px;
  font-weight: 600;
  margin-top: 10px;
}
.inline-error svg { width: 16px; height: 16px; flex-shrink: 0; }

.mt-8 { margin-top: 8px; }

/* ── Spinner ── */
.spin {
  animation: spin 0.85s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
