<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import DetailInfoCard from '../components/DetailInfoCard.vue';
import InfoRow from '../components/InfoRow.vue';
import ParcelsListSection from '../components/ParcelsListSection.vue';
import PhotoUploadCard from '../components/PhotoUploadCard.vue';
import { confirmPickup, uploadPickupProof } from '../api/pickup-orders';
import { resolveParcelImageUrl } from '../api/parcels';
import { useOrderDetailStore } from '../stores/orderDetail';

const router = useRouter();
const store = useOrderDetailStore();
const order = computed(() => store.order);

const previewUrl = ref('');
const selectedFile = ref<File | null>(null);
const submitting = ref(false);
const error = ref('');

const shopName = computed(() => order.value?.partner?.fullName || order.value?.partner?.shop?.shopName || 'Unknown');
const shopAddress = computed(() => order.value?.partner?.shop?.address || order.value?.pickupAddress || '');
const shopImageUrl = computed(() => resolveParcelImageUrl(order.value?.partner?.shop?.shopImage));

const parcelRows = computed(() =>
  (order.value?.parcels ?? []).map((parcel, index) => ({
    id: parcel.id,
    label: parcel.parcelUID || `Parcel ${index + 1}`,
    status: parcel.status,
  })),
);

function onPhotoChange(file: File): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  selectedFile.value = file;
  previewUrl.value = URL.createObjectURL(file);
}

onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});

// confirmPickup's shopInfo.shopImage is accepted and uploaded, but the backend
// currently no-ops it (Jalat-Order-Service/order.service.ts#confirmPickup has
// the write behind a "disabled and to be discussed" TODO) — the pickup itself
// still gets confirmed correctly, the photo just isn't persisted anywhere yet.
async function onConfirmPickup(): Promise<void> {
  if (!order.value) return;
  error.value = '';
  submitting.value = true;
  try {
    const shopImage = selectedFile.value ? await uploadPickupProof(selectedFile.value) : undefined;
    await confirmPickup(order.value.id, shopImage ? { shopImage } : undefined);
    router.back();
  } catch (err: any) {
    error.value = err.message ?? 'Failed to confirm pickup';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="detail-page">
    <header class="page-header">
      <button type="button" class="back" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h1>Pickup Details</h1>
    </header>

    <div v-if="!order" class="hint">
      <p>This order couldn't be found — it may have expired from the list you came from.</p>
      <button type="button" class="back-link" @click="router.back()">Go back</button>
    </div>

    <div v-else class="detail-body">
      <DetailInfoCard :image-url="shopImageUrl" :name="shopName" :address="shopAddress" :status="order.status" />

      <div class="info-list">
        <InfoRow label="Name" :value="shopName" />
        <InfoRow
          label="Phone Number"
          :value="order.partner?.phoneNumber"
          :href="order.partner?.phoneNumber ? `tel:${order.partner.phoneNumber}` : undefined"
        />
      </div>

      <PhotoUploadCard :preview-url="previewUrl" class="photo-section" @change="onPhotoChange" />

      <p class="address-chip">{{ shopAddress || '—' }}</p>

      <ParcelsListSection :parcels="parcelRows" :total="order.estimatedTotalParcel" />

      <p v-if="error" class="error-text">{{ error }}</p>

      <button type="button" class="confirm-btn" :disabled="submitting" @click="onConfirmPickup">
        {{ submitting ? 'Confirming…' : 'Confirm Pickup' }}
      </button>
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
  padding: 24px 16px 40px;
  max-width: 480px;
  margin: 0 auto;
}
.info-list {
  border-radius: 16px;
  border: 1px solid var(--line);
  overflow: hidden;
}
.photo-section {
  margin-top: 20px;
}
.address-chip {
  margin: 14px 0 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--wash);
  color: var(--ink);
  font-size: 0.85rem;
}
.error-text {
  margin: 14px 0 0;
  color: #e33;
  font-size: 0.82rem;
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
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
