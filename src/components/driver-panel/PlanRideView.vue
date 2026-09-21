<template>
  <div class="plan-ride-container">
    <!-- Header -->
    <header class="plan-header">
      <button type="button" class="plan-back-btn" aria-label="Back to home" @click="$emit('back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <h1 class="plan-title">Plan your ride</h1>
    </header>

    <!-- Filter & Profile Quick Pills -->
    <div class="quick-pills-row">
      <button type="button" class="quick-pill" @click="showFilterModal = true">
        <svg class="pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>{{ filterTimeLabel }}</span>
        <svg class="pill-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <button
        type="button"
        class="quick-pill"
        :class="{ 'pill-online': isOnline, 'pill-offline': !isOnline }"
        :disabled="isSyncing"
        @click="$emit('toggle-online')"
        :title="isOnline ? 'Tap to go offline' : 'Tap to go online'"
      >
        <span class="online-indicator" :class="isOnline ? 'online' : 'offline'"></span>
        <span>{{ isSyncing ? 'Syncing…' : (isOnline ? 'Online' : 'Offline') }}</span>
        <svg class="pill-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <button
        type="button"
        class="quick-pill mode-pill"
        @click="$emit('toggle-mode')"
        :title="'Switch to ' + (locationMode === 'live' ? 'Test' : 'Live') + ' mode'"
      >
        <span class="mode-indicator" :class="locationMode"></span>
        <span>{{ locationMode === 'live' ? 'Live GPS' : 'Test GPS' }}</span>
      </button>
    </div>

    <!-- Route Planner Input Card -->
    <div class="route-input-card">
      <div class="route-input-left">
        <div class="pin-dot-circle"></div>
        <div class="connector-line"></div>
        <div class="pin-square-box"></div>
      </div>

      <div class="route-input-fields">
        <!-- Origin -->
        <div class="input-row origin-row">
          <span class="input-text truncate" :title="originAddress">
            {{ originAddress || 'Locating your position…' }}
          </span>
        </div>

        <div class="divider-line"></div>

        <!-- Destination -->
        <div class="input-row destination-row">
          <input
            v-model="searchQuery"
            type="text"
            class="destination-input"
            placeholder="Where to?"
            @focus="isSearching = true"
          />
        </div>
      </div>

      <button
        type="button"
        class="btn-add-stop"
        title="Add stop or set on map"
        @click="$emit('set-location-on-map')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>

    <!-- Quick Action Items List -->
    <div class="quick-actions-list">
      <button type="button" class="quick-action-item" @click="handleActionClick('city')">
        <div class="action-icon-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
        <span class="action-label">Search in a different city</span>
      </button>

      <button type="button" class="quick-action-item" @click="$emit('set-location-on-map')">
        <div class="action-icon-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <span class="action-label">Set location on map</span>
      </button>

      <button type="button" class="quick-action-item" @click="handleActionClick('saved')">
        <div class="action-icon-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
        <span class="action-label">Saved places</span>
      </button>
    </div>

    <!-- Available Pickups Section -->
    <div class="pickups-section">
      <div class="pickups-section-header">
        <span class="section-title">Available Pickups</span>
        <span v-if="pickups.length" class="pickups-count-badge">{{ filteredPickups.length }}</span>
      </div>

      <div v-if="!isOnline" class="pickup-offline-prompt">
        <p>You are currently offline.</p>
        <button type="button" class="btn-go-online" @click="$emit('toggle-online')">
          Go online to receive pickups
        </button>
      </div>

      <div v-else-if="!filteredPickups.length" class="no-pickups-prompt">
        <p v-if="searchQuery">No pickups matching "{{ searchQuery }}"</p>
        <p v-else>No pending pickups available for this slot.</p>
      </div>

      <div v-else class="pickup-cards-list">
        <div
          v-for="(pickup, idx) in filteredPickups"
          :key="pickup.id || idx"
          class="pickup-order-card"
          @click="$emit('select-pickup', pickup, idx)"
        >
          <div class="pickup-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div class="pickup-card-details">
            <div class="pickup-partner-name">{{ pickup.partnerName || pickup.label || `Pickup #${idx + 1}` }}</div>
            <div class="pickup-card-address">{{ pickup.address || 'Click to view on map' }}</div>
            <div class="pickup-meta-tags">
              <span v-if="pickup.parcelCount" class="meta-tag parcels">
                📦 {{ pickup.parcelCount }} parcel{{ pickup.parcelCount === 1 ? '' : 's' }}
              </span>
              <span v-if="pickup.estimatedDistanceMetersText" class="meta-tag distance">
                📍 {{ pickup.estimatedDistanceMetersText }}
              </span>
              <span v-if="pickup.estimatedDurationSecondsText" class="meta-tag duration">
                ⏱ {{ pickup.estimatedDurationSecondsText }}
              </span>
            </div>
          </div>
          <div class="pickup-card-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Date/Time Filter Modal -->
    <PickupFilterModal
      :open="showFilterModal"
      :date="selectedDate"
      :pickup-time="selectedPickupTime"
      @apply="handleFilterApply"
      @close="showFilterModal = false"
      @update:open="showFilterModal = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { todayIso } from '@/utils/date';
import PickupFilterModal from './PickupFilterModal.vue';
import type { PickupPoint, PickupTimeSlot } from '@/types';

const props = withDefaults(
  defineProps<{
    originAddress?: string;
    pickups?: PickupPoint[];
    isOnline?: boolean;
    isSyncing?: boolean;
    locationMode?: 'test' | 'live';
    selectedDate?: string;
    selectedPickupTime?: PickupTimeSlot | '';
    driverDisplayName?: string;
    isAuthenticated?: boolean;
  }>(),
  {
    originAddress: 'Current location',
    pickups: () => [],
    isOnline: false,
    isSyncing: false,
    locationMode: 'test',
    selectedDate: '',
    selectedPickupTime: '',
    driverDisplayName: 'Driver',
    isAuthenticated: false,
  }
);

const emit = defineEmits<{
  back: [];
  'select-pickup': [pickup: PickupPoint, index: number];
  'toggle-online': [];
  'toggle-mode': [];
  'change-filter': [payload: { date: string; pickupTime: PickupTimeSlot | '' }];
  'set-location-on-map': [];
}>();

const searchQuery = ref('');
const isSearching = ref(false);
const showFilterModal = ref(false);

const filterTimeLabel = computed(() => {
  const isToday = !props.selectedDate || props.selectedDate === todayIso();
  let dateText = 'Pickup now';

  if (!isToday) {
    const [year, month, day] = props.selectedDate.split('-').map(Number);
    if (year && month && day) {
      dateText = new Date(year, month - 1, day).toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }
  }

  let slotText = '';
  switch (props.selectedPickupTime) {
    case 'MORNING':
      slotText = 'Morning';
      break;
    case 'AFTERNOON':
      slotText = 'Afternoon';
      break;
    case 'EVENING':
      slotText = 'Evening';
      break;
  }

  if (isToday && !slotText) return 'Pickup now';
  if (isToday && slotText) return `Today · ${slotText}`;
  if (!isToday && slotText) return `${dateText} · ${slotText}`;
  return dateText;
});

const filteredPickups = computed(() => {
  if (!searchQuery.value.trim()) return props.pickups;
  const q = searchQuery.value.toLowerCase().trim();
  return props.pickups.filter((p) => {
    const name = (p.partnerName || p.label || '').toLowerCase();
    const addr = (p.address || '').toLowerCase();
    return name.includes(q) || addr.includes(q);
  });
});

function handleFilterApply(payload: { date: string; pickupTime: PickupTimeSlot | '' }): void {
  showFilterModal.value = false;
  emit('change-filter', payload);
}

function handleActionClick(_type: 'city' | 'saved'): void {
  if (props.pickups.length > 0) {
    emit('select-pickup', props.pickups[0], 0);
  } else {
    emit('set-location-on-map');
  }
}
</script>

<style scoped>
.plan-ride-container {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 16px 20px 32px 20px;
  background: #ffffff;
  color: #000000;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  box-sizing: border-box;
  user-select: none;
}

/* Header */
.plan-header {
  display: flex;
  align-items: center;
  position: relative;
  height: 44px;
  margin-bottom: 16px;
}

.plan-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  border-radius: 50%;
  color: #000000;
  cursor: pointer;
  margin-left: -8px;
  transition: background-color 0.15s;
}

.plan-back-btn:hover {
  background: #f3f4f6;
}

.plan-back-btn svg {
  width: 22px;
  height: 22px;
}

.plan-title {
  flex: 1;
  text-align: center;
  font-size: 19px;
  font-weight: 700;
  margin: 0;
  margin-right: 32px;
  color: #000000;
  letter-spacing: -0.3px;
}

/* Quick Pills */
.quick-pills-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  overflow-x: auto;
  scrollbar-width: none;
}

.quick-pills-row::-webkit-scrollbar {
  display: none;
}

.quick-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 24px;
  background: #f3f4f6;
  border: 1px solid transparent;
  color: #000000;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.quick-pill:hover {
  background: #e5e7eb;
}

.pill-icon {
  width: 15px;
  height: 15px;
  color: #4b5563;
}

.pill-chevron {
  width: 14px;
  height: 14px;
  color: #6b7280;
}

.online-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.online-indicator.online {
  background: #16a34a;
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.2);
}

.online-indicator.offline {
  background: #9ca3af;
}

.mode-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.mode-indicator.live {
  background: #2563eb;
}

.mode-indicator.test {
  background: #d97706;
}

/* Route Input Card */
.route-input-card {
  display: flex;
  align-items: center;
  background: #ffffff;
  border: 1.5px solid #111827;
  border-radius: 16px;
  padding: 12px 14px;
  margin-bottom: 24px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
}

.route-input-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 14px;
  padding: 4px 0;
}

.pin-dot-circle {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #000000;
}

.connector-line {
  width: 1.5px;
  height: 24px;
  background: #d1d5db;
  margin: 3px 0;
}

.pin-square-box {
  width: 9px;
  height: 9px;
  background: #000000;
}

.route-input-fields {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.input-row {
  height: 24px;
  display: flex;
  align-items: center;
}

.input-text {
  font-size: 14.5px;
  font-weight: 500;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.destination-input {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 14.5px;
  font-weight: 500;
  color: #111827;
  padding: 0;
  outline: none;
  font-family: inherit;
}

.destination-input::placeholder {
  color: #9ca3af;
}

.divider-line {
  height: 1px;
  background: #f3f4f6;
  margin: 8px 0;
}

.btn-add-stop {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1.5px solid #d1d5db;
  background: #ffffff;
  color: #374151;
  cursor: pointer;
  margin-left: 10px;
  flex-shrink: 0;
  transition: all 0.15s;
}

.btn-add-stop:hover {
  background: #f3f4f6;
  border-color: #111827;
}

.btn-add-stop svg {
  width: 18px;
  height: 18px;
}

/* Quick Action Items List */
.quick-actions-list {
  display: flex;
  flex-direction: column;
  margin-bottom: 24px;
}

.quick-action-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 4px;
  background: transparent;
  border: none;
  border-bottom: 1px solid #f3f4f6;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}

.quick-action-item:last-child {
  border-bottom: none;
}

.quick-action-item:hover {
  background: #f9fafb;
}

.action-icon-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f3f4f6;
  color: #111827;
  flex-shrink: 0;
}

.action-icon-circle svg {
  width: 20px;
  height: 20px;
}

.action-label {
  font-size: 15px;
  font-weight: 500;
  color: #111827;
}

/* Pickups Section */
.pickups-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.pickups-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.pickups-count-badge {
  background: #111827;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 12px;
}

.pickup-offline-prompt,
.no-pickups-prompt {
  background: #f9fafb;
  border: 1px dashed #e5e7eb;
  border-radius: 12px;
  padding: 24px 16px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
}

.btn-go-online {
  margin-top: 12px;
  background: #16a34a;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.pickup-cards-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pickup-order-card {
  display: flex;
  align-items: center;
  padding: 14px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pickup-order-card:hover {
  background: #ffffff;
  border-color: #111827;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.pickup-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #fee2e2;
  color: #dc2626;
  margin-right: 12px;
  flex-shrink: 0;
}

.pickup-card-icon svg {
  width: 18px;
  height: 18px;
}

.pickup-card-details {
  flex: 1;
  min-width: 0;
}

.pickup-partner-name {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pickup-card-address {
  font-size: 12.5px;
  color: #6b7280;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pickup-meta-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.meta-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  color: #374151;
}

.pickup-card-arrow {
  color: #9ca3af;
  margin-left: 8px;
  flex-shrink: 0;
}

.pickup-card-arrow svg {
  width: 18px;
  height: 18px;
}

.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
