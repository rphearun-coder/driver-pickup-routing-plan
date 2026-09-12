<template>
  <div class="driver-panel">
    <button type="button" class="panel-header" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
      <span class="status-dot" :class="isOnline ? 'online' : 'offline'"></span>
      <span class="status-text">{{ headerText }}</span>
      <span class="conn-dot" :class="isMqttConnected ? 'connected' : 'disconnected'" title="Connection"></span>
      <component :is="collapsed ? IconChevronDown : IconChevronUp" class="chevron" />
    </button>

    <div v-show="!collapsed" class="panel-body">
      <template v-if="!isAuthenticated">
        <DriverLoginForm :login-error="loginError" :logging-in="loggingIn" @login="$emit('login', $event)" />
      </template>

      <template v-else-if="!isOnline">
        <p class="tagline">Go online to see pickups near you.</p>
        <button
          type="button"
          class="btn btn-online"
          :disabled="!defaultDriverId.trim() || isSyncing"
          @click="$emit('toggle-online')"
        >
          {{ isSyncing ? 'Going online…' : 'Go online' }}
        </button>
        <p v-if="!defaultDriverId.trim()" class="tagline muted">Driver not configured.</p>
        <p v-if="presenceError" class="tagline error">{{ presenceError }}</p>
      </template>

      <template v-else-if="isPlayingRoute">
        <p class="tagline">
          <template v-if="isSimulating">Driving to <strong>{{ activePickupName }}</strong>{{ isPaused ? ' — paused' : '…' }}</template>
          <template v-else-if="hasLivePosition">Driving to <strong>{{ activePickupName }}</strong>…</template>
          <template v-else>Route set to <strong>{{ activePickupName }}</strong> — waiting for the driver's live position…</template>
        </p>
        <p v-if="locationError" class="tagline error">{{ locationError }}</p>
        <div class="action-row">
          <button v-if="isSimulating" type="button" class="btn-icon" :title="isPaused ? 'Resume' : 'Pause'" @click="togglePause">
            <component :is="isPaused ? IconPlay : IconPause" class="icon" />
          </button>
          <button type="button" class="btn btn-stop" @click="$emit('stop-route')">Stop driving</button>
        </div>
      </template>

      <template v-else>
        <PickupFilterModal
          :date="selectedDate"
          :pickup-time="selectedPickupTime"
          @apply="$emit('change-filter', $event)"
        />
        <PickupList :pickups="pickups" :selected-index="selectedPickupIndex" @select="selectPickup" />

        <div class="action-row">
          <button type="button" class="btn-icon" title="Refresh & re-center" @click="$emit('refresh')">
            <IconRefresh class="icon" />
          </button>
          <button type="button" class="btn btn-drive" :disabled="selectedPickupIndex === ''" @click="onDriveClick">
            Drive to pickup
          </button>
        </div>
        <p v-if="presenceError" class="tagline error">{{ presenceError }}</p>
        <p v-if="locationError" class="tagline error">{{ locationError }}</p>
        <div class="offline-row">
          <button type="button" class="link-offline" :disabled="isSyncing" @click="$emit('toggle-online')">Go offline</button>
          <button
            type="button"
            class="link-offline"
            @click="$emit('invite', selectedPickupIndex === '' ? undefined : props.pickups[selectedPickupIndex])"
          >
            Copy link
          </button>
          <button type="button" class="link-offline" @click="$emit('logout')">Log out</button>
          <slot name="dev-tools" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import DriverLoginForm from './DriverLoginForm.vue';
import PickupFilterModal from './PickupFilterModal.vue';
import PickupList from './PickupList.vue';
import IconChevronUp from '../icons/IconChevronUp.vue';
import IconChevronDown from '../icons/IconChevronDown.vue';
import IconRefresh from '../icons/IconRefresh.vue';
import IconPause from '../icons/IconPause.vue';
import IconPlay from '../icons/IconPlay.vue';
import type { ConnectionStatus, PickupPoint, PickupTimeSlot } from '@/types';

const props = withDefaults(
  defineProps<{
    defaultDriverId?: string;
    isAuthenticated?: boolean;
    loginError?: string;
    loggingIn?: boolean;
    isOnline?: boolean;
    isSyncing?: boolean;
    presenceError?: string;
    connectionStatus?: ConnectionStatus;
    pickups?: PickupPoint[];
    selectedDate?: string;
    selectedPickupTime?: PickupTimeSlot | '';
    isPlayingRoute?: boolean;
    isPaused?: boolean;
    isSimulating?: boolean;
    hasLivePosition?: boolean;
    activePickupId?: string;
    locationError?: string;
  }>(),
  {
    defaultDriverId: '',
    isAuthenticated: false,
    loginError: '',
    loggingIn: false,
    isOnline: false,
    isSyncing: false,
    presenceError: '',
    connectionStatus: 'connecting',
    pickups: () => [],
    selectedDate: '',
    selectedPickupTime: '',
    isPlayingRoute: false,
    isPaused: false,
    isSimulating: true,
    hasLivePosition: false,
    activePickupId: '',
    locationError: '',
  }
);

const emit = defineEmits<{
  login: [payload: { phoneNumber: string; password: string }];
  logout: [];
  'toggle-online': [];
  invite: [pickup?: PickupPoint];
  refresh: [];
  'change-filter': [payload: { date: string; pickupTime: PickupTimeSlot | '' }];
  'view-pickup': [payload: { lat: number; lon: number }];
  'preview-route': [payload: { lat: number; lon: number }];
  'play-route': [payload: { id?: string; onRoute?: boolean; lat: number; lon: number }];
  'pause-route': [];
  'resume-route': [];
  'stop-route': [];
}>();

const collapsed = ref(false);
const selectedPickupIndex = ref<number | ''>('');

const isMqttConnected = computed(() => props.connectionStatus === 'connected');

const headerText = computed(() => {
  if (props.isPlayingRoute) return 'Driving';
  return props.isOnline ? 'Online' : 'Offline';
});

const activePickupName = computed(() => {
  const pickup = selectedPickupIndex.value === '' ? null : props.pickups[selectedPickupIndex.value];
  return pickup?.partnerName ?? pickup?.label ?? 'pickup';
});

watch(
  () => props.pickups,
  (list) => {
    if (selectedPickupIndex.value !== '' && !list[selectedPickupIndex.value]) {
      selectedPickupIndex.value = '';
    }
  }
);

// After a page refresh, selectedPickupIndex resets to '' along with the rest of this
// component's state, even though the parent may be resuming a route that was already
// in progress. This re-attaches the label once the matching pickup shows up in the list.
watch(
  () => [props.pickups, props.activePickupId] as const,
  ([list, id]) => {
    if (!id || selectedPickupIndex.value !== '') return;
    const index = list.findIndex((pickup) => pickup.id === id);
    if (index !== -1) selectedPickupIndex.value = index;
  },
  { immediate: true }
);

function selectPickup(index: number): void {
  selectedPickupIndex.value = index;
  const pickup = props.pickups[index];
  const origin = pickup?.path[0];
  if (!origin) return;
  const point = { lat: Number(origin.lat), lon: Number(origin.lng) };
  emit('preview-route', point);
  emit('view-pickup', point);
}

function togglePause(): void {
  if (props.isPaused) {
    emit('resume-route');
  } else {
    emit('pause-route');
  }
}

function onDriveClick(): void {
  if (selectedPickupIndex.value === '') return;
  const pickup = props.pickups[selectedPickupIndex.value];
  const origin = pickup?.path[0];
  if (!origin) return;
  emit('play-route', {
    id: pickup.id,
    onRoute: pickup.onRoute,
    lat: Number(origin.lat),
    lon: Number(origin.lng),
  });
}
</script>
