<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import PhotoUploadCard from './PhotoUploadCard.vue';
import { markDeliveryFailed, sendDeliveryAssistantMessage, uploadParcelProof, type Parcel } from '../api/parcels';

const props = defineProps<{ parcel: Parcel }>();
const emit = defineEmits<{ close: []; failed: [] }>();

const REASONS = [
  'Customer not answering phone',
  "Wrong address / can't locate",
  'Customer requested reschedule',
  'Customer refused the parcel',
  'Other',
];

// deliveryFailed (Jalat-Order-Service parcel.service.ts) requires a same-day help
// request to exist for this parcel first, and won't allow marking it failed until
// a configured cooldown after that request has passed — so this is a real two-step
// gate, not just UI framing. 'help' sends that request; 'fail' is unlocked after.
type Step = 'help' | 'requested' | 'fail';
const step = ref<Step>('help');
const reason = ref(REASONS[0]);
const proofFile = ref<File | null>(null);
const proofPreviewUrl = ref('');
const submitting = ref(false);
const error = ref('');

function onProofFileChange(file: File): void {
  proofFile.value = file;
  if (proofPreviewUrl.value) URL.revokeObjectURL(proofPreviewUrl.value);
  proofPreviewUrl.value = URL.createObjectURL(file);
}

async function onRequestHelp(): Promise<void> {
  error.value = '';
  submitting.value = true;
  try {
    await sendDeliveryAssistantMessage(props.parcel.id, reason.value);
    step.value = 'requested';
  } catch (err: any) {
    error.value = err.message ?? 'Failed to send the help request.';
  } finally {
    submitting.value = false;
  }
}

async function onMarkFailed(): Promise<void> {
  error.value = '';
  submitting.value = true;
  try {
    const proofOfFailed = proofFile.value ? await uploadParcelProof(proofFile.value) : undefined;
    await markDeliveryFailed(props.parcel.id, reason.value, proofOfFailed);
    emit('failed');
  } catch (err: any) {
    // The backend's own message already explains a still-active cooldown (e.g.
    // "you must wait N minutes") — surfaced as-is rather than re-worded.
    error.value = err.message ?? 'Failed to mark as failed.';
  } finally {
    submitting.value = false;
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
    <div class="sheet-backdrop" @click.self="emit('close')">
      <div class="sheet">
        <span class="drag-handle"></span>

        <template v-if="step === 'help'">
          <h2 class="sheet-title">Report an Issue</h2>
          <p class="hint">Request help before you can mark this delivery as failed.</p>

          <label class="field-label" for="issue-reason">Reason</label>
          <select id="issue-reason" v-model="reason" class="text-input">
            <option v-for="option in REASONS" :key="option" :value="option">{{ option }}</option>
          </select>

          <p v-if="error" class="error-text">{{ error }}</p>

          <button type="button" class="confirm-btn" :disabled="submitting" @click="onRequestHelp">
            {{ submitting ? 'Sending...' : 'Request Help' }}
          </button>
        </template>

        <template v-else-if="step === 'requested'">
          <h2 class="sheet-title">Help Requested</h2>
          <p class="hint">Our team has been notified. Once enough time has passed, you can mark this delivery as failed below.</p>

          <p v-if="error" class="error-text">{{ error }}</p>

          <button type="button" class="confirm-btn" :disabled="submitting" @click="step = 'fail'">Continue</button>
        </template>

        <template v-else>
          <h2 class="sheet-title">Mark Delivery as Failed</h2>

          <label class="field-label" for="issue-reason-2">Reason</label>
          <select id="issue-reason-2" v-model="reason" class="text-input">
            <option v-for="option in REASONS" :key="option" :value="option">{{ option }}</option>
          </select>

          <label class="field-label">Proof photo (optional)</label>
          <PhotoUploadCard :preview-url="proofPreviewUrl" label="Upload photo" @change="onProofFileChange" />

          <p v-if="error" class="error-text">{{ error }}</p>

          <button type="button" class="confirm-btn danger" :disabled="submitting" @click="onMarkFailed">
            {{ submitting ? 'Submitting...' : 'Mark as Failed' }}
          </button>
        </template>
      </div>
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
  background: rgba(0, 0, 0, 0.5);
  overscroll-behavior: contain;
}
.sheet {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: 90%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 20px 24px;
  border-radius: 24px 24px 0 0;
  background: #fff;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2);
}
.drag-handle {
  display: block;
  width: 40px;
  height: 4px;
  margin: 0 auto 16px;
  border-radius: 999px;
  background: var(--line);
}
.sheet-title {
  margin: 0 0 8px;
  font: 700 1.05rem var(--heading);
  color: var(--ink);
  text-align: center;
}
.hint {
  margin: 0 0 16px;
  color: var(--muted);
  font: 500 0.85rem var(--sans);
  text-align: center;
}
.field-label {
  display: block;
  margin: 0 2px 6px;
  color: var(--muted);
  font: 700 0.72rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.text-input {
  display: block;
  width: 100%;
  padding: 14px 16px;
  margin-bottom: 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  color: var(--ink);
  font: 500 16px var(--sans); /* iOS Safari auto-zooms on focus if an input's font-size is under 16px */
}
.error-text {
  margin-top: 12px;
  color: var(--red);
  font-size: 0.8rem;
  text-align: center;
}
.confirm-btn {
  width: 100%;
  margin-top: 20px;
  padding: 15px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 0.95rem var(--sans);
  cursor: pointer;
}
.confirm-btn.danger {
  background: var(--red);
}
.confirm-btn:disabled {
  background: #a9d9c1;
  cursor: not-allowed;
}
</style>
