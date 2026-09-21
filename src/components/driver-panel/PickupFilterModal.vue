<template>
  <div class="pickup-filter-wrapper">
    <!-- Optional Trigger Button (for backward compatibility when not controlled via props) -->
    <button
      v-if="openProp === undefined"
      type="button"
      class="date-filter-toggle"
      @click="openModal"
    >
      <span>{{ summaryLabel }}</span>
      <IconChevronDown class="chevron" />
    </button>

    <!-- Modal Teleported to Body -->
    <Teleport to="body">
      <Transition name="sheet-fade">
        <div v-if="isOpen" class="filter-backdrop" @click.self="handleClose">
          <div
            class="filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Filter pickups"
          >
            <!-- Drag Handle Bar -->
            <div class="sheet-drag-bar">
              <span class="sheet-drag-pill"></span>
            </div>

            <!-- Header -->
            <div class="sheet-head">
              <div class="head-text">
                <h2 class="head-title">Filter pickups</h2>
                <p class="head-subtitle">Select pickup date & preferred time window</p>
              </div>
              <button
                type="button"
                class="btn-close-circle"
                aria-label="Close filter"
                @click="handleClose"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <!-- Modal Content Body -->
            <div class="sheet-content">
              <!-- DATE SECTION -->
              <div class="filter-group">
                <div class="group-label-row">
                  <span class="group-label">Pickup Date</span>
                  <div class="group-actions-right">
                    <button
                      type="button"
                      class="btn-calendar-toggle"
                      :class="{ active: showMonthCalendar }"
                      @click="showMonthCalendar = !showMonthCalendar"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span>{{ showMonthCalendar ? 'Hide calendar' : 'Month view' }}</span>
                    </button>
                  </div>
                </div>

                <!-- Quick Date Chips Row -->
                <div class="date-presets-row">
                  <button
                    type="button"
                    class="preset-chip"
                    :class="{ active: isTodaySelected }"
                    @click="setToday"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    class="preset-chip"
                    :class="{ active: isTomorrowSelected }"
                    @click="setTomorrow"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    class="preset-chip"
                    :class="{ active: isWeekendSelected }"
                    @click="setWeekend"
                  >
                    This Weekend
                  </button>
                  <button
                    type="button"
                    class="preset-chip"
                    :class="{ active: isNextWeekSelected }"
                    @click="setNextWeek"
                  >
                    Next Week
                  </button>
                </div>

                <!-- Horizontal 14-Day Date Strip -->
                <div v-if="!showMonthCalendar" class="days-strip-container">
                  <div
                    v-for="day in upcomingDays"
                    :key="day.dateIso"
                    class="day-strip-card"
                    :class="{ selected: draftDate === day.dateIso, today: day.isToday }"
                    @click="selectDay(day.dateIso)"
                  >
                    <span class="day-strip-name">{{ day.dayName }}</span>
                    <span class="day-strip-num">{{ day.dayNum }}</span>
                    <span class="day-strip-month">{{ day.monthName }}</span>
                    <span v-if="draftDate === day.dateIso" class="day-strip-dot"></span>
                  </div>
                </div>

                <!-- Expandable Full Month Calendar -->
                <div v-else class="month-calendar-box">
                  <!-- Month Nav Header -->
                  <div class="calendar-nav-bar">
                    <button type="button" class="cal-nav-btn" @click="prevMonth" aria-label="Previous month">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="m15 18-6-6 6-6" />
                      </svg>
                    </button>
                    <span class="calendar-month-title">{{ monthYearDisplay }}</span>
                    <button type="button" class="cal-nav-btn" @click="nextMonth" aria-label="Next month">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  </div>

                  <!-- Weekday Names Row -->
                  <div class="calendar-weekdays-grid">
                    <span v-for="wd in ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']" :key="wd" class="cal-wd-header">
                      {{ wd }}
                    </span>
                  </div>

                  <!-- Calendar Days Grid -->
                  <div class="calendar-days-grid">
                    <div
                      v-for="(cell, i) in calendarDays"
                      :key="i"
                      class="cal-day-cell"
                      :class="{
                        empty: !cell.date,
                        selected: cell.dateIso === draftDate,
                        today: cell.isToday,
                        past: cell.isPast
                      }"
                      @click="cell.dateIso && !cell.isPast && selectDay(cell.dateIso)"
                    >
                      <span v-if="cell.date" class="cal-day-text">{{ cell.dayNum }}</span>
                    </div>
                  </div>
                </div>

                <!-- Selected Date Confirmation Banner -->
                <div class="date-summary-banner">
                  <div class="banner-calendar-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#111827" stroke-width="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div class="banner-info">
                    <span class="banner-title">{{ fullDateDisplay }}</span>
                    <span class="banner-sub">{{ dateRelativeHint }}</span>
                  </div>
                </div>
              </div>

              <!-- TIME WINDOW SECTION -->
              <div class="filter-group">
                <div class="group-label-row">
                  <span class="group-label">Pickup Time Window</span>
                  <span class="group-value-hint">{{ selectedTimeLabel }}</span>
                </div>

                <div class="time-slots-grid">
                  <div
                    v-for="opt in timeOptions"
                    :key="opt.value"
                    class="time-slot-card"
                    :class="{ selected: draftPickupTime === opt.value }"
                    @click="draftPickupTime = opt.value"
                  >
                    <div class="slot-card-header">
                      <div class="slot-icon-box" :class="opt.iconClass">
                        <!-- Clock / All day -->
                        <svg v-if="opt.value === ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <!-- Sunrise / Morning -->
                        <svg v-else-if="opt.value === 'MORNING'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M12 2v4M4.93 7.93l2.83 2.83M2 14h4M20 14h4M16.24 10.76l2.83-2.83M18 18H6a6 6 0 0 1 12 0z" />
                          <line x1="2" y1="22" x2="22" y2="22" />
                        </svg>
                        <!-- Sun / Afternoon -->
                        <svg v-else-if="opt.value === 'AFTERNOON'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="5" />
                          <line x1="12" y1="1" x2="12" y2="3" />
                          <line x1="12" y1="21" x2="12" y2="23" />
                          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                          <line x1="1" y1="12" x2="3" y2="12" />
                          <line x1="21" y1="12" x2="23" y2="12" />
                          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </svg>
                        <!-- Moon / Evening -->
                        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        </svg>
                      </div>

                      <div v-if="draftPickupTime === opt.value" class="slot-check-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    </div>

                    <span class="slot-card-title">{{ opt.label }}</span>
                    <span class="slot-card-sub">{{ opt.sub }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer Action Buttons -->
            <div class="sheet-footer-actions">
              <button
                type="button"
                class="btn-reset-filters"
                @click="resetFilters"
              >
                Reset
              </button>
              <button
                type="button"
                class="btn-apply-filters"
                @click="applyAndClose"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { todayIso } from '@/utils/date';
import IconChevronDown from '../icons/IconChevronDown.vue';
import type { PickupTimeSlot } from '@/types';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    date?: string;
    pickupTime?: PickupTimeSlot | '';
  }>(),
  {
    open: undefined,
    date: '',
    pickupTime: '',
  }
);

const emit = defineEmits<{
  apply: [payload: { date: string; pickupTime: PickupTimeSlot | '' }];
  close: [];
  'update:open': [isOpen: boolean];
}>();

const openProp = computed(() => props.open);
const localOpen = ref(false);

const isOpen = computed(() => {
  if (openProp.value !== undefined) {
    return openProp.value;
  }
  return localOpen.value;
});

const draftDate = ref(props.date || todayIso());
const draftPickupTime = ref<PickupTimeSlot | ''>(props.pickupTime || '');
const showMonthCalendar = ref(false);
const activeCalendarMonth = ref(new Date());

watch(
  () => [props.date, props.pickupTime, isOpen.value],
  ([newDate, newTime, open]) => {
    if (open) {
      const selected = (newDate as string) || todayIso();
      draftDate.value = selected;
      draftPickupTime.value = (newTime as PickupTimeSlot | '') || '';
      const [y, m] = selected.split('-').map(Number);
      if (y && m) {
        activeCalendarMonth.value = new Date(y, m - 1, 1);
      }
    }
  },
  { immediate: true }
);

function formatIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatIso(d);
}

function thisWeekendIso(): string {
  const d = new Date();
  const day = d.getDay();
  // If Saturday(6) or Sunday(0), return today or upcoming Saturday
  const diff = day === 6 ? 0 : day === 0 ? 0 : 6 - day;
  d.setDate(d.getDate() + diff);
  return formatIso(d);
}

function nextWeekIso(): string {
  const d = new Date();
  const day = d.getDay();
  // Next Monday
  const diff = ((1 + 7 - day) % 7) || 7;
  d.setDate(d.getDate() + diff);
  return formatIso(d);
}

const isTodaySelected = computed(() => draftDate.value === todayIso());
const isTomorrowSelected = computed(() => draftDate.value === tomorrowIso());
const isWeekendSelected = computed(() => draftDate.value === thisWeekendIso());
const isNextWeekSelected = computed(() => draftDate.value === nextWeekIso());

function setToday(): void {
  draftDate.value = todayIso();
}

function setTomorrow(): void {
  draftDate.value = tomorrowIso();
}

function setWeekend(): void {
  draftDate.value = thisWeekendIso();
}

function setNextWeek(): void {
  draftDate.value = nextWeekIso();
}

function selectDay(dateIso: string): void {
  draftDate.value = dateIso;
}

// 14-Day Upcoming Day Strip
interface DayStripItem {
  dateIso: string;
  dayName: string;
  dayNum: number;
  monthName: string;
  isToday: boolean;
  isTomorrow: boolean;
}

const upcomingDays = computed<DayStripItem[]>(() => {
  const list: DayStripItem[] = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateIso = formatIso(d);
    let dayName = d.toLocaleDateString([], { weekday: 'short' });
    if (i === 0) dayName = 'Today';
    else if (i === 1) dayName = 'Tmrw';

    list.push({
      dateIso,
      dayName,
      dayNum: d.getDate(),
      monthName: d.toLocaleDateString([], { month: 'short' }),
      isToday: i === 0,
      isTomorrow: i === 1,
    });
  }
  return list;
});

// Full Month Calendar Generation
const monthYearDisplay = computed(() => {
  return activeCalendarMonth.value.toLocaleDateString([], { month: 'long', year: 'numeric' });
});

function prevMonth(): void {
  const current = activeCalendarMonth.value;
  activeCalendarMonth.value = new Date(current.getFullYear(), current.getMonth() - 1, 1);
}

function nextMonth(): void {
  const current = activeCalendarMonth.value;
  activeCalendarMonth.value = new Date(current.getFullYear(), current.getMonth() + 1, 1);
}

interface CalendarCell {
  date: Date | null;
  dateIso: string;
  dayNum: number;
  isToday: boolean;
  isPast: boolean;
}

const calendarDays = computed<CalendarCell[]>(() => {
  const cells: CalendarCell[] = [];
  const curr = activeCalendarMonth.value;
  const year = curr.getFullYear();
  const month = curr.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  // Empty leading days
  for (let i = 0; i < firstDayIndex; i++) {
    cells.push({ date: null, dateIso: '', dayNum: 0, isToday: false, isPast: true });
  }

  // Actual days
  for (let d = 1; d <= daysInMonth; d++) {
    const dayDate = new Date(year, month, d);
    dayDate.setHours(0, 0, 0, 0);
    const dateIso = formatIso(dayDate);
    const isToday = dayDate.getTime() === todayMidnight.getTime();
    const isPast = dayDate.getTime() < todayMidnight.getTime();

    cells.push({
      date: dayDate,
      dateIso,
      dayNum: d,
      isToday,
      isPast,
    });
  }

  return cells;
});

// Live Date Formats
const fullDateDisplay = computed(() => {
  const [year, month, day] = draftDate.value.split('-').map(Number);
  if (!year || !month || !day) return 'Select Date';
  return new Date(year, month - 1, day).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
});

const dateRelativeHint = computed(() => {
  if (isTodaySelected.value) return 'Scheduled for today';
  if (isTomorrowSelected.value) return 'Scheduled for tomorrow';
  const [year, month, day] = draftDate.value.split('-').map(Number);
  if (!year || !month || !day) return '';
  const target = new Date(year, month - 1, day);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 1) return `In ${diffDays} days`;
  if (diffDays < 0) return 'Past date';
  return '';
});

interface TimeSlotOption {
  value: PickupTimeSlot | '';
  label: string;
  sub: string;
  iconClass: string;
}

const timeOptions: TimeSlotOption[] = [
  {
    value: '',
    label: 'All day',
    sub: 'Any pickup window',
    iconClass: 'icon-allday',
  },
  {
    value: 'MORNING',
    label: 'Morning',
    sub: '8:00 AM – 12:00 PM',
    iconClass: 'icon-morning',
  },
  {
    value: 'AFTERNOON',
    label: 'Afternoon',
    sub: '12:00 PM – 5:00 PM',
    iconClass: 'icon-afternoon',
  },
  {
    value: 'EVENING',
    label: 'Evening',
    sub: '5:00 PM – 9:00 PM',
    iconClass: 'icon-evening',
  },
];

const selectedTimeLabel = computed(() => {
  const match = timeOptions.find((o) => o.value === draftPickupTime.value);
  return match?.label ?? 'All day';
});

function openModal(): void {
  localOpen.value = true;
  emit('update:open', true);
}

function handleClose(): void {
  localOpen.value = false;
  emit('update:open', false);
  emit('close');
}

function resetFilters(): void {
  draftDate.value = todayIso();
  draftPickupTime.value = '';
  showMonthCalendar.value = false;
}

function applyAndClose(): void {
  emit('apply', {
    date: draftDate.value || todayIso(),
    pickupTime: draftPickupTime.value,
  });
  handleClose();
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

<style scoped>
.pickup-filter-wrapper {
  display: inline-block;
}

/* Fallback inline trigger */
.date-filter-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  background: #ffffff;
  color: #111827;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.date-filter-toggle .chevron {
  width: 12px;
  height: 12px;
  color: #6b7280;
}

/* Backdrop */
.filter-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  padding: 0;
  box-sizing: border-box;
}

/* Sheet / Modal */
.filter-sheet {
  width: 100%;
  max-width: 440px;
  max-height: 92vh;
  max-height: 92dvh;
  overflow-y: auto;
  background: #ffffff;
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.18);
  padding: 10px 20px 28px 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #000000;
  box-sizing: border-box;
  animation: slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  scrollbar-width: none;
}

.filter-sheet::-webkit-scrollbar {
  display: none;
}

@keyframes slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

/* Transitions */
.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.2s ease;
}

.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.sheet-fade-leave-active .filter-sheet {
  transition: transform 0.2s ease-in;
  transform: translateY(100%);
}

/* Drag Handle */
.sheet-drag-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 14px;
  width: 100%;
}

.sheet-drag-pill {
  width: 38px;
  height: 4.5px;
  border-radius: 4px;
  background: #e5e7eb;
}

/* Header */
.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-top: 6px;
  margin-bottom: 18px;
}

.head-text {
  display: flex;
  flex-direction: column;
}

.head-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #000000;
  letter-spacing: -0.3px;
}

.head-subtitle {
  margin: 4px 0 0 0;
  font-size: 13px;
  color: #6b7280;
}

.btn-close-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  color: #374151;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-close-circle:hover {
  background: #e5e7eb;
  color: #000000;
}

.btn-close-circle svg {
  width: 18px;
  height: 18px;
}

/* Content */
.sheet-content {
  display: flex;
  flex-direction: column;
  gap: 22px;
  margin-bottom: 24px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.group-label {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.btn-calendar-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #111827;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-calendar-toggle:hover {
  background: #f3f4f6;
}

.btn-calendar-toggle.active {
  background: #111827;
  color: #ffffff;
  border-color: #111827;
}

.btn-calendar-toggle svg {
  width: 13px;
  height: 13px;
}

.group-value-hint {
  font-size: 13px;
  font-weight: 600;
  color: #2563eb;
}

/* Date Preset Chips */
.date-presets-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.date-presets-row::-webkit-scrollbar {
  display: none;
}

.preset-chip {
  flex-shrink: 0;
  padding: 7px 14px;
  border-radius: 20px;
  border: 1.5px solid #e5e7eb;
  background: #ffffff;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-chip:hover {
  background: #f9fafb;
}

.preset-chip.active {
  background: #000000;
  color: #ffffff;
  border-color: #000000;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.12);
}

/* 14-Day Strip */
.days-strip-container {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0 6px 0;
  scrollbar-width: none;
  scroll-snap-type: x mandatory;
}

.days-strip-container::-webkit-scrollbar {
  display: none;
}

.day-strip-card {
  flex-shrink: 0;
  width: 58px;
  height: 80px;
  border-radius: 14px;
  border: 1.5px solid #e5e7eb;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  scroll-snap-align: start;
  transition: all 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.day-strip-card:hover {
  border-color: #9ca3af;
  background: #f9fafb;
}

.day-strip-card.selected {
  background: #000000;
  border-color: #000000;
  color: #ffffff;
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.18);
}

.day-strip-name {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.day-strip-card.selected .day-strip-name {
  color: #d1d5db;
}

.day-strip-num {
  font-size: 19px;
  font-weight: 800;
  color: #111827;
  margin: 3px 0;
}

.day-strip-card.selected .day-strip-num {
  color: #ffffff;
}

.day-strip-month {
  font-size: 10px;
  font-weight: 600;
  color: #9ca3af;
}

.day-strip-card.selected .day-strip-month {
  color: #9ca3af;
}

.day-strip-dot {
  position: absolute;
  bottom: 5px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #ffffff;
}

/* Month Calendar */
.month-calendar-box {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 14px;
}

.calendar-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.calendar-month-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.cal-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
  cursor: pointer;
  transition: background 0.15s;
}

.cal-nav-btn:hover {
  background: #f3f4f6;
}

.cal-nav-btn svg {
  width: 16px;
  height: 16px;
}

.calendar-weekdays-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  margin-bottom: 8px;
}

.cal-wd-header {
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
}

.calendar-days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.cal-day-cell {
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 600;
  color: #111827;
  transition: all 0.15s;
}

.cal-day-cell:not(.empty):not(.past):hover {
  background: #e5e7eb;
}

.cal-day-cell.empty {
  cursor: default;
}

.cal-day-cell.past {
  color: #d1d5db;
  cursor: not-allowed;
}

.cal-day-cell.today:not(.selected) {
  background: #e5e7eb;
  font-weight: 700;
}

.cal-day-cell.selected {
  background: #000000;
  color: #ffffff;
  font-weight: 700;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

/* Date Summary Banner */
.date-summary-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px 14px;
}

.banner-calendar-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.banner-calendar-icon svg {
  width: 18px;
  height: 18px;
}

.banner-info {
  display: flex;
  flex-direction: column;
}

.banner-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.banner-sub {
  font-size: 12px;
  color: #16a34a;
  font-weight: 600;
}

/* Time Slots Grid */
.time-slots-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.time-slot-card {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  border-radius: 14px;
  border: 2px solid transparent;
  background: #f9fafb;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.time-slot-card:hover {
  background: #f3f4f6;
}

.time-slot-card.selected {
  border-color: #000000;
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.slot-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.slot-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #e5e7eb;
  color: #111827;
}

.slot-icon-box svg {
  width: 18px;
  height: 18px;
}

.slot-icon-box.icon-allday {
  background: #f3e8ff;
  color: #7e22ce;
}

.slot-icon-box.icon-morning {
  background: #ffedd5;
  color: #ea580c;
}

.slot-icon-box.icon-afternoon {
  background: #fef08a;
  color: #ca8a04;
}

.slot-icon-box.icon-evening {
  background: #dbeafe;
  color: #2563eb;
}

.slot-check-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #000000;
}

.slot-check-badge svg {
  width: 12px;
  height: 12px;
}

.slot-card-title {
  font-size: 14.5px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 2px;
}

.slot-card-sub {
  font-size: 11.5px;
  color: #6b7280;
}

/* Footer Actions */
.sheet-footer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-reset-filters {
  height: 50px;
  padding: 0 20px;
  border-radius: 12px;
  border: 1.5px solid #e5e7eb;
  background: #ffffff;
  color: #374151;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-reset-filters:hover {
  background: #f3f4f6;
  color: #000000;
}

.btn-apply-filters {
  flex: 1;
  height: 50px;
  border-radius: 12px;
  border: none;
  background: #000000;
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s, transform 0.1s;
}

.btn-apply-filters:hover {
  opacity: 0.92;
}

.btn-apply-filters:active {
  transform: scale(0.99);
}
</style>
