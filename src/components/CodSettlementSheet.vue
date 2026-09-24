<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import SwipeToConfirm from './SwipeToConfirm.vue';
import ImageLightbox from './ImageLightbox.vue';
import {
  getCodPaymentAccount,
  submitCodSettlement,
  uploadSettlementProof,
  type CodPaymentAccount,
  type DailyCodSettlement,
} from '../api/cod-settlement';
import { resolveParcelImageUrl } from '../api/parcels';

const props = defineProps<{ settlement: DailyCodSettlement }>();
const emit = defineEmits<{ close: []; submitted: [] }>();

const NOTE_MAX = 200;
const MAX_FILE_MB = 10;

const file = ref<File | null>(null);
const previewUrl = ref('');
const fileError = ref('');
const note = ref('');
const submitting = ref(false);
const error = ref('');
const copied = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

function usd(amount?: number): string {
  return `$${(amount ?? 0).toFixed(2)}`;
}

const codKhr = computed(() => Math.round(props.settlement.totalCodKhr ?? 0));
const transferAmount = computed(() => props.settlement.settledAmount ?? props.settlement.totalCodUsd ?? 0);
const canSubmit = computed(() => !!file.value && !submitting.value && !!props.settlement.id);

// ---- digital payment: the Jalat COD account (ABA PayWay link, KHQR, account no.) ----
const account = ref<CodPaymentAccount | null>(null);
const accountLoading = ref(true);
const qrOpen = ref(false);
const accountCopied = ref(false);
let accountCopiedTimer: ReturnType<typeof setTimeout> | undefined;

// Hidden if the image fails to load (e.g. UAT has no QR saved and the server falls back
// to a default key that isn't in the bucket) — PayWay and the account number still work.
const qrFailed = ref(false);
const qrUrl = computed(() => (qrFailed.value ? '' : resolveParcelImageUrl(account.value?.qrCode)));
const payWayUrl = computed(() => {
  const url = account.value?.payWayUrl ?? '';
  return /^https:\/\//.test(url) ? url : '';
});
const hasDigital = computed(() => !!(payWayUrl.value || qrUrl.value || account.value?.accountNumber));

async function loadAccount(): Promise<void> {
  accountLoading.value = true;
  try {
    account.value = await getCodPaymentAccount();
  } catch {
    account.value = null; // falls back to the plain "transfer from your banking app" text
  } finally {
    accountLoading.value = false;
  }
}

async function copyAccount(): Promise<void> {
  const number = account.value?.accountNumber;
  if (!number) return;
  try {
    await navigator.clipboard.writeText(number.replace(/\s+/g, ''));
    accountCopied.value = true;
    clearTimeout(accountCopiedTimer);
    accountCopiedTimer = setTimeout(() => (accountCopied.value = false), 1800);
  } catch {
    // Clipboard blocked — the number is still on screen.
  }
}

// Leaves a hint for the COD team about how it was paid, unless the driver wrote a note.
function onPayWayOpened(): void {
  if (!note.value.trim()) note.value = 'Paid via ABA PayWay';
}

function pickFile(): void {
  fileInput.value?.click();
}

// Screenshots come from the gallery (no `capture`), so check type and size here.
function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0] ?? null;
  input.value = '';
  if (!picked) return;
  if (!picked.type.startsWith('image/')) {
    fileError.value = 'Choose an image (a screenshot or photo of the transfer).';
    return;
  }
  if (picked.size > MAX_FILE_MB * 1024 * 1024) {
    fileError.value = `That image is too large — pick one under ${MAX_FILE_MB} MB.`;
    return;
  }
  fileError.value = '';
  error.value = '';
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  file.value = picked;
  previewUrl.value = URL.createObjectURL(picked);
}

function removeFile(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
  file.value = null;
}

async function copyAmount(): Promise<void> {
  try {
    await navigator.clipboard.writeText(transferAmount.value.toFixed(2));
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = false), 1800);
  } catch {
    // Clipboard blocked (non-HTTPS or permission) — the amount is still on screen.
  }
}

async function onSubmit(): Promise<void> {
  if (!file.value || !props.settlement.id) return;
  error.value = '';
  submitting.value = true;
  try {
    const proofImage = await uploadSettlementProof(file.value);
    const driverNote = note.value.replace(/\s+/g, ' ').trim() || undefined;
    await submitCodSettlement({ id: props.settlement.id, proofImage, driverNote });
    emit('submitted');
  } catch (err: any) {
    error.value = err.message ?? 'Failed to submit the settlement request.';
  } finally {
    submitting.value = false;
  }
}

const previousBodyOverflow = document.body.style.overflow;
onMounted(() => {
  document.body.style.overflow = 'hidden';
  loadAccount();
});
onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow;
  clearTimeout(copiedTimer);
  clearTimeout(accountCopiedTimer);
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});
</script>

<template>
  <Teleport to="#overlay-root">
    <div class="backdrop" @click.self="emit('close')">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="settlement-title">
        <span class="grabber" aria-hidden="true"></span>

        <header class="sheet-head">
          <div class="head-title">
            <span class="title-icon" aria-hidden="true">$</span>
            <h2 id="settlement-title">Request Settlement</h2>
            <button type="button" class="close-btn" aria-label="Close" @click="emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div class="amount-card">
            <div class="amount-top">
              <span class="amount-label">Money to transfer</span>
              <button type="button" class="copy-btn" :class="{ done: copied }" @click="copyAmount">
                <svg v-if="copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
                </svg>
                {{ copied ? 'Copied' : 'Copy' }}
              </button>
            </div>
            <strong class="amount-value">{{ usd(transferAmount) }}</strong>
            <div class="amount-breakdown">
              <span>COD <b>{{ usd(settlement.totalCodUsd) }}</b><template v-if="codKhr"> + <b>{{ codKhr.toLocaleString() }}៛</b></template></span>
              <span>PayWay <b>{{ usd(settlement.requestedAmount) }}</b></span>
            </div>
          </div>
        </header>

        <div class="sheet-body">
          <section class="step">
            <p class="step-label"><span class="step-num done">1</span> Pay {{ usd(transferAmount) }} digitally</p>

            <div v-if="accountLoading" class="pay-skeleton" aria-hidden="true"></div>

            <template v-else-if="hasDigital">
              <a
                v-if="payWayUrl"
                :href="payWayUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="payway-btn"
                @click="onPayWayOpened"
              >
                <span class="payway-logo" aria-hidden="true">ABA</span>
                <span class="payway-text">
                  <strong>Pay with ABA PayWay</strong>
                  <small>Opens ABA · enter {{ usd(transferAmount) }}</small>
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
                </svg>
              </a>

              <div class="pay-account">
                <button v-if="qrUrl" type="button" class="qr-thumb" aria-label="Enlarge the KHQR code" @click="qrOpen = true">
                  <img :src="qrUrl" alt="" @error="qrFailed = true" />
                  <span>Tap to enlarge</span>
                </button>
                <div class="account-info">
                  <span class="account-hint">{{ qrUrl ? 'Or scan the KHQR with any bank app' : 'Or transfer from any bank app' }}</span>
                  <strong v-if="account?.accountName" class="account-name">{{ account.accountName }}</strong>
                  <button v-if="account?.accountNumber" type="button" class="account-number" :class="{ done: accountCopied }" @click="copyAccount">
                    {{ account.accountNumber }}
                    <span>{{ accountCopied ? 'Copied' : 'Copy' }}</span>
                  </button>
                </div>
              </div>

              <p class="step-text">After paying, take a screenshot of the confirmation.</p>
            </template>

            <p v-else class="step-text">
              Send <b>{{ usd(transferAmount) }}</b> to the Jalat COD account from your banking app, then take a screenshot of the
              confirmation.
            </p>
          </section>

          <section class="step">
            <p class="step-label">
              <span class="step-num" :class="{ done: !!file }">
                <svg v-if="file" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <template v-else>2</template>
              </span>
              Transfer screenshot <span class="required">*</span>
            </p>

            <div v-if="previewUrl" class="preview">
              <img :src="previewUrl" alt="Transfer screenshot" />
              <div class="preview-actions">
                <button type="button" class="preview-action" @click="pickFile">Change</button>
                <button type="button" class="preview-action danger" @click="removeFile">Remove</button>
              </div>
            </div>
            <button v-else type="button" class="upload-btn" @click="pickFile">
              <span class="upload-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 16V4M12 4l-4 4M12 4l4 4" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                </svg>
              </span>
              <span class="upload-text">
                <strong>Upload screenshot</strong>
                <small>From your gallery · image up to {{ MAX_FILE_MB }} MB</small>
              </span>
            </button>
            <input ref="fileInput" type="file" accept="image/*" class="file-input" @change="onFileChange" />
            <p v-if="fileError" class="field-error">{{ fileError }}</p>
          </section>

          <section class="step">
            <p class="step-label">
              <span class="step-num">3</span> Note for the COD team <span class="optional">(optional)</span>
            </p>
            <textarea
              v-model="note"
              class="note-input"
              rows="2"
              :maxlength="NOTE_MAX"
              placeholder="e.g. Sent from ABA, ref 123456"
            ></textarea>
            <span class="counter" :class="{ near: note.length > NOTE_MAX - 20 }">{{ note.length }}/{{ NOTE_MAX }}</span>
          </section>

          <div v-if="error" class="error-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
            </svg>
            <p>{{ error }}</p>
          </div>
        </div>

        <footer class="sheet-foot">
          <div class="checklist" aria-live="polite">
            <span :class="{ ok: !!file }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path v-if="file" d="M5 12.5l4.5 4.5L19 7.5" /><circle v-else cx="12" cy="12" r="6" />
              </svg>
              Screenshot
            </span>
          </div>
          <SwipeToConfirm
            :label="canSubmit ? 'Swipe to request' : 'Upload the screenshot'"
            color="var(--green)"
            :disabled="!canSubmit"
            :loading="submitting"
            @confirm="onSubmit"
          />
        </footer>
      </div>

      <ImageLightbox
        v-if="qrOpen && qrUrl"
        :src="qrUrl"
        alt="Jalat COD KHQR code"
        :caption="`${account?.accountName ?? 'Jalat COD'} · scan with any bank app · tap to close`"
        @close="qrOpen = false"
      />
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
/* Same shell as the Deliver / Failed sheets. */
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
  font: 800 0.95rem var(--sans);
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
.amount-card {
  margin-top: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--green-tint);
  border: 1px solid var(--green-border);
}
.amount-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.amount-label {
  color: var(--green-strong);
  font: 700 0.72rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.copy-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: none;
  border-radius: 999px;
  background: #fff;
  color: var(--green-strong);
  font: 700 0.72rem var(--sans);
  cursor: pointer;
}
.copy-btn svg {
  width: 13px;
  height: 13px;
}
.copy-btn.done {
  background: var(--green);
  color: #fff;
}
.amount-value {
  display: block;
  margin-top: 2px;
  color: var(--green-strong);
  font: 800 2rem var(--sans);
  line-height: 1.15;
}
.amount-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 6px;
  color: var(--text-3);
  font: 500 0.76rem var(--sans);
}
.amount-breakdown b {
  color: var(--ink);
  font-weight: 700;
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
  margin: 0 0 8px;
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
.step-text {
  margin: 0 0 0 30px;
  color: var(--muted);
  font: 500 0.8rem/1.45 var(--sans);
}
.step-text b {
  color: var(--ink);
}
.pay-skeleton {
  height: 120px;
  margin: 0 0 0 30px;
  border-radius: 14px;
  background: linear-gradient(90deg, var(--track) 25%, var(--page) 50%, var(--track) 75%);
  background-size: 200% 100%;
  animation: pay-shimmer 1.2s infinite;
}
@keyframes pay-shimmer {
  to {
    background-position: -200% 0;
  }
}
.payway-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 10px 30px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #005d7d; /* ABA brand teal */
  color: #fff;
  text-decoration: none;
  box-shadow: 0 6px 16px rgba(0, 93, 125, 0.25);
}
.payway-btn:active {
  transform: scale(0.99);
}
.payway-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #fff;
  color: #005d7d;
  font: 900 0.8rem var(--sans);
  letter-spacing: 0.02em;
}
.payway-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.payway-text strong {
  font: 700 0.9rem var(--sans);
}
.payway-text small {
  opacity: 0.85;
  font: 500 0.72rem var(--sans);
}
.payway-btn > svg {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}
.pay-account {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 10px 30px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: #fff;
}
.qr-thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--blue);
  font: 600 0.62rem var(--sans);
  cursor: zoom-in;
}
.qr-thumb img {
  width: 84px;
  height: 84px;
  border: 1px solid var(--border);
  border-radius: 10px;
  object-fit: contain;
  background: #fff;
}
.account-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.account-hint {
  color: var(--muted);
  font: 500 0.72rem var(--sans);
}
.account-name {
  overflow: hidden;
  color: var(--ink);
  font: 700 0.84rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-number {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 6px 6px 10px;
  border: 1px dashed var(--border-dashed);
  border-radius: 10px;
  background: var(--wash);
  color: var(--ink);
  font: 700 0.9rem ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.04em;
  cursor: pointer;
}
.account-number span {
  padding: 2px 8px;
  border-radius: 999px;
  background: #fff;
  color: var(--blue);
  font: 700 0.66rem var(--sans);
  letter-spacing: 0;
}
.account-number.done span {
  color: var(--green-strong);
}
.required {
  color: var(--red);
}
.optional {
  color: var(--muted);
  font-weight: 400;
}
.upload-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px;
  border: 1.5px dashed var(--green-border);
  border-radius: 16px;
  background: var(--green-tint);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.upload-btn:active {
  background: var(--green-soft);
}
.upload-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
}
.upload-icon svg {
  width: 22px;
  height: 22px;
}
.upload-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.upload-text strong {
  color: var(--green-strong);
  font: 700 0.9rem var(--sans);
}
.upload-text small {
  color: var(--muted);
  font: 500 0.74rem var(--sans);
}
.preview {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  background: var(--ink-strong);
}
.preview img {
  display: block;
  width: 100%;
  height: 220px;
  object-fit: contain;
}
.preview-actions {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  gap: 6px;
}
.preview-action {
  padding: 7px 12px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--ink-strong);
  font: 700 0.76rem var(--sans);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}
.preview-action.danger {
  color: var(--red-strong);
}
.file-input {
  display: none;
}
.field-error {
  margin: 8px 4px 0;
  color: var(--red-strong);
  font: 600 0.76rem var(--sans);
}
.note-input {
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
.note-input:focus {
  border-color: var(--green);
}
.counter {
  display: block;
  margin: 4px 4px 0;
  color: var(--muted);
  font: 500 0.72rem var(--sans);
  text-align: right;
}
.counter.near {
  color: var(--orange-strong);
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
