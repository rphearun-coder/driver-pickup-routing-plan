<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DeliverParcelDialog from '../components/DeliverParcelDialog.vue';
import ReportIssueSheet from '../components/ReportIssueSheet.vue';
import DeliveryFailedDialog from '../components/DeliveryFailedDialog.vue';
import SwipeToConfirm from '../components/SwipeToConfirm.vue';
import ImageLightbox from '../components/ImageLightbox.vue';
import {
  confirmReturnParcel,
  confirmReturnParcelToWarehouse,
  getParcel,
  parcelSellerName,
  resolveParcelImageUrl,
  updateParcelImage,
  uploadParcelProof,
} from '../api/parcels';
import { useOrderDetailStore } from '../stores/orderDetail';

const route = useRoute();
const router = useRouter();
const store = useOrderDetailStore();
const parcel = computed(() => store.parcel);
const loading = ref(false);
const loadError = ref('');

// List pages stash the parcel before navigating; a reload or direct link has to
// fetch it (getParcel also brings back the return-specific fields).
async function loadParcel(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    store.setParcel(await getParcel(String(route.params.id)));
  } catch (err: any) {
    loadError.value = err.message ?? 'Failed to load this parcel';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (store.parcel?.id !== route.params.id) loadParcel();
});

// Opened straight from a link there's no in-app page to go back to — land on the
// list this parcel belongs to instead of leaving the app.
function goBack(): void {
  if (window.history.state?.back) {
    router.back();
    return;
  }
  const status = parcel.value?.status ?? '';
  const name = ['ON_DELIVERY'].includes(status)
    ? 'deliveries'
    : ['SUCCESS', 'FAILED'].includes(status)
      ? 'delivery-history'
      : 'returns';
  router.replace({ name });
}

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

// ---- Return flows (everything that isn't ON_DELIVERY / SUCCESS / FAILED) ----
// BE_RETURN: carry it back to the seller → confirmReturnParcel (needs this driver
// as returnByDriverId). RETURNING_FROM_DRIVER / PROCESSING_RETURN: drop it at the
// warehouse → driverConfirmReturnParcelToWarehouse. Both need a proof photo.
type ConfirmKind = 'return-to-shop' | 'return-to-warehouse';
interface ConfirmAction {
  kind: ConfirmKind;
  title: string;
  subtitle: string;
  photoLabel: string;
  swipeLabel: string;
  doneTitle: string;
}
const CONFIRM_ACTIONS: Partial<Record<string, ConfirmAction>> = {
  BE_RETURN: {
    kind: 'return-to-shop',
    title: 'Return to shop',
    subtitle: 'Hand this parcel back to the seller.',
    photoLabel: 'Handover photo',
    swipeLabel: 'Swipe to confirm return',
    doneTitle: 'Returned to shop',
  },
  RETURNING_FROM_DRIVER: {
    kind: 'return-to-warehouse',
    title: 'Drop off at warehouse',
    subtitle: 'Bring this parcel back to the warehouse.',
    photoLabel: 'Drop-off photo',
    swipeLabel: 'Swipe to confirm drop-off',
    doneTitle: 'Dropped off at warehouse',
  },
  PROCESSING_RETURN: {
    kind: 'return-to-warehouse',
    title: 'Drop off at warehouse',
    subtitle: 'Bring this parcel back to the warehouse.',
    photoLabel: 'Drop-off photo',
    swipeLabel: 'Swipe to confirm drop-off',
    doneTitle: 'Dropped off at warehouse',
  },
};

const confirmAction = computed(() => (parcel.value ? CONFIRM_ACTIONS[parcel.value.status] : undefined));
const canConfirm = computed(() => !!confirmAction.value && !!proofFile.value && !confirming.value);
const confirmedAction = ref<ConfirmAction | null>(null);
const proofInput = ref<HTMLInputElement | null>(null);

function pickProof(): void {
  proofInput.value?.click();
}

function onProofInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  proofFile.value = file;
  if (proofPreviewUrl.value) URL.revokeObjectURL(proofPreviewUrl.value);
  proofPreviewUrl.value = URL.createObjectURL(file);
  confirmError.value = '';
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
      store.setParcel({ ...item, status: 'RETURN', proofOfReturnToSender: proofImage, updatedAt: new Date().toISOString() });
    } else {
      await confirmReturnParcelToWarehouse(item.id, proofImage);
    }
    confirmedAction.value = action;
  } catch (err: any) {
    confirmError.value = err.message ?? 'Failed to confirm. Please try again.';
  } finally {
    confirming.value = false;
  }
}

onBeforeUnmount(() => {
  if (proofPreviewUrl.value) URL.revokeObjectURL(proofPreviewUrl.value);
});

const seller = computed(() => parcel.value?.partner);
const sellerPhone = computed(() => seller.value?.phoneNumber || '');
const sellerAddress = computed(() => seller.value?.shop?.address || '');
const sellerImageUrl = computed(() => resolveParcelImageUrl(seller.value?.shop?.shopImage));
const sellerMapUrl = computed(() => {
  const shop = seller.value?.shop;
  if (shop?.latitude && shop?.longitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}`;
  }
  return shop?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address)}` : '';
});

const RETURN_STATUS_LABELS: Record<string, string> = {
  BE_RETURN: 'To return to shop',
  RETURNING_FROM_DRIVER: 'To drop at warehouse',
  PROCESSING_RETURN: 'To drop at warehouse',
  RETURN: 'Returned to shop',
  IN_CENTRAL_WAREHOUSE: 'In warehouse',
  PICKED_UP: 'Picked up',
  PENDING: 'Pending',
  IN_TRANSIT: 'In transit',
  DELETED: 'Deleted',
};
const heroTone = computed(() => {
  const status = parcel.value?.status ?? '';
  if (confirmedAction.value || status === 'RETURN') return 'done';
  if (status === 'BE_RETURN') return 'shop';
  if (status === 'RETURNING_FROM_DRIVER' || status === 'PROCESSING_RETURN') return 'warehouse';
  return 'neutral';
});

function waitingText(value?: string): string {
  if (!value) return '';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return 'Since today';
  return `Waiting ${days} day${days > 1 ? 's' : ''}`;
}

const returnProofUrl = computed(() => resolveParcelImageUrl(parcel.value?.proofOfReturnToSender));

function onCollected(): void {
  showCollectPayment.value = false;
  goBack();
}

function onDeliveryFailed(): void {
  showReportIssue.value = false;
  showFailed.value = false;
  goBack();
}

const showFailed = ref(false);
const photoViewUrl = ref('');

// Retaking the parcel photo while out for delivery (e.g. the label was unreadable).
const photoInput = ref<HTMLInputElement | null>(null);
const photoUpdating = ref(false);
const photoError = ref('');
const photoMessage = ref('');

function pickNewPhoto(): void {
  photoInput.value?.click();
}

async function onNewPhoto(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const item = parcel.value;
  if (!file || !item) return;
  photoError.value = '';
  photoMessage.value = '';
  photoUpdating.value = true;
  try {
    const key = await uploadParcelProof(file);
    await updateParcelImage(item.id, key);
    store.setParcel({ ...item, parcelImage: key });
    photoMessage.value = 'Parcel photo updated.';
  } catch (err: any) {
    photoError.value = err.message ?? 'Failed to update the photo.';
  } finally {
    photoUpdating.value = false;
  }
}

const receiptPhotoUrl = computed(() => resolveParcelImageUrl(parcel.value?.receiptImage));


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

const parcelPhotoUrl = computed(() => resolveParcelImageUrl(parcel.value?.parcelImage));
const successPhotoUrl = computed(() => resolveParcelImageUrl(parcel.value?.receiptImage || parcel.value?.proofImage));
const failedPhotoUrl = computed(() => resolveParcelImageUrl(parcel.value?.proofOfFailed));
</script>

<template>
  <div class="detail-page">
    <header class="page-header">
      <button type="button" class="back" aria-label="Back" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <div class="header-title">
        <h1>{{ isCodStatus ? 'Delivery Details' : 'Return Details' }}</h1>
      </div>
      <span class="header-spacer" aria-hidden="true"></span>
    </header>

    <div v-if="!parcel" class="hint">
      <template v-if="loading">
        <span class="spinner" aria-hidden="true"></span>
        <p>Loading parcel…</p>
      </template>
      <template v-else>
        <p>{{ loadError || "This parcel couldn't be found." }}</p>
        <button type="button" class="back-link" @click="loadError ? loadParcel() : goBack()">
          {{ loadError ? 'Try again' : 'Go back' }}
        </button>
      </template>
    </div>

    <div v-else-if="isCodStatus" class="detail-body cod-body">
      <section v-if="parcel.status === 'SUCCESS'" class="result-card success">
        <span class="result-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <div class="result-text">
          <p class="result-title">Delivered</p>
          <p class="result-sub">{{ formatDateTime(parcel.updatedAt) }}</p>
        </div>
        <div class="result-amount">
          <span class="result-amount-label">Collected</span>
          <strong>{{ formatUSD(parcel.totalCOD ?? parcel.codUsd) }}</strong>
          <span v-if="parcel.codRiel" class="result-khr">+ {{ Math.round(parcel.codRiel).toLocaleString() }}៛</span>
        </div>
      </section>
      <section v-else-if="parcel.status === 'FAILED'" class="result-card failed">
        <span class="result-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
            <path d="M7 7l10 10M17 7 7 17" />
          </svg>
        </span>
        <div class="result-text">
          <p class="result-title">Delivery failed</p>
          <p class="result-sub">{{ formatDateTime(parcel.updatedAt) }}</p>
          <p v-if="parcel.reason" class="result-reason">{{ parcel.reason }}</p>
        </div>
      </section>

      <div class="cod-card">
        <div class="cod-row">
          <span>Seller name</span>
          <strong class="seller">{{ parcelSellerName(parcel) || '—' }}</strong>
        </div>
        <div class="cod-row">
          <span>Price</span>
          <strong class="price">{{ formatUSD(parcel.price) }}</strong>
        </div>
        <div class="cod-row">
          <span>Phone number</span>
          <a v-if="parcel.recipientNumber" class="link-value" :href="`tel:${parcel.recipientNumber}`">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z" />
            </svg>
            {{ parcel.recipientNumber }}
          </a>
          <strong v-else>—</strong>
        </div>
        <div class="cod-row">
          <span>Recipient location</span>
          <a v-if="parcel.location && mapUrl !== '#'" class="link-value" :href="mapUrl" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
            </svg>
            {{ parcel.location }}
          </a>
          <strong v-else>{{ parcel.location || '—' }}</strong>
        </div>
        <div v-if="parcel.status === 'SUCCESS'" class="cod-row">
          <span>Collected by</span>
          <strong>{{ formatReceiverBy(parcel.receiverBy) }}</strong>
        </div>
      </div>

      <template v-if="parcel.status !== 'ON_DELIVERY'">
        <div class="photo-grid">
          <figure v-if="parcel.status === 'SUCCESS' ? successPhotoUrl : failedPhotoUrl" class="photo-tile">
            <button
              type="button"
              class="photo-tile-btn"
              @click="photoViewUrl = (parcel.status === 'SUCCESS' ? successPhotoUrl : failedPhotoUrl)"
            >
              <img :src="parcel.status === 'SUCCESS' ? successPhotoUrl : failedPhotoUrl" alt="Proof photo" loading="lazy" />
            </button>
            <figcaption>{{ parcel.status === 'SUCCESS' ? 'Proof of delivery' : 'Proof of failure' }}</figcaption>
          </figure>
          <figure v-if="parcelPhotoUrl" class="photo-tile">
            <button type="button" class="photo-tile-btn" @click="photoViewUrl = parcelPhotoUrl">
              <img :src="parcelPhotoUrl" alt="Parcel photo" loading="lazy" />
            </button>
            <figcaption>Parcel photo</figcaption>
          </figure>
        </div>
        <p v-if="!(parcel.status === 'SUCCESS' ? successPhotoUrl : failedPhotoUrl) && !parcelPhotoUrl" class="no-photos">
          No photos were recorded for this delivery.
        </p>
      </template>

      <template v-if="parcel.status === 'ON_DELIVERY'">
        <button
          v-if="receiptPhotoUrl"
          type="button"
          class="photo-card"
          aria-label="View receipt photo"
          @click="photoViewUrl = receiptPhotoUrl"
        >
          <img :src="receiptPhotoUrl" alt="Receipt photo" />
        </button>

        <div class="photo-card editable" :class="{ empty: !parcelPhotoUrl }">
          <button
            v-if="parcelPhotoUrl"
            type="button"
            class="photo-view"
            aria-label="View parcel photo"
            @click="photoViewUrl = parcelPhotoUrl"
          >
            <img :src="parcelPhotoUrl" alt="Parcel photo" />
          </button>
          <button v-else type="button" class="photo-view placeholder" @click="pickNewPhoto">
            <span>No parcel photo — tap to take one</span>
          </button>
          <button
            type="button"
            class="camera-btn"
            :disabled="photoUpdating"
            aria-label="Retake parcel photo"
            title="Retake parcel photo"
            @click="pickNewPhoto"
          >
            <span v-if="photoUpdating" class="mini-spinner" aria-hidden="true"></span>
            <svg v-else viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 4.5 7.6 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.6L15 4.5zM12 17a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
            </svg>
          </button>
        </div>
        <input ref="photoInput" type="file" accept="image/*" capture="environment" class="file-input" @change="onNewPhoto" />
        <p v-if="photoError" class="error-text">{{ photoError }}</p>
        <p v-else-if="photoMessage" class="success-text">{{ photoMessage }}</p>
      </template>

      <template v-if="parcel.status === 'ON_DELIVERY'">
        <button type="button" class="issue-banner" @click="showReportIssue = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <span>Parcel has a problem</span>
        </button>
      </template>
    </div>

    <div v-else class="detail-body cod-body return-body">
      <section class="return-hero" :class="heroTone">
        <span class="hero-icon" aria-hidden="true">
          <svg v-if="heroTone === 'done'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          <svg v-else-if="heroTone === 'warehouse'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8M7 17h10" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" />
          </svg>
        </span>
        <div class="hero-text">
          <p class="hero-title">
            {{ confirmedAction?.doneTitle || confirmAction?.title || RETURN_STATUS_LABELS[parcel.status] || parcel.status }}
          </p>
          <p class="hero-sub">
            <template v-if="confirmedAction">Confirmed just now — thank you.</template>
            <template v-else-if="confirmAction">{{ confirmAction.subtitle }}</template>
            <template v-else>{{ formatDateTime(parcel.updatedAt) }}</template>
          </p>
        </div>
        <span v-if="confirmAction && !confirmedAction" class="hero-chip">{{ waitingText(parcel.updatedAt || parcel.createdAt) }}</span>
      </section>

      <section class="card">
        <p class="card-label">{{ confirmAction?.kind === 'return-to-warehouse' ? 'Seller' : 'Return to' }}</p>
        <div class="seller-row">
          <span class="seller-avatar">
            <img v-if="sellerImageUrl" :src="sellerImageUrl" alt="" />
            <template v-else>{{ (parcelSellerName(parcel) || '?').charAt(0).toUpperCase() }}</template>
          </span>
          <div class="seller-info">
            <p class="seller-name">{{ parcelSellerName(parcel) || 'Unknown shop' }}</p>
            <p v-if="sellerAddress" class="seller-address">{{ sellerAddress }}</p>
          </div>
        </div>
        <div class="contact-actions">
          <a class="contact-btn call" :class="{ disabled: !sellerPhone }" :href="sellerPhone ? `tel:${sellerPhone}` : undefined">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z" />
            </svg>
            {{ sellerPhone || 'No phone' }}
          </a>
          <a
            class="contact-btn map"
            :class="{ disabled: !sellerMapUrl }"
            :href="sellerMapUrl || undefined"
            target="_blank"
            rel="noopener"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 11l18-8-8 18-2-8z" />
            </svg>
            Directions
          </a>
        </div>
      </section>

      <section class="card">
        <p class="card-label">Parcel</p>
        <div class="info-grid">
          <div class="info-item wide">
            <span>Tracking no.</span>
            <strong class="mono">{{ parcel.parcelUID || parcel.id }}</strong>
          </div>
          <div class="info-item">
            <span>Recipient</span>
            <strong>{{ parcel.recipientName || '—' }}</strong>
          </div>
          <div class="info-item">
            <span>Recipient phone</span>
            <a v-if="parcel.recipientNumber" :href="`tel:${parcel.recipientNumber}`">{{ parcel.recipientNumber }}</a>
            <strong v-else>—</strong>
          </div>
          <div class="info-item">
            <span>Price</span>
            <strong>{{ formatUSD(parcel.price || parcel.codUsd) }}</strong>
          </div>
          <div class="info-item">
            <span>Location</span>
            <strong>{{ parcel.location || parcel.deliveryAddress || '—' }}</strong>
          </div>
          <div v-if="parcel.reason" class="info-item wide">
            <span>Return reason</span>
            <strong class="reason-chip">{{ parcel.reason }}</strong>
          </div>
        </div>
      </section>

      <div class="photo-grid">
        <figure v-if="returnProofUrl" class="photo-tile">
          <button type="button" class="photo-tile-btn" @click="photoViewUrl = returnProofUrl">
            <img :src="returnProofUrl" alt="Handover photo" loading="lazy" />
          </button>
          <figcaption>Handover photo</figcaption>
        </figure>
        <figure v-if="parcelPhotoUrl" class="photo-tile">
          <button type="button" class="photo-tile-btn" @click="photoViewUrl = parcelPhotoUrl">
            <img :src="parcelPhotoUrl" alt="Parcel photo" loading="lazy" />
          </button>
          <figcaption>Parcel photo</figcaption>
        </figure>
      </div>

      <section v-if="confirmAction && !confirmedAction" class="card confirm-card">
        <p class="card-label">
          {{ confirmAction.photoLabel }} <span class="required">*</span>
        </p>
        <button type="button" class="proof-card" :class="{ filled: proofPreviewUrl }" @click="pickProof">
          <img v-if="proofPreviewUrl" :src="proofPreviewUrl" :alt="confirmAction.photoLabel" />
          <template v-else>
            <span class="proof-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
            <span class="proof-text">Take a photo</span>
            <span class="proof-sub">
              {{ confirmAction.kind === 'return-to-shop' ? 'Show the parcel handed to the seller.' : 'Show the parcel at the warehouse.' }}
            </span>
          </template>
          <span v-if="proofPreviewUrl" class="retake-pill">Retake</span>
        </button>
        <input ref="proofInput" type="file" accept="image/*" capture="environment" class="file-input" @change="onProofInput" />

        <p v-if="confirmError" class="confirm-error">{{ confirmError }}</p>

        <SwipeToConfirm
          class="confirm-swipe"
          :label="confirmAction.swipeLabel"
          :color="confirmAction.kind === 'return-to-shop' ? 'var(--orange)' : 'var(--blue)'"
          :disabled="!canConfirm"
          :loading="confirming"
          @confirm="onConfirm"
        />
        <p v-if="!proofFile" class="confirm-hint">Take the photo first, then swipe to confirm.</p>
      </section>

      <section v-if="confirmedAction" class="card done-card">
        <p>{{ confirmedAction.doneTitle }} — it's been removed from your Returns list.</p>
        <button type="button" class="done-btn" @click="router.replace({ name: 'returns' })">Back to Returns</button>
      </section>
    </div>

    <div v-if="parcel && parcel.status === 'ON_DELIVERY'" class="cod-bottom-bar">
      <button type="button" class="bar-btn deliver" @click="showCollectPayment = true">Deliver parcel</button>
      <button type="button" class="bar-btn fail" @click="showFailed = true">Failed</button>
    </div>

    <DeliverParcelDialog v-if="showCollectPayment && parcel" :parcel="parcel" @close="showCollectPayment = false" @delivered="onCollected" />
    <ReportIssueSheet v-if="showReportIssue && parcel" :parcel="parcel" @close="showReportIssue = false" @failed="onDeliveryFailed" />
    <DeliveryFailedDialog v-if="showFailed && parcel" :parcel="parcel" @close="showFailed = false" @failed="onDeliveryFailed" />

    <ImageLightbox v-if="photoViewUrl" :src="photoViewUrl" @close="photoViewUrl = ''" />  </div>
</template>

<style scoped>
.detail-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--page);
}
.page-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid var(--track);
}
.back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--ink);
  cursor: pointer;
}
.back svg {
  width: 22px;
  height: 22px;
}
.header-spacer {
  width: 40px;
}
/* Native-style header: the title sits left beside the back button, so it never collides
   with the right-side control and truncates on narrow phones (e.g. iPhone 12, 390px). */
.page-header > * {
  flex-shrink: 0;
}
.header-title {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 12px;
}
.header-title h1 {
  margin: 0;
  overflow: hidden;
  color: var(--ink);
  font: 700 1.1rem var(--sans);
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-sub {
  overflow: hidden;
  color: var(--muted);
  font: 500 0.74rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cod-body {
  flex: 1;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 16px 16px 24px;
}
.photo-card {
  position: relative;
  display: block;
  width: 100%;
  height: 230px;
  margin-top: 14px;
  padding: 0;
  border: none;
  border-radius: 18px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(17, 24, 39, 0.08);
  cursor: zoom-in;
}
.photo-card img,
.photo-view img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #fafafa;
}
.photo-card.editable {
  cursor: default;
}
.photo-view {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: zoom-in;
}
.photo-view.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px dashed var(--disabled);
  border-radius: 18px;
  color: var(--muted);
  font: 600 0.85rem var(--sans);
  cursor: pointer;
}
.camera-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 12px;
  background: #fff;
  color: var(--ink-strong);
  box-shadow: 0 2px 10px rgba(17, 24, 39, 0.18);
  cursor: pointer;
}
.camera-btn svg {
  width: 24px;
  height: 24px;
}
.mini-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--line);
  border-top-color: var(--ink-strong);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.file-input {
  display: none;
}
.success-text {
  margin: 10px 0 0;
  color: var(--green-strong);
  font: 600 0.8rem var(--sans);
  text-align: center;
}
.result-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 16px;
  border-radius: 18px;
  color: #fff;
}
.result-card.success {
  background: linear-gradient(135deg, #1f8a2c, #2fae3a);
  box-shadow: 0 8px 22px rgba(42, 154, 46, 0.28);
}
.result-card.failed {
  background: linear-gradient(135deg, var(--red-strong), #e5534b);
  box-shadow: 0 8px 22px rgba(224, 67, 59, 0.28);
}
.result-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
}
.result-icon svg {
  width: 24px;
  height: 24px;
}
.result-text {
  flex: 1;
  min-width: 0;
}
.result-title {
  margin: 0;
  font: 800 1.1rem var(--sans);
}
.result-sub {
  margin: 2px 0 0;
  opacity: 0.85;
  font: 500 0.78rem var(--sans);
}
.result-reason {
  display: inline-block;
  max-width: 100%;
  margin: 8px 0 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  font: 600 0.78rem var(--sans);
  overflow-wrap: anywhere;
}
.result-amount {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.result-amount-label {
  opacity: 0.85;
  font: 600 0.68rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.result-amount strong {
  font: 800 1.35rem var(--sans);
}
.result-khr {
  font: 600 0.78rem var(--sans);
  opacity: 0.9;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.photo-tile {
  margin: 0;
  overflow: hidden;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(17, 24, 39, 0.06);
}
.photo-tile-btn {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  padding: 0;
  border: none;
  background: #fafafa;
  cursor: zoom-in;
}
.photo-tile-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.photo-tile figcaption {
  padding: 8px 12px;
  color: var(--ink);
  font: 600 0.78rem var(--sans);
}
.no-photos {
  margin: 14px 0 0;
  padding: 20px;
  border: 1.5px dashed var(--border-dashed);
  border-radius: 16px;
  color: var(--muted);
  font-size: 0.82rem;
  text-align: center;
}
.return-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 18px;
  color: #fff;
}
.return-hero.shop {
  background: linear-gradient(135deg, var(--orange-strong), #e58a2d);
  box-shadow: 0 8px 22px rgba(217, 115, 26, 0.28);
}
.return-hero.warehouse {
  background: linear-gradient(135deg, var(--blue-strong), #3b82f6);
  box-shadow: 0 8px 22px rgba(26, 115, 232, 0.28);
}
.return-hero.done {
  background: linear-gradient(135deg, #1f8a2c, #2fae3a);
  box-shadow: 0 8px 22px rgba(42, 154, 46, 0.28);
}
.return-hero.neutral {
  background: linear-gradient(135deg, var(--text-3), var(--muted));
}
.hero-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
}
.hero-icon svg {
  width: 24px;
  height: 24px;
}
.hero-text {
  flex: 1;
  min-width: 0;
}
.hero-title {
  margin: 0;
  font: 800 1.1rem var(--sans);
}
.hero-sub {
  margin: 2px 0 0;
  opacity: 0.88;
  font: 500 0.8rem var(--sans);
}
.hero-chip {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  font: 700 0.7rem var(--sans);
}
.card {
  margin-top: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(17, 24, 39, 0.05);
}
.card-label {
  margin: 0 0 10px;
  color: var(--muted);
  font: 700 0.7rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.required {
  color: var(--red);
}
.seller-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.seller-avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 800 1.15rem var(--sans);
}
.seller-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.seller-info {
  flex: 1;
  min-width: 0;
}
.seller-name {
  margin: 0;
  color: var(--ink);
  font: 700 1rem var(--sans);
}
.seller-address {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.35;
}
.contact-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}
.contact-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  height: 42px;
  padding: 0 10px;
  border-radius: 12px;
  font: 700 0.82rem var(--sans);
  text-decoration: none;
  overflow: hidden;
  white-space: nowrap;
}
.contact-btn svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}
.contact-btn.call {
  background: var(--green-soft);
  color: var(--green-strong);
}
.contact-btn.map {
  background: var(--blue-soft);
  color: var(--blue);
}
.contact-btn.disabled {
  opacity: 0.4;
  pointer-events: none;
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 14px;
}
.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.info-item.wide {
  grid-column: 1 / -1;
}
.info-item span {
  color: var(--muted);
  font: 500 0.72rem var(--sans);
}
.info-item strong,
.info-item a {
  color: var(--ink);
  font: 600 0.88rem var(--sans);
  overflow-wrap: anywhere;
  text-decoration: none;
}
.info-item a {
  color: var(--blue);
}
.info-item .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.82rem;
}
.info-item .reason-chip {
  align-self: flex-start;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--red-soft);
  color: var(--red-strong);
  font-size: 0.78rem;
}
.proof-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 190px;
  padding: 0;
  border: 1.5px dashed var(--disabled);
  border-radius: 16px;
  background: #fafbfc;
  overflow: hidden;
  cursor: pointer;
}
.proof-card.filled {
  border: 1px solid var(--border);
}
.proof-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.proof-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--orange-soft);
  color: var(--orange);
}
.proof-icon svg {
  width: 24px;
  height: 24px;
}
.proof-text {
  color: var(--ink);
  font: 700 0.9rem var(--sans);
}
.proof-sub {
  color: var(--muted);
  font-size: 0.76rem;
}
.retake-pill {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.7);
  color: #fff;
  font: 700 0.75rem var(--sans);
}
.confirm-error {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--red-soft);
  color: var(--red-strong);
  font: 600 0.8rem var(--sans);
  text-align: center;
}
.confirm-swipe {
  margin-top: 14px;
}
.confirm-hint {
  margin: 8px 0 0;
  color: var(--muted);
  font: 500 0.76rem var(--sans);
  text-align: center;
}
.done-card {
  text-align: center;
}
.done-card p {
  margin: 0 0 12px;
  color: var(--ink);
  font: 600 0.88rem var(--sans);
}
.done-btn {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 0.92rem var(--sans);
  cursor: pointer;
}
.hint .spinner {
  display: inline-block;
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-dashed);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.cod-bottom-bar {
  position: sticky;
  bottom: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 12px 16px calc(14px + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -6px 20px rgba(17, 24, 39, 0.06);
}
.bar-btn {
  height: 54px;
  border: none;
  border-radius: 14px;
  color: #fff;
  font: 700 1rem var(--sans);
  cursor: pointer;
}
.bar-btn:active {
  transform: scale(0.98);
}
.bar-btn.deliver {
  background: var(--green);
  box-shadow: 0 6px 16px rgba(42, 154, 46, 0.25);
}
.bar-btn.fail {
  background: var(--red);
  box-shadow: 0 6px 16px rgba(224, 67, 59, 0.25);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
  padding: 6px 16px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(17, 24, 39, 0.05);
}
.cod-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  color: var(--muted);
  font: 400 0.95rem var(--sans);
}
.cod-row + .cod-row {
  border-top: 1px solid var(--divider);
}
.cod-row strong,
.cod-row a {
  min-width: 0;
  color: var(--ink);
  font: 500 0.95rem var(--sans);
  text-align: right;
  text-decoration: none;
  overflow-wrap: anywhere;
}
.cod-row .seller {
  font-weight: 700;
}
.cod-row .price {
  font: 800 1.15rem var(--sans);
}
.cod-row .link-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--blue);
}
.cod-row .link-value svg {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
}
.cod-row .amount {
  color: var(--green);
}
.issue-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 18px;
  padding: 16px;
  border: none;
  border-radius: 14px;
  background: #eceef1;
  color: var(--ink);
  font: 700 0.92rem var(--sans);
  cursor: pointer;
}
.issue-banner:active {
  background: #e2e5e9;
}
.issue-banner svg {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
.error-text {
  margin-top: 12px;
  color: var(--red);
  font-size: 0.8rem;
  text-align: center;
}
</style>
