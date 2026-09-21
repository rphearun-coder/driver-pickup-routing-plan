<template>
  <div class="choose-ride-sheet">
    <!-- Drag Handle -->
    <div class="sheet-handle-bar">
      <span class="sheet-handle"></span>
    </div>

    <!-- Active Driving Controls View -->
    <template v-if="isPlayingRoute">
      <div class="driving-active-container">
        <div class="driving-active-header">
          <div class="driving-pulse-badge">
            <span class="pulse-ring"></span>
            <span class="pulse-core"></span>
          </div>
          <div class="driving-header-content">
            <span class="driving-lead">
              <template v-if="isSimulating">
                Driving to <strong>{{ destinationName }}</strong>{{ isPaused ? ' (Paused)' : '' }}
              </template>
              <template v-else-if="hasLivePosition">
                Live navigation to <strong>{{ destinationName }}</strong>
              </template>
              <template v-else>
                Navigating to <strong>{{ destinationName }}</strong> (Waiting for GPS)
              </template>
            </span>
            <span v-if="routeArrivalEta || routeDurationText" class="driving-eta-sub">
              Est. Arrival: <strong>{{ routeArrivalEta || 'Calculating…' }}</strong> · {{ routeDurationText || '' }} ({{ routeDistanceText || '' }})
            </span>
          </div>
        </div>

        <p v-if="locationError" class="driving-error-tag">{{ locationError }}</p>

        <!-- Driving Action Buttons -->
        <div class="driving-actions-grid">
          <button
            v-if="isSimulating"
            type="button"
            class="btn-driving-pause"
            :title="isPaused ? 'Resume' : 'Pause'"
            @click="isPaused ? $emit('resume-route') : $emit('pause-route')"
          >
            <svg v-if="isPaused" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
            <span>{{ isPaused ? 'Resume' : 'Pause' }}</span>
          </button>

          <button type="button" class="btn-driving-stop" @click="$emit('stop-route')">
            Stop driving
          </button>

          <button type="button" class="btn-driving-share" title="Share live tracking" @click="$emit('invite')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span>Share</span>
          </button>
        </div>
      </div>
    </template>

    <!-- Normal Ride Selection View -->
    <template v-else>
      <div class="sheet-title-row">
        <h2 class="sheet-heading">Choose a ride</h2>
      </div>

      <!-- Vehicle Options List -->
      <div class="ride-options-scroller">
        <div
          v-for="tier in rideTiers"
          :key="tier.id"
          class="ride-tier-card"
          :class="{ selected: selectedTierId === tier.id }"
          @click="selectedTierId = tier.id"
        >
          <!-- Vehicle Image Thumbnail -->
          <div class="tier-thumb-container">
            <!-- Sedan / Priority Car -->
            <svg v-if="tier.icon === 'priority'" viewBox="0 0 100 48" class="vehicle-svg">
              <g fill="none" stroke="none">
                <!-- Drop shadow -->
                <ellipse cx="50" cy="44" rx="42" ry="4" fill="rgba(0,0,0,0.12)" />
                <!-- Car Body -->
                <path d="M12 32 C12 28 16 26 24 25 L34 16 C37 13 42 12 50 12 L70 12 C77 12 82 15 85 20 L91 25 C95 27 96 30 96 34 L96 38 C96 39 95 40 94 40 L88 40 C88 35 83 31 77 31 C71 31 66 35 66 40 L38 40 C38 35 33 31 27 31 C21 31 16 35 16 40 L13 40 C12 40 12 39 12 38 Z" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1.2" />
                <!-- Roof & Windows -->
                <path d="M35 24 L68 24 C72 24 75 22 73 17 L70 14 C68 13 65 13 63 13 L43 13 C39 13 36 14 34 17 Z" fill="#1f2937" />
                <path d="M49 14 L49 23 L37 23 L42 15 C44 14 47 14 49 14 Z" fill="#38bdf8" opacity="0.8" />
                <path d="M52 14 L62 14 C65 14 67 15 69 17 L71 23 L52 23 Z" fill="#38bdf8" opacity="0.8" />
                <!-- Headlight & Taillight -->
                <polygon points="91,28 95,29 95,33 90,32" fill="#38bdf8" />
                <polygon points="12,29 15,29 15,33 12,32" fill="#ef4444" />
                <!-- Front & Rear Wheels -->
                <circle cx="27" cy="38" r="7" fill="#1f2937" />
                <circle cx="27" cy="38" r="4" fill="#9ca3af" />
                <circle cx="77" cy="38" r="7" fill="#1f2937" />
                <circle cx="77" cy="38" r="4" fill="#9ca3af" />
              </g>
            </svg>

            <!-- Standard Car -->
            <svg v-else-if="tier.icon === 'standard'" viewBox="0 0 100 48" class="vehicle-svg">
              <g fill="none" stroke="none">
                <ellipse cx="50" cy="44" rx="38" ry="4" fill="rgba(0,0,0,0.12)" />
                <path d="M14 32 C14 28 18 26 25 25 L36 17 C39 14 44 14 50 14 L68 14 C74 14 78 16 81 21 L87 25 C91 27 92 30 92 34 L92 38 C92 39 91 40 90 40 L84 40 C84 35 80 32 75 32 C70 32 66 35 66 40 L38 40 C38 35 34 32 29 32 C24 32 20 35 20 40 L15 40 C14 40 14 39 14 38 Z" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.2" />
                <path d="M38 23 L67 23 C70 23 72 21 71 18 L68 15 C66 15 64 15 62 15 L44 15 C41 15 39 16 38 18 Z" fill="#374151" />
                <path d="M48 16 L48 22 L39 22 L44 17 Z" fill="#93c5fd" opacity="0.8" />
                <path d="M51 16 L61 16 L67 22 L51 22 Z" fill="#93c5fd" opacity="0.8" />
                <circle cx="29" cy="38" r="6.5" fill="#1f2937" />
                <circle cx="29" cy="38" r="3.5" fill="#d1d5db" />
                <circle cx="75" cy="38" r="6.5" fill="#1f2937" />
                <circle cx="75" cy="38" r="3.5" fill="#d1d5db" />
              </g>
            </svg>

            <!-- Express Moto -->
            <svg v-else-if="tier.icon === 'moto'" viewBox="0 0 100 48" class="vehicle-svg">
              <g fill="none" stroke="none">
                <ellipse cx="50" cy="44" rx="34" ry="3.5" fill="rgba(0,0,0,0.12)" />
                <circle cx="25" cy="36" r="7.5" fill="#1f2937" />
                <circle cx="25" cy="36" r="4" fill="#9ca3af" />
                <circle cx="75" cy="36" r="7.5" fill="#1f2937" />
                <circle cx="75" cy="36" r="4" fill="#9ca3af" />
                <!-- Scooter body & box -->
                <path d="M25 36 L40 28 L48 36 L68 36 L75 36" stroke="#374151" stroke-width="3" stroke-linecap="round" />
                <rect x="20" y="16" width="18" height="15" rx="3" fill="#16a34a" />
                <path d="M42 28 L56 28 L62 20 L66 14" stroke="#111827" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="64" cy="13" r="2.5" fill="#111827" />
                <path d="M48 24 L56 24 L52 32 Z" fill="#111827" />
              </g>
            </svg>

            <!-- Van XL -->
            <svg v-else viewBox="0 0 100 48" class="vehicle-svg">
              <g fill="none" stroke="none">
                <ellipse cx="50" cy="44" rx="42" ry="4" fill="rgba(0,0,0,0.12)" />
                <path d="M14 16 C14 14 16 12 18 12 L68 12 C74 12 78 15 82 20 L88 26 C92 28 94 31 94 35 L94 38 C94 39 93 40 92 40 L84 40 C84 35 80 32 75 32 C70 32 66 35 66 40 L38 40 C38 35 34 32 29 32 C24 32 20 35 20 40 L15 40 C14 40 14 39 14 38 Z" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1.2" />
                <!-- Van windows -->
                <rect x="22" y="15" width="18" height="10" rx="2" fill="#38bdf8" opacity="0.8" />
                <rect x="44" y="15" width="18" height="10" rx="2" fill="#38bdf8" opacity="0.8" />
                <path d="M66 15 L74 15 C77 15 79 17 81 20 L84 25 L66 25 Z" fill="#38bdf8" opacity="0.8" />
                <circle cx="29" cy="38" r="7" fill="#1f2937" />
                <circle cx="29" cy="38" r="4" fill="#9ca3af" />
                <circle cx="75" cy="38" r="7" fill="#1f2937" />
                <circle cx="75" cy="38" r="4" fill="#9ca3af" />
              </g>
            </svg>
          </div>

          <!-- Info Details -->
          <div class="tier-info-col">
            <div class="tier-name-row">
              <span class="tier-name">{{ tier.name }}</span>
              <span class="tier-capacity">
                <svg viewBox="0 0 24 24" fill="currentColor" class="cap-user-icon">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                <span>{{ tier.capacityCount }}</span>
              </span>
            </div>

            <div class="tier-time-row">
              <span class="tier-eta-text">{{ calculateEta(tier) }}</span>
              <span v-if="tier.badge" class="tier-badge-pill" :class="tier.badgeType">
                <svg viewBox="0 0 24 24" fill="currentColor" class="badge-bolt">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span>{{ tier.badge }}</span>
              </span>
            </div>
          </div>

          <!-- Price -->
          <div class="tier-price-col">
            <span class="tier-price-val">{{ formatPrice(tier) }}</span>
          </div>
        </div>
      </div>

      <!-- Payment Method Row -->
      <div class="payment-method-strip" @click="cyclePaymentMethod">
        <div class="payment-left">
          <div class="cash-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <circle cx="12" cy="12" r="2" />
              <path d="M6 12h.01M18 12h.01" />
            </svg>
          </div>
          <span class="payment-name">{{ paymentMethod }}</span>
        </div>
        <svg class="chevron-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>

      <!-- Primary Action CTA -->
      <button
        type="button"
        class="btn-choose-ride"
        :disabled="!destinationName"
        @click="handleChooseClick"
      >
        Choose {{ selectedTier?.name || 'Ride' }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PickupPoint } from '@/types';

interface RideTier {
  id: string;
  name: string;
  capacityCount: number;
  badge?: string;
  badgeType?: 'faster' | 'eco';
  basePrice: number;
  perKmRate: number;
  durationOffsetMin: number;
  icon: 'priority' | 'standard' | 'moto' | 'van';
}

const props = withDefaults(
  defineProps<{
    destinationName?: string;
    routeDurationText?: string;
    routeDistanceText?: string;
    routeArrivalEta?: string;
    isPlayingRoute?: boolean;
    isPaused?: boolean;
    isSimulating?: boolean;
    hasLivePosition?: boolean;
    locationError?: string;
    isOnline?: boolean;
    activePickup?: PickupPoint | null;
  }>(),
  {
    destinationName: 'Destination',
    routeDurationText: '',
    routeDistanceText: '',
    routeArrivalEta: '',
    isPlayingRoute: false,
    isPaused: false,
    isSimulating: true,
    hasLivePosition: false,
    locationError: '',
    isOnline: false,
    activePickup: null,
  }
);

const emit = defineEmits<{
  'choose-ride': [tierId: string];
  'pause-route': [];
  'resume-route': [];
  'stop-route': [];
  invite: [];
}>();

const rideTiers = ref<RideTier[]>([
  {
    id: 'priority',
    name: 'Priority',
    capacityCount: 4,
    badge: 'Faster',
    badgeType: 'faster',
    basePrice: 55.08,
    perKmRate: 2.2,
    durationOffsetMin: 0,
    icon: 'priority',
  },
  {
    id: 'standard',
    name: 'Standard',
    capacityCount: 4,
    basePrice: 42.50,
    perKmRate: 1.8,
    durationOffsetMin: 5,
    icon: 'standard',
  },
  {
    id: 'moto',
    name: 'Express Moto',
    capacityCount: 1,
    badge: 'Eco',
    badgeType: 'eco',
    basePrice: 28.00,
    perKmRate: 1.2,
    durationOffsetMin: -4,
    icon: 'moto',
  },
  {
    id: 'van',
    name: 'Van XL',
    capacityCount: 6,
    basePrice: 72.00,
    perKmRate: 3.0,
    durationOffsetMin: 8,
    icon: 'van',
  },
]);

const selectedTierId = ref('priority');
const selectedTier = computed(() => rideTiers.value.find((t) => t.id === selectedTierId.value) || rideTiers.value[0]);

const paymentMethods = ['Cash', 'Jalat Pay', 'Credit / Debit'];
const currentPaymentIndex = ref(0);
const paymentMethod = computed(() => paymentMethods[currentPaymentIndex.value]);

function cyclePaymentMethod(): void {
  currentPaymentIndex.value = (currentPaymentIndex.value + 1) % paymentMethods.length;
}

function calculateEta(tier: RideTier): string {
  // If we have actual arrival ETA from DirectionsService:
  if (props.routeArrivalEta) {
    const dur = props.routeDurationText ? ` · ${props.routeDurationText}` : '';
    return `${props.routeArrivalEta}${dur}`;
  }
  // Fallback realistic ETA
  const now = new Date();
  const arrival = new Date(now.getTime() + (35 + tier.durationOffsetMin) * 60 * 1000);
  const timeStr = arrival.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const mins = Math.max(15, 35 + tier.durationOffsetMin);
  return `${timeStr} · ${mins} min`;
}

function formatPrice(tier: RideTier): string {
  // If distance text available (e.g. "12.4 km"):
  if (props.routeDistanceText) {
    const kmMatch = props.routeDistanceText.match(/([\d.]+)/);
    if (kmMatch) {
      const km = parseFloat(kmMatch[1]);
      const price = tier.basePrice * 0.4 + km * tier.perKmRate;
      return `$${price.toFixed(2)}`;
    }
  }
  return `$${tier.basePrice.toFixed(2)}`;
}

function handleChooseClick(): void {
  emit('choose-ride', selectedTierId.value);
}
</script>

<style scoped>
.choose-ride-sheet {
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.16);
  padding: 8px 18px 20px 18px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #000000;
  box-sizing: border-box;
  user-select: none;
  touch-action: pan-y;
}

/* Drag Handle */
.sheet-handle-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  width: 100%;
}

.sheet-handle {
  width: 38px;
  height: 4.5px;
  border-radius: 4px;
  background: #e5e7eb;
}

/* Title */
.sheet-title-row {
  margin: 6px 0 12px 0;
}

.sheet-heading {
  font-size: 19px;
  font-weight: 700;
  margin: 0;
  color: #000000;
  letter-spacing: -0.3px;
}

/* Scroller */
.ride-options-scroller {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 230px;
  overflow-y: auto;
  scrollbar-width: none;
  margin-bottom: 12px;
}

.ride-options-scroller::-webkit-scrollbar {
  display: none;
}

/* Ride Option Card */
.ride-tier-card {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 14px;
  border: 2px solid transparent;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ride-tier-card.selected {
  border-color: #000000;
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.ride-tier-card:not(.selected):hover {
  background: #f9fafb;
}

.tier-thumb-container {
  width: 64px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  flex-shrink: 0;
}

.vehicle-svg {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.tier-info-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tier-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tier-name {
  font-size: 15px;
  font-weight: 700;
  color: #000000;
}

.tier-capacity {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
}

.cap-user-icon {
  width: 13px;
  height: 13px;
}

.tier-time-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tier-eta-text {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
}

.tier-badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  color: #ffffff;
}

.tier-badge-pill.faster {
  background: #2563eb;
}

.tier-badge-pill.eco {
  background: #16a34a;
}

.badge-bolt {
  width: 10px;
  height: 10px;
}

.tier-price-col {
  text-align: right;
  flex-shrink: 0;
  margin-left: 10px;
}

.tier-price-val {
  font-size: 16px;
  font-weight: 700;
  color: #000000;
}

/* Payment Strip */
.payment-method-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 4px;
  margin-bottom: 12px;
  border-top: 1px solid #f3f4f6;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
}

.payment-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cash-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #dcfce7;
}

.cash-icon-box svg {
  width: 18px;
  height: 18px;
}

.payment-name {
  font-size: 14.5px;
  font-weight: 600;
  color: #111827;
}

.chevron-right {
  width: 16px;
  height: 16px;
  color: #9ca3af;
}

/* CTA Button */
.btn-choose-ride {
  width: 100%;
  height: 50px;
  border-radius: 12px;
  background: #000000;
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s ease, transform 0.1s ease;
}

.btn-choose-ride:hover {
  opacity: 0.92;
}

.btn-choose-ride:active {
  transform: scale(0.99);
}

.btn-choose-ride:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

/* Driving Active Container */
.driving-active-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
}

.driving-active-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.driving-pulse-badge {
  position: relative;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pulse-core {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #16a34a;
}

.pulse-ring {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(22, 163, 74, 0.25);
  animation: pulse-wave 1.8s infinite;
}

@keyframes pulse-wave {
  0% { transform: scale(0.9); opacity: 0.8; }
  100% { transform: scale(1.6); opacity: 0; }
}

.driving-header-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.driving-lead {
  font-size: 15px;
  color: #111827;
}

.driving-eta-sub {
  font-size: 12.5px;
  color: #6b7280;
  margin-top: 2px;
}

.driving-error-tag {
  margin: 0;
  padding: 6px 10px;
  border-radius: 6px;
  background: #fee2e2;
  color: #dc2626;
  font-size: 12px;
}

.driving-actions-grid {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-driving-pause {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  color: #111827;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
}

.btn-driving-pause svg {
  width: 14px;
  height: 14px;
}

.btn-driving-stop {
  flex: 1;
  height: 44px;
  border-radius: 10px;
  background: #dc2626;
  border: none;
  color: #ffffff;
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-driving-stop:hover {
  opacity: 0.9;
}

.btn-driving-share {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  color: #111827;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
}

.btn-driving-share svg {
  width: 16px;
  height: 16px;
}
</style>
