<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { submitCodSettlement, uploadSettlementProof, type DailyCodSettlement } from '../api/cod-settlement';

const props = defineProps<{ settlement: DailyCodSettlement }>();
const emit = defineEmits<{ close: []; submitted: [] }>();

const file = ref<File | null>(null);
const previewUrl = ref('');
const submitting = ref(false);
const error = ref('');

const codText = computed(
  () => `$${(props.settlement.totalCodUsd ?? 0).toFixed(2)} and ${Math.round(props.settlement.totalCodKhr ?? 0)}៛`,
);
const paywayText = computed(() => `$${(props.settlement.requestedAmount ?? 0).toFixed(2)}`);
const transferText = computed(
  () => `$${(props.settlement.settledAmount ?? props.settlement.totalCodUsd ?? 0).toFixed(2)}`,
);
const canSubmit = computed(() => !!file.value && !submitting.value);

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0] ?? null;
  file.value = picked;
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = picked ? URL.createObjectURL(picked) : '';
}

async function onSubmit() {
  if (!file.value || !props.settlement.id) return;
  error.value = '';
  submitting.value = true;
  try {
    const proofImage = await uploadSettlementProof(file.value);
    await submitCodSettlement({ id: props.settlement.id, proofImage });
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
});

onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow;
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <div class="sheet">
      <span class="drag-handle"></span>
      <h2 class="sheet-title">Request Settlement</h2>

      <div class="totals-card">
        <div class="totals-row">
          <span>COD to transfer</span>
          <strong>{{ codText }}</strong>
        </div>
        <div class="totals-row muted">
          <span>PayWay total</span>
          <strong>{{ paywayText }}</strong>
        </div>
        <div class="totals-divider"></div>
        <div class="totals-row total">
          <span>Money to transfer</span>
          <strong>{{ transferText }}</strong>
        </div>
      </div>

      <div class="upload-section">
        <h3>Transaction screenshot</h3>
        <p>Upload a screenshot of the bank transfer</p>

        <label class="upload-box">
          <input type="file" accept="image/*" hidden @change="onFileChange" />
          <img v-if="previewUrl" :src="previewUrl" alt="Proof preview" class="preview-img" />
          <template v-else>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 16V4M12 4l-4 4M12 4l4 4" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
            <span>Upload screenshot</span>
          </template>
        </label>
      </div>

      <p v-if="error" class="error-text">{{ error }}</p>

      <button type="button" class="confirm-btn" :disabled="!canSubmit" @click="onSubmit">
        {{ submitting ? 'Submitting...' : 'Confirm Request' }}
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
.totals-card {
  padding: 16px;
  border-radius: 16px;
  background: var(--wash);
}
.totals-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  color: var(--ink);
  font: 500 0.85rem var(--sans);
}
.totals-row.muted {
  color: var(--muted);
}
.totals-row.total strong {
  color: var(--green);
  font: 700 1.1rem var(--heading);
}
.totals-divider {
  height: 1px;
  margin: 8px 0;
  background: var(--line);
}
.upload-section {
  margin-top: 20px;
}
.upload-section h3 {
  margin: 0 0 4px;
  font: 700 0.9rem var(--heading);
  color: var(--ink);
}
.upload-section p {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 0.8rem;
}
.upload-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 120px;
  padding: 20px;
  border: 1px dashed var(--line);
  border-radius: 16px;
  color: var(--muted);
  font: 500 0.82rem var(--sans);
  cursor: pointer;
  overflow: hidden;
}
.upload-box svg {
  width: 26px;
  height: 26px;
}
.preview-img {
  max-width: 100%;
  max-height: 160px;
  border-radius: 10px;
  object-fit: contain;
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
