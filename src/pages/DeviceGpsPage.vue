<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { useDeviceGps } from '@/composables/useDeviceGps';
import { useDriverLocationPublishing, currentShiftType } from '@/composables/useDriverLocationPublishing';
import { useDriverLocations } from '@/composables/useDriverLocations';
import { useDriverPresence } from '@/composables/useDriverPresence';
import { useGoogleMap } from '@/composables/useGoogleMap';
import { useLocationMode, type LocationMode } from '@/composables/useLocationMode';

const router = useRouter();
const { platform, browserName, permissionState, checking, reading, checkError, checkNow } = useDeviceGps();
const { locationError } = useDriverLocationPublishing();
const { locationMode, setLocationMode } = useLocationMode();
const { driverUser } = useAuth();
const { isOnline, presenceError, toggleOnline } = useDriverPresence();
const { publishOwnLocation } = useDriverLocations();

const syncStatus = ref<'idle' | 'syncing' | 'done'>('idle');

// A successful on-demand check is also a good signal to bring the driver online (if they
// weren't already) and push this exact reading through the same publish path the
// background tracker uses — otherwise "Check GPS now" only ever updated this page's own
// preview map and never touched the driver's actual online/last-location record.
watch(reading, async (value) => {
  if (!value) return;
  const driverId = driverUser.value?.id;
  if (!driverId) return;

  syncStatus.value = 'syncing';
  if (!isOnline.value) await toggleOnline();
  publishOwnLocation(driverId, value.lat, value.lon, { driverShift: 1, shiftType: currentShiftType() });
  syncStatus.value = 'done';
});

const mapEl = ref<HTMLDivElement | null>(null);
const { google, map, init: initMap } = useGoogleMap(mapEl, { center: { lat: 0, lng: 0 }, zoom: 16 });
let marker: any = null;
let accuracyCircle: any = null;
let mapReady = false;

// The map div only exists once a reading comes in (v-if="reading" below) — flush: 'post'
// makes this run after Vue mounts that div, so mapEl.value is populated by the time
// initMap() reads it, instead of racing the render.
watch(reading, async (value) => {
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
      fillColor: '#0e9f6e',
      fillOpacity: 0.12,
      strokeColor: '#0e9f6e',
      strokeOpacity: 0.4,
      strokeWeight: 1,
    });
    return;
  }

  map.value.panTo(position);
  marker?.setPosition(position);
  accuracyCircle?.setCenter(position);
  accuracyCircle?.setRadius(value.accuracyMeters);
}, { flush: 'post' });

const permissionLabel = computed(() => {
  switch (permissionState.value) {
    case 'granted':
      return 'Allowed';
    case 'denied':
      return 'Blocked';
    case 'prompt':
      return 'Not asked yet';
    default:
      return 'Unknown';
  }
});

const helpSteps = computed<string[]>(() => {
  if (platform === 'iOS') {
    return [
      `Open iPhone Settings → Privacy & Security → Location Services, and make sure Location Services is on.`,
      `Scroll down to ${browserName}, tap it, and set access to "While Using the App".`,
      `Return here and tap "Check GPS now" again.`,
    ];
  }
  if (platform === 'Android') {
    return [
      `Open Android Settings → Apps → ${browserName} → Permissions → Location, and set it to Allow.`,
      `If location is off system-wide, also enable it from the quick settings shade or Settings → Location.`,
      `Return here and tap "Check GPS now" again.`,
    ];
  }
  return [
    `Click the lock/info icon in the address bar and set Location to "Allow" for this site.`,
    `Return here and tap "Check GPS now" again.`,
  ];
});

function formatCoord(value: number): string {
  return value.toFixed(6);
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function onModeChange(mode: LocationMode): void {
  setLocationMode(mode);
}
</script>

<template>
  <div class="device-gps-page">
    <header class="page-header">
      <button type="button" class="back" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h1>Device &amp; GPS</h1>
    </header>

    <main class="page-body">
      <section class="card">
        <h2>This device</h2>
        <div class="device-row">
          <span class="device-name">{{ platform }} · {{ browserName }}</span>
          <span class="permission-badge" :class="permissionState">{{ permissionLabel }}</span>
        </div>

        <button type="button" class="check-btn" :disabled="checking" @click="checkNow">
          {{ checking ? 'Checking…' : 'Check GPS now' }}
        </button>

        <p v-if="reading" class="reading">
          {{ formatCoord(reading.lat) }}, {{ formatCoord(reading.lon) }}
          <span class="reading-meta">±{{ Math.round(reading.accuracyMeters) }}m · {{ formatTime(reading.at) }}</span>
        </p>
        <div v-if="reading" ref="mapEl" class="reading-map"></div>
        <p v-if="syncStatus === 'syncing'" class="hint sync">Updating online status and location…</p>
        <p v-else-if="syncStatus === 'done' && !presenceError" class="hint success">
          ✓ {{ isOnline ? 'Online' : 'Offline' }} · location updated
        </p>
        <p v-if="presenceError" class="hint error">{{ presenceError }}</p>
        <p v-if="checkError" class="hint error">{{ checkError }}</p>
        <p v-if="locationError" class="hint error">Live tracking: {{ locationError }}</p>
      </section>

      <section class="card">
        <h2>Location mode</h2>
        <p class="mode-hint">Live mode shares your real GPS position while you're online. Test mode never sends your real location.</p>
        <div class="mode-toggle">
          <button type="button" :class="{ active: locationMode === 'test' }" @click="onModeChange('test')">Test</button>
          <button type="button" :class="{ active: locationMode === 'live' }" @click="onModeChange('live')">Live</button>
        </div>
      </section>

      <section v-if="permissionState !== 'granted'" class="card">
        <h2>How to enable location on {{ platform }}</h2>
        <ol class="help-steps">
          <li v-for="(step, index) in helpSteps" :key="index">{{ step }}</li>
        </ol>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid var(--line);
}
.back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--wash);
  color: var(--ink);
  cursor: pointer;
}
.back svg {
  width: 18px;
  height: 18px;
}
.page-header h1 {
  margin: 0;
  font: 700 1.15rem var(--heading);
  color: var(--ink);
}
.page-body {
  padding: 20px 16px 40px;
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.card {
  padding: 16px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid var(--line);
}
.card h2 {
  margin: 0 0 10px;
  color: var(--muted);
  font: 700 0.78rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.device-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.device-name {
  font: 600 0.92rem var(--sans);
  color: var(--ink);
}
.permission-badge {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  font: 700 0.68rem var(--sans);
  letter-spacing: 0.02em;
  color: #fff;
}
.permission-badge.granted {
  background: var(--green);
}
.permission-badge.denied {
  background: #e0433b;
}
.permission-badge.prompt {
  background: var(--orange);
}
.permission-badge.unsupported {
  background: var(--muted);
}
.check-btn {
  width: 100%;
  padding: 13px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 0.9rem var(--sans);
  cursor: pointer;
}
.check-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.reading {
  margin: 12px 0 0;
  font: 600 0.85rem var(--sans);
  color: var(--ink);
}
.reading-meta {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-weight: 500;
  font-size: 0.78rem;
}
.reading-map {
  width: 100%;
  height: 200px;
  margin-top: 12px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--wash);
}
.hint {
  margin: 12px 0 0;
  font-size: 0.82rem;
}
.hint.error {
  color: #e0433b;
}
.hint.success {
  color: var(--green);
  font-weight: 600;
}
.hint.sync {
  color: var(--muted);
}
.mode-hint {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.4;
}
.mode-toggle {
  display: flex;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}
.mode-toggle button {
  flex: 1;
  padding: 11px;
  border: none;
  background: #fff;
  color: var(--muted);
  font: 700 0.85rem var(--sans);
  cursor: pointer;
}
.mode-toggle button.active {
  background: var(--green);
  color: #fff;
}
.help-steps {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--ink);
  font-size: 0.85rem;
  line-height: 1.4;
}
</style>
