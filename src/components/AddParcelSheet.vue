<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { MAX_PARCELS, MAX_USD, amountError, countError, parseAmount, sanitizeDecimal, sanitizeInteger } from '../utils/inputRules';

const props = withDefaults(
  defineProps<{
    initialTotal?: number;
    initialPrice?: number;
    noSticker?: boolean;
    submitting?: boolean;
    error?: string;
  }>(),
  { initialTotal: undefined, initialPrice: undefined, noSticker: false, submitting: false, error: '' },
);
const emit = defineEmits<{
  submit: [value: { totalParcel: number; totalPrice: number; noSticker: boolean }];
  close: [];
}>();

const totalParcel = ref(props.initialTotal ? String(props.initialTotal) : '');
const totalPrice = ref(props.initialPrice ? String(props.initialPrice) : '');
const noSticker = ref(props.noSticker);

const parsedTotal = computed(() => Number.parseInt(totalParcel.value, 10));
const totalTouched = ref(!!props.initialTotal);
const totalError = computed(() => countError(totalParcel.value, MAX_PARCELS));
const priceError = computed(() => amountError(totalPrice.value, MAX_USD, 'Total price'));
const canSubmit = computed(() => !totalError.value && !priceError.value && !props.submitting);

function onTotalInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  totalParcel.value = sanitizeInteger(input.value, 3);
  input.value = totalParcel.value;
  totalTouched.value = true;
}

function onPriceInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  totalPrice.value = sanitizeDecimal(input.value, 2);
  input.value = totalPrice.value;
}

function step(delta: number): void {
  const current = Number.isInteger(parsedTotal.value) ? parsedTotal.value : 0;
  totalParcel.value = String(Math.min(MAX_PARCELS, Math.max(1, current + delta)));
  totalTouched.value = true;
}

function onSubmit(): void {
  totalTouched.value = true;
  if (!canSubmit.value) return;
  emit('submit', {
    totalParcel: parsedTotal.value,
    totalPrice: parseAmount(totalPrice.value),
    noSticker: noSticker.value,
  });
}

const previousBodyOverflow = document.body.style.overflow;
onMounted(() => (document.body.style.overflow = 'hidden'));
onUnmounted(() => (document.body.style.overflow = previousBodyOverflow));
</script>

<template>
  <Teleport to="#overlay-root">
    <div class="sheet-backdrop" @click.self="emit('close')">
      <form class="sheet" @submit.prevent="onSubmit">
        <span class="drag-handle"></span>

        <div class="sheet-header">
          <div>
            <h2 class="sheet-title">Enter Information</h2>
            <p class="sheet-subtitle">How many parcels are you picking up?</p>
          </div>
          <button type="button" class="close-btn" aria-label="Close" @click="emit('close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div class="segmented" role="radiogroup" aria-label="Sticker">
          <button type="button" role="radio" :aria-checked="!noSticker" :class="{ active: !noSticker }" @click="noSticker = false">
            With sticker
          </button>
          <button type="button" role="radio" :aria-checked="noSticker" :class="{ active: noSticker }" @click="noSticker = true">
            No sticker
          </button>
        </div>
        <p class="segmented-hint">
          {{ noSticker ? 'Parcel IDs will be generated automatically.' : "You'll scan each parcel's sticker QR code." }}
        </p>

        <label class="field-label" for="parcel-total">Total parcels <span class="required">*</span></label>
        <div class="stepper" :class="{ 'has-error': totalTouched && totalError }">
          <button type="button" class="stepper-btn" aria-label="Decrease" :disabled="!(parsedTotal > 1)" @click="step(-1)">−</button>
          <input
            id="parcel-total"
            :value="totalParcel"
            type="text"
            inputmode="numeric"
            maxlength="3"
            autocomplete="off"
            class="text-input stepper-input"
            :class="{ invalid: totalTouched && totalError }"
            placeholder="0"
            :aria-invalid="totalTouched && !!totalError"
            @input="onTotalInput"
            @blur="totalTouched = true"
          />
          <button
            type="button"
            class="stepper-btn"
            aria-label="Increase"
            :disabled="parsedTotal >= MAX_PARCELS"
            @click="step(1)"
          >
            +
          </button>
        </div>
        <p v-if="totalTouched && totalError" class="field-error">{{ totalError }}</p>

        <label class="field-label" for="parcel-price">Total price <span class="optional">(optional)</span></label>
        <div class="price-field">
          <span class="price-prefix">$</span>
          <input
            id="parcel-price"
            :value="totalPrice"
            type="text"
            inputmode="decimal"
            maxlength="9"
            autocomplete="off"
            class="text-input price-input"
            :class="{ invalid: priceError }"
            placeholder="0.00"
            :aria-invalid="!!priceError"
            @input="onPriceInput"
          />
        </div>
        <p v-if="priceError" class="field-error">{{ priceError }}</p>

        <p v-if="error" class="error-text">{{ error }}</p>

        <button type="submit" class="confirm-btn" :disabled="!canSubmit">
          {{ submitting ? 'Saving…' : 'Confirm' }}
        </button>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(17, 24, 39, 0.6);
  overscroll-behavior: contain;
  animation: fade-in 0.2s ease;
}
.sheet {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: 90%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 20px calc(24px + env(safe-area-inset-bottom));
  border-radius: 22px 22px 0 0;
  background: #fff;
  animation: slide-up 0.25s ease;
}
.drag-handle {
  display: block;
  width: 40px;
  height: 5px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: var(--disabled);
}
.sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
.sheet-title {
  margin: 0 0 2px;
  color: var(--ink);
  font: 700 1.15rem var(--sans);
}
.sheet-subtitle {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--text-3);
  cursor: pointer;
}
.close-btn svg {
  width: 16px;
  height: 16px;
}
.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: var(--fill);
}
.segmented button {
  height: 38px;
  border: none;
  border-radius: 9px;
  background: none;
  color: var(--muted);
  font: 600 0.88rem var(--sans);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.segmented button.active {
  background: #fff;
  color: var(--ink);
  box-shadow: 0 1px 4px rgba(17, 24, 39, 0.12);
}
.segmented-hint {
  margin: 8px 2px 20px;
  color: var(--muted);
  font-size: 0.78rem;
}
.field-label {
  display: block;
  margin: 0 0 8px;
  color: var(--ink);
  font: 600 0.9rem var(--sans);
}
.required {
  color: var(--red);
}
.optional {
  color: var(--muted);
  font-weight: 400;
}
.text-input {
  display: block;
  width: 100%;
  height: 50px;
  padding: 0 16px;
  border: 1.5px solid transparent;
  border-radius: 12px;
  background: var(--input);
  color: var(--ink);
  font: 600 16px var(--sans); /* iOS Safari auto-zooms on focus if an input's font-size is under 16px */
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.text-input:focus {
  border-color: var(--green);
  background: #fff;
}
.text-input::-webkit-outer-spin-button,
.text-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.text-input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}
.stepper {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.stepper.has-error {
  margin-bottom: 6px;
}
.text-input.invalid {
  border-color: var(--red);
  background: var(--red-tint);
}
.field-error {
  margin: 0 2px 16px;
  color: var(--red-strong);
  font: 600 0.76rem var(--sans);
}
.stepper-btn {
  flex-shrink: 0;
  width: 50px;
  height: 50px;
  border: none;
  border-radius: 12px;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 600 1.5rem var(--sans);
  line-height: 1;
  cursor: pointer;
}
.stepper-btn:disabled {
  background: var(--fill);
  color: #b0b6bf;
  cursor: not-allowed;
}
.stepper-input {
  text-align: center;
  font-size: 1.2rem;
}
.price-field {
  position: relative;
  margin-bottom: 8px;
}
.price-prefix {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font: 600 1rem var(--sans);
  pointer-events: none;
}
.price-input {
  padding-left: 32px;
}
.error-text {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--red-soft);
  color: var(--red-strong);
  font: 600 0.8rem var(--sans);
  text-align: center;
}
.confirm-btn {
  width: 100%;
  height: 52px;
  margin-top: 20px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 1rem var(--sans);
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(42, 154, 46, 0.25);
}
.confirm-btn:disabled {
  background: #b7c2b8;
  box-shadow: none;
  cursor: not-allowed;
}
@keyframes slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
