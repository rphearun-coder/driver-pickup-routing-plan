<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import PhotoUploadCard from './PhotoUploadCard.vue';
import { finishParcelDelivery, uploadParcelProof, type Parcel, type ReceiverBy } from '../api/parcels';

const props = defineProps<{ parcel: Parcel }>();
const emit = defineEmits<{ close: []; confirmed: [] }>();

const receiverBy = ref<ReceiverBy>('DRIVER');
const amountUSD = ref((props.parcel.codUsd || props.parcel.price || 0).toFixed(2));
const amountKHR = ref('0');
const receiptFile = ref<File | null>(null);
const receiptPreviewUrl = ref('');
const confirming = ref(false);
const error = ref('');

// Backend requires a receiptImage when the seller (not the driver) collects the
// COD — see parcel.service.ts finishDelivery.
const receiptRequired = computed(() => receiverBy.value === 'SELLER');
const canConfirm = computed(() => !confirming.value && (!receiptRequired.value || !!receiptFile.value));

function onReceiptFileChange(file: File): void {
  receiptFile.value = file;
  if (receiptPreviewUrl.value) URL.revokeObjectURL(receiptPreviewUrl.value);
  receiptPreviewUrl.value = URL.createObjectURL(file);
}

async function onConfirm(): Promise<void> {
  if (!canConfirm.value) return;
  error.value = '';
  confirming.value = true;
  try {
    const receiptImage = receiptFile.value ? await uploadParcelProof(receiptFile.value) : undefined;
    await finishParcelDelivery({
      id: props.parcel.id,
      receiverBy: receiverBy.value,
      proofImage: receiptImage,
      receiptImage,
      amountUSD: Number(amountUSD.value) || 0,
      amountKHR: Number(amountKHR.value) || 0,
    });
    emit('confirmed');
  } catch (err: any) {
    error.value = err.message ?? 'Failed to confirm collection.';
  } finally {
    confirming.value = false;
  }
}

const previousBodyOverflow = document.body.style.overflow;
onMounted(() => (document.body.style.overflow = 'hidden'));
onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow;
  if (receiptPreviewUrl.value) URL.revokeObjectURL(receiptPreviewUrl.value);
});
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <div class="sheet">
      <span class="drag-handle"></span>
      <h2 class="sheet-title">Collect Payment</h2>

      <label class="field-label">Collected by</label>
      <div class="radio-row">
        <button type="button" class="radio-option" :class="{ active: receiverBy === 'DRIVER' }" @click="receiverBy = 'DRIVER'">
          Driver
        </button>
        <button type="button" class="radio-option" :class="{ active: receiverBy === 'SELLER' }" @click="receiverBy = 'SELLER'">
          Left with seller
        </button>
      </div>

      <label class="field-label" for="collect-amount-usd">Amount (USD)</label>
      <input id="collect-amount-usd" v-model="amountUSD" type="number" step="0.01" min="0" class="text-input" />

      <label class="field-label" for="collect-amount-khr">Amount (KHR)</label>
      <input id="collect-amount-khr" v-model="amountKHR" type="number" step="100" min="0" class="text-input" />

      <template v-if="receiptRequired">
        <label class="field-label">Receipt photo</label>
        <PhotoUploadCard :preview-url="receiptPreviewUrl" label="Upload receipt" @change="onReceiptFileChange" />
      </template>

      <p v-if="error" class="error-text">{{ error }}</p>

      <button type="button" class="confirm-btn" :disabled="!canConfirm" @click="onConfirm">
        {{ confirming ? 'Confirming...' : 'Confirm Collection' }}
      </button>
    </div>
  </div>
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
  max-height: 90vh;
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
  margin: 0 0 16px;
  font: 700 1.05rem var(--heading);
  color: var(--ink);
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
.radio-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.radio-option {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  color: var(--ink);
  font: 600 0.85rem var(--sans);
  cursor: pointer;
}
.radio-option.active {
  border-color: var(--green);
  background: var(--green);
  color: #fff;
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
  color: #e33;
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
.confirm-btn:disabled {
  background: #a9d9c1;
  cursor: not-allowed;
}
</style>
