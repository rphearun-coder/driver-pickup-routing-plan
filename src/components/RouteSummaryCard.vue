<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

// "Today's route" card shared by Pickups and Deliveries: total straight-line distance
// and time from the Order Service's route estimates, the stop/parcel count, and how old
// the driver's last GPS update is (green = live, orange = older than 5 minutes).
const props = defineProps<{
  distanceText: string;
  durationText: string;
  count: number;
  /** Last GPS update from the Location Service (ms since epoch), if any. */
  lastUpdatedAt?: number;
}>();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 30_000)));
onBeforeUnmount(() => clearInterval(timer));

const ageSeconds = computed(() =>
  props.lastUpdatedAt ? Math.max(0, Math.round((now.value - props.lastUpdatedAt) / 1000)) : Infinity,
);
const fresh = computed(() => ageSeconds.value <= 5 * 60);
const ageText = computed(() => {
  if (!props.lastUpdatedAt) return 'No GPS';
  const s = ageSeconds.value;
  if (s < 5) return 'Live';
  if (s < 60) return `${s}s ago`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
});
const title = computed(() =>
  !props.lastUpdatedAt
    ? 'Waiting for your location'
    : fresh.value
      ? 'Last GPS update'
      : 'GPS is old — check location is on (Profile → Device & GPS)',
);
</script>

<template>
  <section class="route-card">
    <span class="route-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" />
        <path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5" />
      </svg>
    </span>
    <div class="route-info">
      <p class="route-title">Today's route</p>
      <p class="route-values">
        <strong>{{ distanceText }}</strong>
        <span class="dot-sep"></span>
        <strong>{{ durationText }}</strong>
        <span class="dot-sep"></span>
        <span>{{ count }} parcel{{ count === 1 ? '' : 's' }}</span>
      </p>
    </div>
    <span class="gps-status" :class="{ live: lastUpdatedAt && fresh, stale: lastUpdatedAt && !fresh }" :title="title">
      <span class="gps-dot"></span>
      {{ ageText }}
    </span>
  </section>
</template>

<style scoped>
.route-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(17, 24, 39, 0.05);
}
.route-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--blue-soft);
  color: var(--blue);
}
.route-icon svg {
  width: 20px;
  height: 20px;
}
.route-info {
  flex: 1;
  min-width: 0;
}
.route-title {
  margin: 0;
  color: var(--muted);
  font: 600 0.7rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.route-values {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 2px 0 0;
  color: var(--ink);
  font: 500 0.82rem var(--sans);
}
.route-values strong {
  font-weight: 800;
}
.dot-sep {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #c3c8cf;
}
.gps-status {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 44%;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--fill);
  color: var(--muted);
  font: 600 0.68rem var(--sans);
  text-align: right;
}
.gps-status.live {
  background: var(--green-soft);
  color: var(--green-strong);
}
.gps-status.stale {
  background: var(--orange-soft);
  color: var(--orange-strong);
}
.gps-status.stale .gps-dot {
  background: #f59e0b;
}
.gps-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--faint);
}
.gps-status.live .gps-dot {
  background: var(--green);
  box-shadow: 0 0 0 0 rgba(42, 154, 46, 0.6);
  animation: pulse 1.8s infinite;
}
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(42, 154, 46, 0.55);
  }
  70% {
    box-shadow: 0 0 0 7px rgba(42, 154, 46, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(42, 154, 46, 0);
  }
}
</style>
