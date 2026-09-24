<template>
  <div class="pickup-filter">
    <button type="button" class="date-filter-toggle" @click="openModal">
      <span>{{ summaryLabel }}</span>
      <IconChevronDown class="chevron" />
    </button>

    <Teleport to="#overlay-root">
      <div v-if="open" class="pickup-filter-backdrop" @click.self="close">
        <div class="pickup-filter-modal" role="dialog" aria-modal="true" aria-label="Filter pickups">
          <div class="pickup-filter-modal-header">
            <span>Filter pickups</span>
            <button type="button" class="pickup-filter-close-x" aria-label="Close" @click="close">×</button>
          </div>

          <div class="pickup-filter-modal-body">
            <span class="pickup-filter-label">Date</span>
            <div class="pickup-filter-date-row">
              <input type="date" v-model="draftDate" />
              <button type="button" class="pickup-filter-today-btn" @click="draftDate = todayIso()">Today</button>
            </div>

            <span class="pickup-filter-label">Pickup time</span>
            <div class="pickup-filter-segment">
              <button
                v-for="opt in timeOptions"
                :key="opt.value"
                type="button"
                class="pickup-filter-segment-btn"
                :class="{ active: draftPickupTime === opt.value }"
                @click="draftPickupTime = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <button type="button" class="pickup-filter-close-btn" @click="close">Close</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { todayIso } from '@/utils/date';
import IconChevronDown from '../icons/IconChevronDown.vue';
import type { PickupTimeSlot } from '@/types';

const props = withDefaults(
  defineProps<{
    date?: string;
    pickupTime?: PickupTimeSlot | '';
  }>(),
  {
    date: '',
    pickupTime: '',
  }
);

const emit = defineEmits<{
  apply: [payload: { date: string; pickupTime: PickupTimeSlot | '' }];
}>();

const timeOptions: { value: PickupTimeSlot | ''; label: string }[] = [
  { value: '', label: 'All day' },
  { value: 'MORNING', label: 'Morning' },
  { value: 'AFTERNOON', label: 'Afternoon' },
  { value: 'EVENING', label: 'Evening' },
];

const open = ref(false);
const draftDate = ref(props.date || todayIso());
const draftPickupTime = ref<PickupTimeSlot | ''>(props.pickupTime || '');

function openModal(): void {
  draftDate.value = props.date || todayIso();
  draftPickupTime.value = props.pickupTime || '';
  open.value = true;
}

// Nothing is applied while the modal is open — date and pickup-time picks stay local
// until Close (button, backdrop click, or ×), which publishes both together at once.
function close(): void {
  open.value = false;
  emit('apply', { date: draftDate.value || todayIso(), pickupTime: draftPickupTime.value });
}

const summaryLabel = computed(() => {
  const datePart =
    props.date === todayIso()
      ? 'Today'
      : (() => {
          const [year, month, day] = (props.date || todayIso()).split('-').map(Number);
          return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        })();
  const timeLabel = timeOptions.find((opt) => opt.value === props.pickupTime)?.label;
  return timeLabel && props.pickupTime ? `${datePart} · ${timeLabel}` : datePart;
});
</script>
