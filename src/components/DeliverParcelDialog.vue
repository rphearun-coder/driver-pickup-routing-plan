<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import SwipeToConfirm from './SwipeToConfirm.vue';
import {
  finishParcelDelivery,
  resolveParcelImageUrl,
  uploadParcelProof,
  type Parcel,
  type ReceiverBy,
} from '../api/parcels';
import { MAX_KHR, MAX_USD, amountError, parseAmount, sanitizeDecimal, sanitizeInteger } from '../utils/inputRules';

const props = defineProps<{ parcel: Parcel }>();
const emit = defineEmits<{ close: []; delivered: [] }>();

const price = props.parcel.price ?? props.parcel.codUsd ?? 0;

const receiverBy = ref<ReceiverBy>('DRIVER');
const amountUSD = ref(price ? String(price) : '');
const amountKHR = ref('');
const hasReturn = ref(false);
const submitting = ref(false);
const error = ref('');

// Photos: the seller-transfer receipt (required by the backend for SELLER) and
// an optional photo of the parcel the recipient hands back.
type PhotoKind = 'receipt' | 'return';
const photos = ref<Record<PhotoKind, { file: File | null; url: string }>>({
  receipt: { file: null, url: '' },
  return: { file: null, url: '' },
});
const fileInput = ref<HTMLInputElement | null>(null);
let pickingKind: PhotoKind = 'receipt';

const usd = computed(() => parseAmount(amountUSD.value));
const khr = computed(() => Math.round(parseAmount(amountKHR.value)));

function onUsdInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  amountUSD.value = sanitizeDecimal(input.value, 2);
  input.value = amountUSD.value;
}
function onKhrInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  amountKHR.value = sanitizeInteger(input.value, 8);
  input.value = amountKHR.value;
}

const usdError = computed(() => amountError(amountUSD.value, MAX_USD, 'Dollar amount'));
const khrError = computed(() => amountError(amountKHR.value, MAX_KHR, 'Riel amount'));
// A COD parcel must record what was collected — unless the seller was paid directly.
const missingAmount = computed(() => price > 0 && receiverBy.value === 'DRIVER' && !usd.value && !khr.value);
const inputsValid = computed(() => !usdError.value && !khrError.value && !missingAmount.value);
const receivedText = computed(() => {
  const parts = [`$${usd.value.toFixed(2)}`];
  if (khr.value) parts.push(`${khr.value.toLocaleString()}៛`);
  return parts.join(' + ');
});
// Riel can't be compared without the backend's exchange rate, so only USD-only mismatches warn.
const amountMismatch = computed(() => !khr.value && price > 0 && Math.abs(usd.value - price) > 0.001);

const receiptRequired = computed(() => receiverBy.value === 'SELLER');
const tooExpensive = computed(() => price >= 500);
const canSubmit = computed(
  () =>
    !submitting.value &&
    !tooExpensive.value &&
    inputsValid.value &&
    (!receiptRequired.value || !!photos.value.receipt.file),
);

const thumbUrl = computed(() => resolveParcelImageUrl(props.parcel.parcelImage || props.parcel.receiptImage));
const amountDone = computed(() => inputsValid.value);
const receiptDone = computed(() => !receiptRequired.value || !!photos.value.receipt.file);

function fillPrice(): void {
  amountUSD.value = price ? String(price) : '';
  amountKHR.value = '';
}

function removePhoto(kind: PhotoKind): void {
  const slot = photos.value[kind];
  if (slot.url) URL.revokeObjectURL(slot.url);
  photos.value[kind] = { file: null, url: '' };
}

function pickPhoto(kind: PhotoKind): void {
  pickingKind = kind;
  fileInput.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const slot = photos.value[pickingKind];
  if (slot.url) URL.revokeObjectURL(slot.url);
  photos.value[pickingKind] = { file, url: URL.createObjectURL(file) };
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return;
  error.value = '';
  submitting.value = true;
  try {
    const receiptFile = receiptRequired.value ? photos.value.receipt.file : null;
    const returnFile = hasReturn.value ? photos.value.return.file : null;
    const [receiptImage, proofOfReturnFromReceiver] = await Promise.all([
      receiptFile ? uploadParcelProof(receiptFile) : Promise.resolve(undefined),
      returnFile ? uploadParcelProof(returnFile) : Promise.resolve(undefined),
    ]);
    await finishParcelDelivery({
      id: props.parcel.id,
      receiverBy: receiverBy.value,
      receiptImage,
      proofImage: receiptImage,
      amountUSD: usd.value,
      amountKHR: khr.value,
      isReturn: hasReturn.value,
      proofOfReturnFromReceiver,
    });
    emit('delivered');
  } catch (err: any) {
    error.value = err.message ?? 'Failed to finish the delivery. Please try again.';
  } finally {
    submitting.value = false;
  }
}

const previousBodyOverflow = document.body.style.overflow;
onMounted(() => (document.body.style.overflow = 'hidden'));
onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow;
  Object.values(photos.value).forEach((p) => p.url && URL.revokeObjectURL(p.url));
});
</script>

<template>
  <Teleport to="#overlay-root">
    <div class="backdrop" @click.self="emit('close')">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="deliver-title">
        <span class="grabber" aria-hidden="true"></span>

        <header class="sheet-head">
          <div class="head-title">
            <span class="title-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h2 id="deliver-title">Delivering Parcel</h2>
            <button type="button" class="close-btn" aria-label="Close" @click="emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div class="parcel-summary">
            <span class="summary-thumb">
              <img v-if="thumbUrl" :src="thumbUrl" alt="" />
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" />
              </svg>
            </span>
            <span class="summary-info">
              <strong>{{ parcel.recipientName || 'Recipient' }}</strong>
              <small>{{ parcel.recipientNumber || 'No phone' }}<template v-if="parcel.location"> · {{ parcel.location }}</template></small>
            </span>
            <span class="summary-price">
              <small>Price</small>
              ${{ price.toFixed(2) }}
            </span>
          </div>
        </header>

        <div class="sheet-body">
          <p v-if="tooExpensive" class="block-box">
            Parcels of $500 or more must be finished by Operation — contact your team.
          </p>

          <section class="step">
            <p class="step-label"><span class="step-num done-always">1</span> Who received the money?</p>
            <div class="choice-grid" role="radiogroup" aria-label="Money received by">
              <button
                type="button"
                role="radio"
                class="choice-card"
                :class="{ active: receiverBy === 'DRIVER' }"
                :aria-checked="receiverBy === 'DRIVER'"
                @click="receiverBy = 'DRIVER'"
              >
                <span class="choice-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.8" /><path d="M6 9.5v5M18 9.5v5" />
                  </svg>
                </span>
                <span class="choice-text">
                  <strong>Driver</strong>
                  <small>I collected the cash</small>
                </span>
                <span class="choice-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                class="choice-card"
                :class="{ active: receiverBy === 'SELLER' }"
                :aria-checked="receiverBy === 'SELLER'"
                @click="receiverBy = 'SELLER'"
              >
                <span class="choice-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
                  </svg>
                </span>
                <span class="choice-text">
                  <strong>Transfer to seller</strong>
                  <small>Customer paid the shop</small>
                </span>
                <span class="choice-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              </button>
            </div>
          </section>

          <section class="step">
            <div class="step-row">
              <p class="step-label">
                <span class="step-num" :class="{ done: amountDone }">
                  <svg v-if="amountDone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  <template v-else>2</template>
                </span>
                Amount received
              </p>
              <button v-if="price && (usd !== price || khr)" type="button" class="fill-btn" @click="fillPrice">
                Use ${{ price.toFixed(2) }}
              </button>
            </div>

            <div class="money-grid">
              <label class="money-field" :class="{ invalid: usdError || missingAmount }">
                <span class="money-cur">USD</span>
                <span class="money-input">
                  <span class="prefix">$</span>
                  <input
                    :value="amountUSD"
                    type="text"
                    inputmode="decimal"
                    maxlength="9"
                    autocomplete="off"
                    placeholder="0.00"
                    :aria-invalid="!!usdError || missingAmount"
                    @input="onUsdInput"
                  />
                </span>
              </label>
              <label class="money-field" :class="{ invalid: khrError }">
                <span class="money-cur">KHR</span>
                <span class="money-input">
                  <span class="prefix">៛</span>
                  <input
                    :value="amountKHR"
                    type="text"
                    inputmode="numeric"
                    maxlength="8"
                    autocomplete="off"
                    placeholder="0"
                    :aria-invalid="!!khrError"
                    @input="onKhrInput"
                  />
                </span>
              </label>
            </div>
            <p v-if="usdError || khrError" class="field-error">{{ usdError || khrError }}</p>
            <p v-else-if="missingAmount" class="field-error">Enter the amount you collected.</p>

            <div class="received-bar" :class="{ warn: amountMismatch }">
              <span>Total received</span>
              <strong>{{ receivedText }}</strong>
            </div>
            <p v-if="amountMismatch" class="warn-text">Price is ${{ price.toFixed(2) }} — double-check the amount.</p>
          </section>

          <section v-if="receiptRequired" class="step">
            <p class="step-label">
              <span class="step-num" :class="{ done: receiptDone }">
                <svg v-if="receiptDone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <template v-else>3</template>
              </span>
              Transfer receipt <span class="required">*</span>
            </p>
            <div v-if="photos.receipt.url" class="photo-preview">
              <img :src="photos.receipt.url" alt="Transfer receipt" />
              <div class="photo-actions">
                <button type="button" class="photo-action" @click="pickPhoto('receipt')">Retake</button>
                <button type="button" class="photo-action danger" @click="removePhoto('receipt')">Remove</button>
              </div>
            </div>
            <button v-else type="button" class="capture-btn" @click="pickPhoto('receipt')">
              <span class="capture-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
                </svg>
              </span>
              <span class="capture-text">
                <strong>Take receipt photo</strong>
                <small>The customer's transfer screenshot or slip</small>
              </span>
            </button>
          </section>

          <section class="step">
            <label class="return-toggle" :class="{ on: hasReturn }">
              <span class="return-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" />
                </svg>
              </span>
              <span class="return-text">
                <strong>Has a parcel to return</strong>
                <small>The customer handed something back for the seller</small>
              </span>
              <input v-model="hasReturn" type="checkbox" class="switch-input" />
              <span class="switch" aria-hidden="true"><span class="switch-knob"></span></span>
            </label>

            <template v-if="hasReturn">
              <div v-if="photos.return.url" class="photo-preview small">
                <img :src="photos.return.url" alt="Returned parcel" />
                <div class="photo-actions">
                  <button type="button" class="photo-action" @click="pickPhoto('return')">Retake</button>
                  <button type="button" class="photo-action danger" @click="removePhoto('return')">Remove</button>
                </div>
              </div>
              <button v-else type="button" class="capture-btn small" @click="pickPhoto('return')">
                <span class="capture-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
                  </svg>
                </span>
                <span class="capture-text">
                  <strong>Photo of returned parcel</strong>
                  <small>Optional</small>
                </span>
              </button>
            </template>
          </section>

          <input ref="fileInput" type="file" accept="image/*" capture="environment" class="file-input" @change="onFileChange" />

          <div v-if="error" class="error-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
            </svg>
            <p>{{ error }}</p>
          </div>
        </div>

        <footer class="sheet-foot">
          <div class="checklist" aria-live="polite">
            <span :class="{ ok: amountDone }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path v-if="amountDone" d="M5 12.5l4.5 4.5L19 7.5" /><circle v-else cx="12" cy="12" r="6" />
              </svg>
              Amount
            </span>
            <span v-if="receiptRequired" :class="{ ok: receiptDone }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path v-if="receiptDone" d="M5 12.5l4.5 4.5L19 7.5" /><circle v-else cx="12" cy="12" r="6" />
              </svg>
              Receipt
            </span>
          </div>
          <SwipeToConfirm
            :label="canSubmit ? 'Swipe to deliver' : tooExpensive ? 'Needs Operation' : 'Complete the steps'"
            color="var(--green)"
            :disabled="!canSubmit"
            :loading="submitting"
            @confirm="onSubmit"
          />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(17, 24, 39, 0.55);
  animation: fade-in 0.2s ease;
}
/* Same shell as DeliveryFailedDialog: bottom sheet on phones, centred card on
   wider screens; head + swipe footer fixed, body scrolls. */
.sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  max-height: 94%;
  border-radius: 24px 24px 0 0;
  background: #fff;
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  animation: slide-up 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@media (min-width: 560px) {
  .backdrop {
    align-items: center;
    padding: 20px;
  }
  .sheet {
    max-height: calc(100dvh - 40px);
    border-radius: 24px;
    animation: pop-in 0.22s ease;
  }
  .grabber {
    display: none;
  }
}
.grabber {
  display: block;
  width: 40px;
  height: 5px;
  margin: 10px auto 0;
  border-radius: 999px;
  background: var(--disabled);
}
.sheet-head {
  padding: 10px 18px 14px;
  border-bottom: 1px solid var(--divider);
}
.head-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.title-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
  box-shadow: 0 4px 10px rgba(42, 154, 46, 0.35);
}
.title-icon svg {
  width: 16px;
  height: 16px;
}
.head-title h2 {
  flex: 1;
  margin: 0;
  color: var(--ink);
  font: 800 1.15rem var(--sans);
}
.close-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
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
  width: 15px;
  height: 15px;
}
.parcel-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 8px 12px 8px 8px;
  border-radius: 14px;
  background: var(--page);
}
.summary-thumb {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--input);
  color: var(--faint);
}
.summary-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.summary-thumb svg {
  width: 20px;
  height: 20px;
}
.summary-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.summary-info strong {
  overflow: hidden;
  color: var(--ink);
  font: 700 0.88rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary-info small {
  overflow: hidden;
  color: var(--muted);
  font: 500 0.74rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary-price {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: var(--green-strong);
  font: 800 1rem var(--sans);
}
.summary-price small {
  color: var(--muted);
  font: 600 0.62rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sheet-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 18px 8px;
  scrollbar-width: thin;
}
.block-box {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--red-soft);
  color: var(--red-deep);
  font: 600 0.8rem var(--sans);
}
.step + .step {
  margin-top: 18px;
}
.step-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.step-row .step-label {
  margin: 0;
}
.step-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  color: var(--ink);
  font: 700 0.92rem var(--sans);
}
.step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--fill);
  color: var(--text-3);
  font: 800 0.72rem var(--sans);
  transition: all 0.2s ease;
}
.step-num.done,
.step-num.done-always {
  background: var(--green);
  color: #fff;
}
.step-num svg {
  width: 12px;
  height: 12px;
}
.required {
  color: var(--red);
}
.choice-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.choice-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border: 1.5px solid var(--border);
  border-radius: 14px;
  background: #fff;
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
}
.choice-card:active {
  transform: scale(0.98);
}
.choice-card.active {
  border-color: var(--green);
  background: var(--green-tint);
  box-shadow: 0 0 0 3px rgba(42, 154, 46, 0.12);
}
.choice-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--fill);
  color: var(--text-3);
}
.choice-card.active .choice-icon {
  background: var(--green);
  color: #fff;
}
.choice-icon svg {
  width: 20px;
  height: 20px;
}
.choice-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.choice-text strong {
  color: var(--ink);
  font: 700 0.88rem var(--sans);
}
.choice-text small {
  color: var(--muted);
  font: 500 0.72rem var(--sans);
}
.choice-check {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
  opacity: 0;
  transform: scale(0.6);
  transition: all 0.15s ease;
}
.choice-card.active .choice-check {
  opacity: 1;
  transform: scale(1);
}
.choice-check svg {
  width: 11px;
  height: 11px;
}
.fill-btn {
  flex-shrink: 0;
  padding: 5px 10px;
  border: none;
  border-radius: 999px;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 700 0.74rem var(--sans);
  cursor: pointer;
}
.money-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.money-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  border: 1.5px solid var(--border-strong);
  border-radius: 14px;
  background: #fff;
  cursor: text;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.money-field:focus-within {
  border-color: var(--green);
  box-shadow: 0 0 0 3px rgba(42, 154, 46, 0.12);
}
.money-field.invalid {
  border-color: var(--red);
  background: var(--red-tint);
}
.money-cur {
  color: var(--muted);
  font: 700 0.66rem var(--sans);
  letter-spacing: 0.06em;
}
.money-input {
  display: flex;
  align-items: center;
  gap: 4px;
}
.prefix {
  color: var(--muted);
  font: 700 1.05rem var(--sans);
}
.money-input input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ink);
  font: 800 1.25rem var(--sans);
  outline: none;
}
.field-error {
  margin: 6px 4px 0;
  color: var(--red-strong);
  font: 600 0.76rem var(--sans);
}
.received-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 600 0.8rem var(--sans);
}
.received-bar strong {
  font: 800 1.05rem var(--sans);
}
.received-bar.warn {
  background: var(--orange-soft);
  color: var(--orange-deep);
}
.warn-text {
  margin: 6px 4px 0;
  color: var(--orange-strong);
  font: 600 0.76rem var(--sans);
}
.capture-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px;
  border: 1.5px dashed #a6d8a8;
  border-radius: 16px;
  background: var(--green-tint);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.capture-btn.small {
  margin-top: 10px;
  padding: 10px 12px;
}
.capture-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  box-shadow: 0 6px 14px rgba(42, 154, 46, 0.3);
}
.capture-btn.small .capture-icon {
  width: 36px;
  height: 36px;
  box-shadow: none;
}
.capture-icon svg {
  width: 22px;
  height: 22px;
}
.capture-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.capture-text strong {
  color: var(--green-strong);
  font: 700 0.9rem var(--sans);
}
.capture-text small {
  color: var(--muted);
  font: 500 0.74rem var(--sans);
}
.photo-preview {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  background: var(--ink-strong);
}
.photo-preview.small {
  margin-top: 10px;
}
.photo-preview img {
  display: block;
  width: 100%;
  height: 180px;
  object-fit: contain;
}
.photo-preview.small img {
  height: 130px;
}
.photo-actions {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  gap: 6px;
}
.photo-action {
  padding: 7px 12px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--ink-strong);
  font: 700 0.76rem var(--sans);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}
.photo-action.danger {
  color: var(--red-strong);
}
.return-toggle {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1.5px solid var(--border);
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.return-toggle.on {
  border-color: #f0c38f;
  background: var(--orange-tint);
}
.return-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--orange-soft);
  color: var(--orange);
}
.return-icon svg {
  width: 18px;
  height: 18px;
}
.return-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.return-text strong {
  color: var(--ink);
  font: 700 0.86rem var(--sans);
}
.return-text small {
  color: var(--muted);
  font: 500 0.72rem var(--sans);
}
.switch-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.switch {
  flex-shrink: 0;
  position: relative;
  width: 42px;
  height: 24px;
  padding: 2px;
  border-radius: 999px;
  background: var(--disabled);
  transition: background 0.15s ease;
}
.switch-knob {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s ease;
}
.switch-input:checked + .switch {
  background: var(--orange);
}
.switch-input:checked + .switch .switch-knob {
  transform: translateX(18px);
}
.switch-input:focus-visible + .switch {
  outline: 3px solid rgba(217, 115, 26, 0.35);
  outline-offset: 2px;
}
.file-input {
  display: none;
}
.error-box {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  padding: 12px;
  border-radius: 14px;
  background: var(--red-soft);
}
.error-box > svg {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: var(--red-strong);
}
.error-box p {
  margin: 0;
  color: var(--red-deep);
  font: 600 0.8rem/1.4 var(--sans);
}
.sheet-foot {
  padding: 12px 18px calc(16px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--divider);
  background: #fff;
}
.checklist {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 10px;
}
.checklist span {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--faint);
  font: 700 0.76rem var(--sans);
  transition: color 0.2s ease;
}
.checklist span.ok {
  color: var(--green-strong);
}
.checklist svg {
  width: 14px;
  height: 14px;
}
@keyframes slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
@keyframes pop-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
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
