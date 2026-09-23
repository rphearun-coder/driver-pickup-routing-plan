<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import DetailInfoCard from '../components/DetailInfoCard.vue';
import InfoRow from '../components/InfoRow.vue';
import PhotoUploadCard from '../components/PhotoUploadCard.vue';
import CollectPaymentSheet from '../components/CollectPaymentSheet.vue';
import ReportIssueSheet from '../components/ReportIssueSheet.vue';
import { confirmReturnParcel, confirmReturnParcelToWarehouse, parcelSellerName, resolveParcelImageUrl, uploadParcelProof } from '../api/parcels';
import { useOrderDetailStore } from '../stores/orderDetail';

const router = useRouter();
const store = useOrderDetailStore();
const parcel = computed(() => store.parcel);

// The COD-collection / report-issue flow below covers ON_DELIVERY, and its
// SUCCESS/FAILED outcomes, matching the reference "collection details" screen.
// Everything else (returns) keeps the original generic photo-confirm flow.
const CONFIRM_STATUSES = new Set(['ON_DELIVERY', 'SUCCESS', 'FAILED']);
const isCodStatus = computed(() => !!parcel.value && CONFIRM_STATUSES.has(parcel.value.status));

const proofFile = ref<File | null>(null);
const proofPreviewUrl = ref('');
const confirming = ref(false);
const confirmError = ref('');
const showCollectPayment = ref(false);
const showReportIssue = ref(false);

type ConfirmKind = 'return-to-shop' | 'return-to-warehouse';
const CONFIRM_ACTIONS: Partial<Record<string, { kind: ConfirmKind; label: string; hint: string }>> = {
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

function onProofFileChange(file: File): void {
  proofFile.value = file;
  if (proofPreviewUrl.value) URL.revokeObjectURL(proofPreviewUrl.value);
  proofPreviewUrl.value = URL.createObjectURL(file);
}

async function onConfirm(): Promise<void> {
  const item = parcel.value;
  const action = confirmAction.value;
  if (!item || !action || !proofFile.value) return;
  confirmError.value = '';
  confirming.value = true;
  try {
    const proofImage = await uploadParcelProof(proofFile.value);
    if (action.kind === 'return-to-shop') {
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

function onCollected(): void {
  showCollectPayment.value = false;
  router.back();
}

function onDeliveryFailed(): void {
  showReportIssue.value = false;
  router.back();
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

function formatReceiverBy(value?: string): string {
  return value === 'SELLER' ? 'Left with seller' : 'Driver';
}

const mapUrl = computed(() => {
  const item = parcel.value;
  if (!item || item.deliveryLatitude == null || item.deliveryLongitude == null) return '#';
  return `https://www.google.com/maps?q=${item.deliveryLatitude},${item.deliveryLongitude}`;
});

const imageUrl = computed(() => resolveParcelImageUrl(parcel.value?.parcelImage || parcel.value?.receiptImage));
const parcelPhotoUrl = computed(() => resolveParcelImageUrl(parcel.value?.parcelImage));
const successPhotoUrl = computed(() => resolveParcelImageUrl(parcel.value?.receiptImage || parcel.value?.proofImage));
const failedPhotoUrl = computed(() => resolveParcelImageUrl(parcel.value?.proofOfFailed));
</script>

<template>
  <div class="detail-page">
    <header class="page-header">
      <button type="button" class="back" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h1>{{ isCodStatus ? 'Collection Details' : 'Parcel Details' }}</h1>
    </header>

    <div v-if="!parcel" class="hint">
      <p>This parcel couldn't be found — it may have expired from the list you came from.</p>
      <button type="button" class="back-link" @click="router.back()">Go back</button>
    </div>

    <div v-else-if="isCodStatus" class="detail-body">
      <div class="cod-card">
        <div class="cod-row">
          <span>Seller</span>
          <strong>{{ parcelSellerName(parcel) || '—' }}</strong>
        </div>
        <div class="cod-row">
          <span>Price</span>
          <strong>{{ formatUSD(parcel.price) }}</strong>
        </div>
        <div class="cod-row">
          <span>Phone</span>
          <a v-if="parcel.recipientNumber" :href="`tel:${parcel.recipientNumber}`">{{ parcel.recipientNumber }}</a>
          <strong v-else>—</strong>
        </div>
        <div class="cod-row">
          <span>Recipient location</span>
          <strong>{{ parcel.location || '—' }}</strong>
        </div>
        <div v-if="parcel.status === 'SUCCESS'" class="cod-row">
          <span>Collected by</span>
          <strong>{{ formatReceiverBy(parcel.receiverBy) }}</strong>
        </div>
        <div v-if="parcel.status === 'SUCCESS'" class="cod-row">
          <span>Amount received</span>
          <strong class="amount">{{ formatUSD(parcel.totalCOD ?? parcel.codUsd) }}<template v-if="parcel.codRiel"> and {{ parcel.codRiel }}៛</template></strong>
        </div>
        <div v-if="parcel.status === 'FAILED' && parcel.reason" class="cod-row">
          <span>Reason</span>
          <strong>{{ parcel.reason }}</strong>
        </div>
        <div v-if="parcel.status !== 'ON_DELIVERY'" class="cod-row">
          <span>Status</span>
          <strong :style="{ color: statusColor }">{{ parcel.status }}</strong>
        </div>
      </div>

      <div v-if="parcel.status === 'ON_DELIVERY' && parcelPhotoUrl" class="reference-photo">
        <img :src="parcelPhotoUrl" alt="Parcel photo" />
      </div>
      <div v-if="parcel.status === 'SUCCESS' && successPhotoUrl" class="reference-photo">
        <p class="section-label">Proof photo</p>
        <img :src="successPhotoUrl" alt="Proof photo" />
      </div>
      <div v-if="parcel.status === 'FAILED' && failedPhotoUrl" class="reference-photo">
        <p class="section-label">Proof photo</p>
        <img :src="failedPhotoUrl" alt="Proof photo" />
      </div>

      <template v-if="parcel.status === 'ON_DELIVERY'">
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

        <button type="button" class="issue-banner" @click="showReportIssue = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <span>Package has an issue</span>
        </button>

        <div class="cod-actions">
          <button type="button" class="confirm-btn" @click="showCollectPayment = true">Collect Payment</button>
          <button type="button" class="confirm-btn danger-outline" @click="showReportIssue = true">Report Issue</button>
        </div>
      </template>
    </div>

    <div v-else class="detail-body">
      <DetailInfoCard
        :image-url="imageUrl"
        :name="parcel.recipientName || parcelSellerName(parcel) || parcel.location || 'Unknown'"
        :address="parcel.deliveryAddress || parcel.location || ''"
        :status="parcel.status"
        :status-color="statusColor"
      />

      <div class="info-list">
        <InfoRow label="Recipient" :value="parcel.recipientNumber" :href="parcel.recipientNumber ? `tel:${parcel.recipientNumber}` : undefined" />
        <InfoRow label="Order ID" :value="parcel.orderId" />
        <InfoRow label="Shop" :value="parcelSellerName(parcel)" />
        <InfoRow label="Delivery address" :value="parcel.deliveryAddress" />
        <InfoRow label="COD amount" :value="formatUSD(parcel.codUsd || parcel.price)" />
        <InfoRow label="Created" :value="formatDateTime(parcel.createdAt)" />
        <InfoRow label="Updated" :value="formatDateTime(parcel.updatedAt)" />
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
        <PhotoUploadCard :preview-url="proofPreviewUrl" @change="onProofFileChange" />

        <p v-if="confirmError" class="error-text">{{ confirmError }}</p>

        <button type="button" class="confirm-btn" :disabled="!canConfirm" @click="onConfirm">
          {{ confirming ? 'Confirming...' : confirmAction.label }}
        </button>
      </div>
    </div>

    <CollectPaymentSheet v-if="showCollectPayment && parcel" :parcel="parcel" @close="showCollectPayment = false" @confirmed="onCollected" />
    <ReportIssueSheet v-if="showReportIssue && parcel" :parcel="parcel" @close="showReportIssue = false" @failed="onDeliveryFailed" />
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
.cod-card {
  border-radius: 16px;
  border: 1px solid var(--line);
  overflow: hidden;
}
.cod-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  font: 600 0.85rem var(--sans);
  color: var(--muted);
}
.cod-row + .cod-row {
  border-top: 1px solid var(--line);
}
.cod-row strong,
.cod-row a {
  color: var(--ink);
  font: 700 0.9rem var(--sans);
  text-align: right;
  text-decoration: none;
}
.cod-row .amount {
  color: var(--green);
}
.info-list {
  border-radius: 16px;
  border: 1px solid var(--line);
  overflow: hidden;
}
.detail-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}
.issue-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 20px;
  padding: 12px;
  border: 1px dashed #e0433b;
  border-radius: 12px;
  background: #fdf1f0;
  color: #e0433b;
  font: 700 0.82rem var(--sans);
  cursor: pointer;
}
.issue-banner svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.cod-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
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
.confirm-btn.danger-outline {
  background: #fff;
  border: 1px solid #e0433b;
  color: #e0433b;
}
.confirm-btn:disabled {
  background: #a9d9c1;
  cursor: not-allowed;
}
</style>
