<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import SwipeToConfirm from './SwipeToConfirm.vue';
import {
  markDeliveryFailed,
  resolveParcelImageUrl,
  sendDeliveryAssistantMessage,
  uploadParcelProof,
  type Parcel,
} from '../api/parcels';
import { textError } from '../utils/inputRules';

const OTHER_MIN = 5;
const OTHER_MAX = 200;

const props = defineProps<{ parcel: Parcel }>();
const emit = defineEmits<{ close: []; failed: [] }>();

const REASONS = [
  'Customer changed their mind',
  'Customer not answering phone',
  "Wrong address / can't locate",
  'Customer requested reschedule',
  'Customer refused the parcel',
  'Other',
];

// SVG path data per reason, drawn inside a 24×24 stroke icon.
const REASON_ICONS: Record<string, string> = {
  'Customer changed their mind': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 15.5s1.2-1.5 3.5-1.5 3.5 1.5 3.5 1.5M9 9.5h.01M15 9.5h.01',
  'Customer not answering phone':
    'M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4zM15 3l6 6M21 3l-6 6',
  "Wrong address / can't locate": 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM9.5 7l5 5M14.5 7l-5 5',
  'Customer requested reschedule': 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4',
  'Customer refused the parcel': 'M12 3 20 7.5v9L12 21l-8-4.5v-9zM8 8l8 8M16 8l-8 8',
  Other: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
};

const thumbUrl = computed(() => resolveParcelImageUrl(props.parcel.parcelImage || props.parcel.receiptImage));
const priceText = computed(() => `$${(props.parcel.codUsd || props.parcel.price || 0).toFixed(2)}`);
const reasonDone = computed(() => !otherError.value);

function removePhoto(): void {
  if (proofPreviewUrl.value) URL.revokeObjectURL(proofPreviewUrl.value);
  proofPreviewUrl.value = '';
  proofFile.value = null;
}

const reason = ref(REASONS[0]);
const otherReason = ref('');
const proofFile = ref<File | null>(null);
const proofPreviewUrl = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const submitting = ref(false);
const error = ref('');
const helpSending = ref(false);
const helpSent = ref(false);

// Collapse runs of spaces/newlines so the saved reason reads as one clean line.
const finalReason = computed(() =>
  reason.value === 'Other' ? otherReason.value.replace(/\s+/g, ' ').trim() : reason.value,
);
const otherTouched = ref(false);
const otherError = computed(() =>
  reason.value === 'Other' ? textError(otherReason.value, OTHER_MIN, OTHER_MAX, 'Reason') : '',
);
const canSubmit = computed(() => !otherError.value && !!proofFile.value && !submitting.value);

function pickPhoto(): void {
  fileInput.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (proofPreviewUrl.value) URL.revokeObjectURL(proofPreviewUrl.value);
  proofFile.value = file;
  proofPreviewUrl.value = URL.createObjectURL(file);
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value || !proofFile.value) return;
  error.value = '';
  submitting.value = true;
  try {
    const proofOfFailed = await uploadParcelProof(proofFile.value);
    await markDeliveryFailed(props.parcel.id, finalReason.value, proofOfFailed);
    emit('failed');
  } catch (err: any) {
    // deliveryFailed needs a same-day help request plus a cooldown (parcel.service.ts);
    // the backend's own message says which is missing, so it's shown as-is.
    error.value = err.message ?? 'Failed to submit. Please try again.';
  } finally {
    submitting.value = false;
  }
}

// Shortcut for the most common rejection: no help request sent today yet.
async function onSendHelp(): Promise<void> {
  helpSending.value = true;
  try {
    await sendDeliveryAssistantMessage(props.parcel.id, finalReason.value || reason.value);
    helpSent.value = true;
    error.value = '';
  } catch (err: any) {
    error.value = err.message ?? 'Failed to send the help request.';
  } finally {
    helpSending.value = false;
  }
}

const previousBodyOverflow = document.body.style.overflow;
onMounted(() => (document.body.style.overflow = 'hidden'));
onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow;
  if (proofPreviewUrl.value) URL.revokeObjectURL(proofPreviewUrl.value);
});
</script>

<template>
  <Teleport to="#overlay-root">
    <div class="backdrop" @click.self="emit('close')">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="failed-title">
        <span class="grabber" aria-hidden="true"></span>

        <header class="sheet-head">
          <div class="head-title">
            <span class="title-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M7 7l10 10M17 7 7 17" />
              </svg>
            </span>
            <h2 id="failed-title">Delivery Failed</h2>
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
            <span class="summary-price">{{ priceText }}</span>
          </div>
        </header>

        <div class="sheet-body">
          <section class="step">
            <p class="step-label">
              <span class="step-num" :class="{ done: reasonDone }">
                <svg v-if="reasonDone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <template v-else>1</template>
              </span>
              Why did it fail?
            </p>
            <div class="reason-grid" role="radiogroup" aria-label="Reason">
              <button
                v-for="option in REASONS"
                :key="option"
                type="button"
                role="radio"
                class="reason-card"
                :class="{ active: reason === option }"
                :aria-checked="reason === option"
                @click="reason = option"
              >
                <span class="reason-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <path :d="REASON_ICONS[option]" />
                  </svg>
                </span>
                <span class="reason-text">{{ option }}</span>
                <span class="reason-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              </button>
            </div>

            <div v-if="reason === 'Other'" class="other-wrap">
              <textarea
                v-model="otherReason"
                class="other-input"
                :class="{ invalid: otherTouched && otherError }"
                rows="2"
                :maxlength="OTHER_MAX"
                placeholder="Describe what happened…"
                :aria-invalid="otherTouched && !!otherError"
                @blur="otherTouched = true"
              ></textarea>
              <div class="other-meta">
                <span v-if="otherTouched && otherError" class="field-error">{{ otherError }}</span>
                <span class="counter" :class="{ near: otherReason.length > OTHER_MAX - 20 }">
                  {{ otherReason.length }}/{{ OTHER_MAX }}
                </span>
              </div>
            </div>
          </section>

          <section class="step">
            <p class="step-label">
              <span class="step-num" :class="{ done: !!proofFile }">
                <svg v-if="proofFile" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <template v-else>2</template>
              </span>
              Proof photo <span class="required">*</span>
            </p>

            <div v-if="proofPreviewUrl" class="photo-preview">
              <img :src="proofPreviewUrl" alt="Proof photo" />
              <div class="photo-actions">
                <button type="button" class="photo-action" @click="pickPhoto">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
                  </svg>
                  Retake
                </button>
                <button type="button" class="photo-action danger" @click="removePhoto">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7" />
                  </svg>
                  Remove
                </button>
              </div>
            </div>
            <button v-else type="button" class="capture-btn" @click="pickPhoto">
              <span class="capture-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
                </svg>
              </span>
              <span class="capture-text">
                <strong>Take proof photo</strong>
                <small>The parcel at the address, or the closed door</small>
              </span>
              <svg class="capture-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            <input ref="fileInput" type="file" accept="image/*" capture="environment" class="file-input" @change="onFileChange" />
          </section>

          <div v-if="error" class="error-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
            </svg>
            <div>
              <p>{{ error }}</p>
              <button v-if="!helpSent" type="button" class="help-link" :disabled="helpSending" @click="onSendHelp">
                {{ helpSending ? 'Sending…' : "Haven't reported it yet? Send a help request" }}
              </button>
            </div>
          </div>
          <p v-else-if="helpSent" class="info-box">Help request sent. Try again once the waiting time has passed.</p>
        </div>

        <footer class="sheet-foot">
          <div class="checklist" aria-live="polite">
            <span :class="{ ok: reasonDone }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path v-if="reasonDone" d="M5 12.5l4.5 4.5L19 7.5" /><circle v-else cx="12" cy="12" r="6" />
              </svg>
              Reason
            </span>
            <span :class="{ ok: !!proofFile }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path v-if="proofFile" d="M5 12.5l4.5 4.5L19 7.5" /><circle v-else cx="12" cy="12" r="6" />
              </svg>
              Photo
            </span>
          </div>
          <SwipeToConfirm :label="canSubmit ? 'Swipe to submit' : 'Complete both steps'" :disabled="!canSubmit" :loading="submitting" @confirm="onSubmit" />
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
/* Bottom sheet on phones; centred card on wider screens. Head and swipe footer
   stay fixed — only the body scrolls when the screen is short. */
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
  background: var(--red);
  color: #fff;
  box-shadow: 0 4px 10px rgba(224, 67, 59, 0.35);
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
  color: var(--ink);
  font: 800 0.95rem var(--sans);
}
.sheet-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 18px 8px;
  scrollbar-width: thin;
}
.step + .step {
  margin-top: 18px;
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
.step-num.done {
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
.reason-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.reason-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-height: 84px;
  padding: 12px;
  border: 1.5px solid var(--border);
  border-radius: 14px;
  background: #fff;
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
}
.reason-card:active {
  transform: scale(0.98);
}
.reason-card.active {
  border-color: var(--red);
  background: var(--red-tint);
  box-shadow: 0 0 0 3px rgba(224, 67, 59, 0.1);
}
.reason-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--fill);
  color: var(--text-3);
}
.reason-card.active .reason-icon {
  background: var(--red);
  color: #fff;
}
.reason-icon svg {
  width: 18px;
  height: 18px;
}
.reason-text {
  color: var(--text-2);
  font: 600 0.8rem/1.3 var(--sans);
}
.reason-card.active .reason-text {
  color: var(--red-deep);
}
.reason-check {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--red);
  color: #fff;
  opacity: 0;
  transform: scale(0.6);
  transition: all 0.15s ease;
}
.reason-card.active .reason-check {
  opacity: 1;
  transform: scale(1);
}
.reason-check svg {
  width: 11px;
  height: 11px;
}
.other-wrap {
  margin-top: 10px;
}
.other-input {
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid var(--border-strong);
  border-radius: 12px;
  background: #fff;
  color: var(--ink);
  font: 500 16px var(--sans); /* iOS Safari auto-zooms on focus if an input's font-size is under 16px */
  resize: none;
  outline: none;
}
.other-input:focus {
  border-color: var(--red);
  box-shadow: 0 0 0 3px rgba(224, 67, 59, 0.1);
}
.other-input.invalid {
  border-color: var(--red);
  background: var(--red-tint);
}
.other-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 4px 0;
}
.field-error {
  color: var(--red-strong);
  font: 600 0.76rem var(--sans);
}
.counter {
  margin-left: auto;
  color: var(--muted);
  font: 500 0.72rem var(--sans);
}
.counter.near {
  color: var(--orange-strong);
}
.capture-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px;
  border: 1.5px dashed #f0a8a3;
  border-radius: 16px;
  background: var(--red-tint);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.capture-btn:active {
  background: var(--red-soft);
}
.capture-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--red);
  color: #fff;
  box-shadow: 0 6px 14px rgba(224, 67, 59, 0.3);
}
.capture-icon svg {
  width: 24px;
  height: 24px;
}
.capture-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.capture-text strong {
  color: var(--red-deep);
  font: 700 0.92rem var(--sans);
}
.capture-text small {
  color: var(--muted);
  font: 500 0.75rem var(--sans);
}
.capture-chevron {
  width: 18px;
  height: 18px;
  color: var(--red);
}
.photo-preview {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  background: var(--ink-strong);
}
.photo-preview img {
  display: block;
  width: 100%;
  height: 200px;
  object-fit: contain;
}
.photo-actions {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  gap: 6px;
}
.photo-action {
  display: flex;
  align-items: center;
  gap: 5px;
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
.photo-action svg {
  width: 14px;
  height: 14px;
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
.help-link {
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--blue);
  font: 700 0.8rem var(--sans);
  text-decoration: underline;
  cursor: pointer;
}
.info-box {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--blue-soft);
  color: var(--blue-strong);
  font: 600 0.8rem var(--sans);
  text-align: center;
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
