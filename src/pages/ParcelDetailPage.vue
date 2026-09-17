<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  confirmReturnParcel,
  confirmReturnParcelToWarehouse,
  finishParcelDelivery,
  resolveParcelImageUrl,
  uploadParcelProof,
} from '../api/parcels';
import { useOrderDetailStore } from '../stores/orderDetail';

const router = useRouter();
const store = useOrderDetailStore();
const parcel = computed(() => store.parcel);

const proofFile = ref<File | null>(null);
const proofPreviewUrl = ref('');
const confirming = ref(false);
const confirmError = ref('');

// Which "confirm" action (if any) applies depends on the parcel's current status —
// each maps to a different backend mutation (see api/parcels.ts).
type ConfirmKind = 'deliver' | 'return-to-shop' | 'return-to-warehouse';
const CONFIRM_ACTIONS: Partial<Record<string, { kind: ConfirmKind; label: string; hint: string }>> = {
  ON_DELIVERY: {
    kind: 'deliver',
    label: 'Handed Over to Customer',
    hint: 'Upload a photo as proof the customer received it.',
  },
  BE_RETURN: {
    kind: 'return-to-shop',
    label: 'Returned to Shop',
    hint: 'Upload a photo as proof it was handed back to the shop.',
  },
  RETURNING_FROM_DRIVER: {
    kind: 'return-to-warehouse',
    label: 'Dropped Off at Warehouse',
    hint: 'Upload a photo as proof it was dropped off at the warehouse.',
  },
  PROCESSING_RETURN: {
    kind: 'return-to-warehouse',
    label: 'Dropped Off at Warehouse',
    hint: 'Upload a photo as proof it was dropped off at the warehouse.',
  },
};

const confirmAction = computed(() => (parcel.value ? CONFIRM_ACTIONS[parcel.value.status] : undefined));
const canConfirm = computed(() => !!confirmAction.value && !!proofFile.value && !confirming.value);

function onProofFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0] ?? null;
  proofFile.value = picked;
  if (proofPreviewUrl.value) URL.revokeObjectURL(proofPreviewUrl.value);
  proofPreviewUrl.value = picked ? URL.createObjectURL(picked) : '';
}

async function onConfirm(): Promise<void> {
  const item = parcel.value;
  const action = confirmAction.value;
  if (!item || !action || !proofFile.value) return;
  confirmError.value = '';
  confirming.value = true;
  try {
    const proofImage = await uploadParcelProof(proofFile.value);
    if (action.kind === 'deliver') {
      await finishParcelDelivery(item.id, proofImage, item.codUsd || item.price);
    } else if (action.kind === 'return-to-shop') {
      await confirmReturnParcel(item.id, proofImage);
    } else {
      await confirmReturnParcelToWarehouse(item.id, proofImage);
    }
    router.back();
  } catch (err: any) {
    confirmError.value = err.message ?? 'Failed to confirm. Please try again.';
  } finally {
    confirming.value = false;
  }
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f4a340',
  IN_TRANSIT: '#f4a340',
  ON_DELIVERY: '#f4a340',
  PICKED_UP: '#21a366',
  IN_CENTRAL_WAREHOUSE: '#21a366',
  SUCCESS: '#21a366',
  FAILED: '#e0433b',
  DELETED: '#e0433b',
  RETURN: '#f2994a',
  BE_RETURN: '#f2994a',
  RETURNING_FROM_DRIVER: '#f2994a',
  PROCESSING_RETURN: '#f2994a',
};

const statusColor = computed(() => STATUS_COLORS[parcel.value?.status ?? ''] ?? '#6c756f');

function formatUSD(amount?: number): string {
  return `$${(amount ?? 0).toFixed(2)}`;
}

function formatDateTime(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

const mapUrl = computed(() => {
  const item = parcel.value;
  if (!item || item.deliveryLatitude == null || item.deliveryLongitude == null) return '#';
  return `https://www.google.com/maps?q=${item.deliveryLatitude},${item.deliveryLongitude}`;
});

const imageUrl = computed(() => resolveParcelImageUrl(parcel.value?.parcelImage || parcel.value?.receiptImage));
</script>

<template>
  <div class="detail-page">
    <header class="page-header">
      <button type="button" class="back" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h1>Parcel Details</h1>
    </header>

    <div v-if="!parcel" class="hint">
      <p>This parcel couldn't be found — it may have expired from the list you came from.</p>
      <button type="button" class="back-link" @click="router.back()">Go back</button>
    </div>

    <div v-else class="detail-body">
      <div class="shop-card">
        <div class="shop-thumb">
          <img v-if="imageUrl" :src="imageUrl" alt="" />
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="3" width="16" height="18" rx="2" /><rect x="7" y="6" width="6" height="6" rx="1" /><path d="M7 15h4M7 18h7" />
          </svg>
        </div>
        <div class="shop-info">
          <p class="shop-name">{{ parcel.recipientName || parcel.partnerStoreName || parcel.location || 'Unknown' }}</p>
          <p class="shop-address">{{ parcel.deliveryAddress || parcel.location || '—' }}</p>
        </div>
        <span class="status-badge" :style="{ background: statusColor }">{{ parcel.status }}</span>
      </div>

      <div class="info-list">
        <div class="info-row">
          <span>Recipient</span>
          <a v-if="parcel.recipientNumber" :href="`tel:${parcel.recipientNumber}`">{{ parcel.recipientNumber }}</a>
          <strong v-else>—</strong>
        </div>
        <div class="info-row">
          <span>Order ID</span>
          <strong>{{ parcel.orderId }}</strong>
        </div>
        <div class="info-row">
          <span>Shop</span>
          <strong>{{ parcel.partnerStoreName || '—' }}</strong>
        </div>
        <div class="info-row">
          <span>Delivery address</span>
          <strong>{{ parcel.deliveryAddress || '—' }}</strong>
        </div>
        <div class="info-row">
          <span>COD amount</span>
          <strong>{{ formatUSD(parcel.codUsd || parcel.price) }}</strong>
        </div>
        <div class="info-row">
          <span>Created</span>
          <strong>{{ formatDateTime(parcel.createdAt) }}</strong>
        </div>
        <div class="info-row">
          <span>Updated</span>
          <strong>{{ formatDateTime(parcel.updatedAt) }}</strong>
        </div>
      </div>

      <div class="detail-actions">
        <a class="action-btn" :href="mapUrl" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" />
          </svg>
          <span>Open in Maps</span>
        </a>
        <a v-if="parcel.recipientNumber" class="action-btn call" :href="`tel:${parcel.recipientNumber}`">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
          </svg>
          <span>Call</span>
        </a>
      </div>

      <div v-if="imageUrl" class="reference-photo">
        <p class="section-label">Parcel photo</p>
        <img :src="imageUrl" alt="Parcel photo" />
      </div>

      <div v-if="confirmAction" class="confirm-section">
        <p class="section-label">{{ confirmAction.hint }}</p>
        <label class="upload-box">
          <input type="file" accept="image/*" capture="environment" hidden @change="onProofFileChange" />
          <img v-if="proofPreviewUrl" :src="proofPreviewUrl" alt="Proof preview" class="preview-img" />
          <template v-else>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 16V4M12 4l-4 4M12 4l4 4" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
            <span>Upload photo</span>
          </template>
        </label>

        <p v-if="confirmError" class="error-text">{{ confirmError }}</p>

        <button type="button" class="confirm-btn" :disabled="!canConfirm" @click="onConfirm">
          {{ confirming ? 'Confirming...' : confirmAction.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  padding-bottom: 40px;
}
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid var(--line);
}
.back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--wash);
  color: var(--ink);
  cursor: pointer;
}
.back svg {
  width: 18px;
  height: 18px;
}
.page-header h1 {
  margin: 0;
  font: 700 1.15rem var(--heading);
  color: var(--ink);
}
.hint {
  padding: 60px 24px;
  text-align: center;
  color: var(--muted);
}
.back-link {
  margin-top: 12px;
  padding: 10px 20px;
  border: none;
  border-radius: 999px;
  background: var(--wash);
  color: var(--ink);
  font: 700 0.85rem var(--sans);
  cursor: pointer;
}
.detail-body {
  padding: 32px 16px 40px;
}
.shop-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  background: var(--wash);
  margin-bottom: 16px;
}
.shop-thumb {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: var(--muted);
}
.shop-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.shop-thumb svg {
  width: 26px;
  height: 26px;
}
.shop-info {
  flex: 1;
  min-width: 0;
}
.shop-name {
  margin: 0 0 2px;
  font: 700 0.95rem var(--sans);
  color: var(--ink);
}
.shop-address {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-badge {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  color: #fff;
  font: 700 0.65rem var(--sans);
  letter-spacing: 0.02em;
}
.info-list {
  border-radius: 16px;
  border: 1px solid var(--line);
  overflow: hidden;
}
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  font-size: 0.85rem;
}
.info-row + .info-row {
  border-top: 1px solid var(--line);
}
.info-row span {
  color: var(--muted);
}
.info-row strong,
.info-row a {
  color: var(--ink);
  font-weight: 700;
  text-align: right;
}
.info-row a {
  color: var(--green);
  text-decoration: none;
}
.detail-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}
.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 0.85rem var(--sans);
  text-decoration: none;
}
.action-btn.call {
  background: var(--orange);
}
.action-btn svg {
  width: 18px;
  height: 18px;
}
.section-label {
  margin: 0 0 8px;
  color: var(--muted);
  font: 700 0.72rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.reference-photo {
  margin-top: 20px;
}
.reference-photo img {
  width: 100%;
  max-height: 220px;
  border-radius: 16px;
  object-fit: cover;
  border: 1px solid var(--line);
}
.confirm-section {
  margin-top: 20px;
}
.upload-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 140px;
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
  max-height: 180px;
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
  margin-top: 16px;
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
