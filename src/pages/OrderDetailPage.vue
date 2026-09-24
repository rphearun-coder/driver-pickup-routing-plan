<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AddParcelSheet from '../components/AddParcelSheet.vue';
import ParcelsListSection, { type ParcelRow } from '../components/ParcelsListSection.vue';
import AppToast from '../components/AppToast.vue';
import ScanQRCodeModal from '../components/ScanQRCodeModal.vue';
import { useToast, type ToastType } from '../composables/useToast';
import {
  confirmPickup,
  confirmUploadParcel,
  getOrderById,
  registerParcelImages,
  uploadPickupProof,
} from '../api/pickup-orders';
import { getBeReturnParcels, resolveParcelImageUrl } from '../api/parcels';
import { useOrderDetailStore } from '../stores/orderDetail';
import type { PickupOrderStatus } from '../types/api';

const route = useRoute();
const router = useRouter();
const store = useOrderDetailStore();
const order = computed(() => store.order);
const loading = ref(false);
const loadError = ref('');

// A parcel the driver is adding on this device — photo and sticker are only sent
// to the backend (registerParcelImages) when the bottom button is pressed.
interface ParcelSlot {
  key: string;
  stickerId?: string;
  file?: File;
  previewUrl?: string;
}

const slots = ref<ParcelSlot[]>([]);
const noSticker = ref(false);
const totalPrice = ref(0);
const showSheet = ref(false);
const sheetSubmitting = ref(false);
const sheetError = ref('');
const scanTargetKey = ref<string | null>(null); // '' = header scan (next row without a sticker)
const submitting = ref(false);
const error = ref('');
// Set once registerParcelImages succeeds, so a retry after a failed confirmPickup
// doesn't register the same parcels a second time.
const registered = ref(false);
let slotSeq = 0;

const STATUS_LABELS: Record<PickupOrderStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  ON_ROUTE: 'On Route',
  PICKED_UP: 'Picked Up',
  ABORT_PICK_UP: 'Aborted',
  CANCELLED: 'Cancelled',
  DELETED: 'Deleted',
  REGISTERED: 'Registered',
  PRINTED: 'Printed',
};

const senderName = computed(() => order.value?.partner?.fullName || order.value?.partner?.shop?.shopName || '—');
const shopName = computed(() => order.value?.partner?.shop?.shopName || '');
const shopImageUrl = computed(() => resolveParcelImageUrl(order.value?.partner?.shop?.shopImage));
const senderInitial = computed(() => senderName.value.trim().charAt(0).toUpperCase() || '?');
const phoneNumber = computed(() => order.value?.partner?.phoneNumber || '');
const address = computed(() => order.value?.partner?.shop?.address || order.value?.pickupAddress || '—');
const statusLabel = computed(() => (order.value ? STATUS_LABELS[order.value.status] ?? order.value.status : ''));
const statusClass = computed(() => order.value?.status.toLowerCase().replace(/_/g, '-') ?? '');
const mapUrl = computed(() => {
  const lat = order.value?.pickupLatitude || order.value?.partner?.shop?.latitude;
  const lng = order.value?.pickupLongitude || order.value?.partner?.shop?.longitude;
  if (lat && lng) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  if (address.value !== '—') return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.value)}`;
  return '';
});

// driverRegisterParcelImages only accepts orders that are still being picked up.
const editable = computed(() => order.value?.status === 'IN_PROGRESS' || order.value?.status === 'ON_ROUTE');
const existingParcels = computed(() => order.value?.parcels ?? []);

function shortCode(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}

const parcelRows = computed<ParcelRow[]>(() => [
  ...existingParcels.value.map((parcel) => ({
    key: `existing-${parcel.id}`,
    previewUrl: resolveParcelImageUrl(parcel.parcelImage) || undefined,
    hasPhoto: Boolean(parcel.parcelImage),
    hasSticker: true,
    code: parcel.parcelUID,
    locked: true,
  })),
  ...slots.value.map((slot) => ({
    key: slot.key,
    previewUrl: slot.previewUrl,
    hasPhoto: Boolean(slot.file),
    hasSticker: Boolean(slot.stickerId),
    code: slot.stickerId ? shortCode(slot.stickerId) : undefined,
  })),
]);

const missingPhotos = computed(() => slots.value.filter((slot) => !slot.file).length);
const missingStickers = computed(() => (noSticker.value ? 0 : slots.value.filter((slot) => !slot.stickerId).length));

const canSubmit = computed(
  () => editable.value && !submitting.value && slots.value.length > 0 && missingPhotos.value === 0 && missingStickers.value === 0,
);

const submitHint = computed(() => {
  if (!slots.value.length) return 'Enter the parcel count to get started.';
  const parts: string[] = [];
  if (missingPhotos.value) parts.push(`${missingPhotos.value} photo${missingPhotos.value > 1 ? 's' : ''}`);
  if (missingStickers.value) parts.push(`${missingStickers.value} sticker${missingStickers.value > 1 ? 's' : ''}`);
  if (parts.length) return `Still needed: ${parts.join(' and ')}`;
  return `All ${slots.value.length} parcel${slots.value.length > 1 ? 's are' : ' is'} ready to send.`;
});

const toast = useToast(3000);
function showMessage(text: string, type: ToastType = 'error'): void {
  toast.show(text, type);
}
function newSlot(stickerId?: string): ParcelSlot {
  slotSeq += 1;
  return { key: `new-${slotSeq}`, stickerId };
}

function releaseSlot(slot: ParcelSlot): void {
  if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
}

function rowNumber(key: string): number {
  return parcelRows.value.findIndex((row) => row.key === key) + 1;
}

async function loadOrder(): Promise<void> {
  const id = String(route.params.id ?? '');
  if (!id) return;
  loading.value = true;
  loadError.value = '';
  try {
    store.setOrder(await getOrderById(id));
  } catch (err: any) {
    loadError.value = err.message ?? 'Failed to load this order';
  } finally {
    loading.value = false;
  }
}

// Badge on the header's return button — parcels waiting to go back to this sender.
const returnCount = ref(0);
async function loadReturnCount(): Promise<void> {
  const partnerId = order.value?.partner?.id;
  if (!partnerId) return;
  try {
    returnCount.value = (await getBeReturnParcels(partnerId)).length;
  } catch {
    returnCount.value = 0; // the badge is a hint only — the returns page shows the real error
  }
}

onMounted(async () => {
  // List pages stash the order before navigating here; a reload or direct link doesn't.
  if (store.order?.id !== route.params.id) await loadOrder();
  if (editable.value && existingParcels.value.length === 0) showSheet.value = true;
  loadReturnCount();
});

onBeforeUnmount(() => {
  slots.value.forEach(releaseSlot);
});

function openSheet(): void {
  sheetError.value = '';
  showSheet.value = true;
}

async function onSheetSubmit(value: { totalParcel: number; totalPrice: number; noSticker: boolean }): Promise<void> {
  if (!order.value) return;
  sheetError.value = '';
  sheetSubmitting.value = true;
  try {
    await confirmUploadParcel(order.value.id, value.totalParcel, value.totalPrice);
  } catch (err: any) {
    sheetError.value = err.message ?? 'Failed to save';
    return;
  } finally {
    sheetSubmitting.value = false;
  }

  totalPrice.value = value.totalPrice;
  noSticker.value = value.noSticker;
  if (noSticker.value) slots.value.forEach((slot) => (slot.stickerId = undefined));

  // The total includes parcels already registered on the order — only the rest are new rows.
  const wanted = Math.max(value.totalParcel - existingParcels.value.length, 0);
  while (slots.value.length > wanted) releaseSlot(slots.value.pop()!);
  while (slots.value.length < wanted) slots.value.push(newSlot());
  registered.value = false;
  showSheet.value = false;
}

function onPhoto(key: string, file: File): void {
  const slot = slots.value.find((s) => s.key === key);
  if (!slot) return;
  releaseSlot(slot);
  slot.file = file;
  slot.previewUrl = URL.createObjectURL(file);
}

function onRemove(key: string): void {
  const index = slots.value.findIndex((s) => s.key === key);
  if (index < 0) return;
  const slot = slots.value[index];
  if ((slot.file || slot.stickerId) && !window.confirm(`Remove Parcel ${rowNumber(key)}?`)) return;
  releaseSlot(slot);
  slots.value.splice(index, 1);
  registered.value = false;
}

function openScan(key = ''): void {
  if (noSticker.value) return;
  scanTargetKey.value = key;
}

// Stickers are pre-printed QR codes carrying the parcel's UUID — sometimes bare,
// sometimes inside a tracking link, so the UUID is pulled out of whatever was scanned.
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function onScanned(raw: string): void {
  const targetKey = scanTargetKey.value;
  const stickerId = raw.match(UUID_PATTERN)?.[0]?.toLowerCase();
  if (!stickerId) {
    showMessage("That QR code isn't a Jalat parcel sticker.");
    return;
  }
  const usedBy = slots.value.find((s) => s.stickerId === stickerId);
  if (usedBy && usedBy.key !== targetKey) {
    showMessage(`This sticker is already on Parcel ${rowNumber(usedBy.key)}.`);
    return;
  }

  let target = targetKey
    ? slots.value.find((s) => s.key === targetKey)
    : slots.value.find((s) => !s.stickerId);
  if (target) {
    target.stickerId = stickerId;
  } else {
    target = newSlot(stickerId);
    slots.value.push(target);
    registered.value = false;
  }
  showMessage(`Sticker added to Parcel ${rowNumber(target.key)}.`, 'success');
}

async function onSubmit(): Promise<void> {
  if (!order.value || !canSubmit.value) return;
  const orderId = order.value.id;
  error.value = '';
  submitting.value = true;
  try {
    if (!registered.value) {
      const totalParcel = existingParcels.value.length + slots.value.length;
      await confirmUploadParcel(orderId, totalParcel, totalPrice.value);
      const parcelImages = await Promise.all(
        slots.value.map(async (slot) => ({
          id: noSticker.value ? undefined : slot.stickerId,
          parcelImage: await uploadPickupProof(slot.file!),
        })),
      );
      await registerParcelImages(orderId, parcelImages);
      registered.value = true;
    }
    await confirmPickup(orderId);
    router.back();
  } catch (err: any) {
    error.value = err.message ?? 'Failed to send parcel photos';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="detail-page">
    <header class="page-header">
      <button type="button" class="header-btn" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <div class="header-title">
        <h1>Pickup Details</h1>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="header-btn"
          aria-label="Return parcels"
          title="Return parcels"
          @click="router.push({ name: 'order-returns', params: { id: route.params.id } })"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.5 9A8 8 0 1 1 4 12.5" />
            <path d="M4 5v4h4" />
            <path d="M12 8.5l3.5 2v3.8L12 16.3l-3.5-2v-3.8z" />
          </svg>
          <span v-if="returnCount" class="header-badge">{{ returnCount > 99 ? '99+' : returnCount }}</span>
        </button>
        <button
          v-if="editable && !noSticker"
          type="button"
          class="header-btn"
          aria-label="Scan sticker"
          title="Scan sticker"
          @click="openScan()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
            <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
            <path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13.5 13.5h1M15.5 15.5h.5" stroke-width="1.6" />
          </svg>
        </button>
      </div>
    </header>

    <div v-if="!order" class="state">
      <template v-if="loading">
        <span class="spinner" aria-hidden="true"></span>
        <p>Loading pickup…</p>
      </template>
      <template v-else>
        <p>{{ loadError || "This pickup couldn't be found." }}</p>
        <button type="button" class="state-btn" @click="loadError ? loadOrder() : router.back()">
          {{ loadError ? 'Try again' : 'Go back' }}
        </button>
      </template>
    </div>

    <template v-else>
      <div class="detail-body">
        <section class="sender-card">
          <div class="sender-top">
            <div class="avatar">
              <img v-if="shopImageUrl" :src="shopImageUrl" alt="" />
              <span v-else>{{ senderInitial }}</span>
            </div>
            <div class="sender-meta">
              <p class="sender-label">Sender</p>
              <p class="sender-name">{{ senderName }}</p>
              <p v-if="shopName && shopName !== senderName" class="sender-shop">{{ shopName }}</p>
            </div>
            <span class="status-badge" :class="statusClass">{{ statusLabel }}</span>
          </div>

          <div class="sender-rows">
            <div class="sender-row">
              <span class="row-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z" />
                </svg>
              </span>
              <div class="row-text">
                <span class="row-label">Phone number</span>
                <span class="row-value">{{ phoneNumber || '—' }}</span>
              </div>
              <a v-if="phoneNumber" class="row-action call" :href="`tel:${phoneNumber}`">Call</a>
            </div>
            <div class="sender-row">
              <span class="row-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
                  <circle cx="12" cy="9.5" r="2.5" />
                </svg>
              </span>
              <div class="row-text">
                <span class="row-label">Location</span>
                <span class="row-value">{{ address }}</span>
              </div>
              <a v-if="mapUrl" class="row-action" :href="mapUrl" target="_blank" rel="noopener">Map</a>
            </div>
          </div>
        </section>

        <ParcelsListSection
          :parcels="parcelRows"
          :editable="editable"
          :show-sticker="!noSticker"
          @add-parcel="openSheet"
          @photo="onPhoto"
          @scan="openScan"
          @remove="onRemove"
        />
      </div>

      <AppToast :message="toast.message.value" :type="toast.type.value" offset="130px" />
      <div v-if="editable" class="bottom-bar">
        <p v-if="error" class="error-text">{{ error }}</p>
        <p v-else class="submit-hint" :class="{ ready: canSubmit }">{{ submitHint }}</p>
        <button type="button" class="submit-btn" :disabled="!canSubmit" @click="onSubmit">
          <span v-if="submitting" class="spinner small" aria-hidden="true"></span>
          {{ submitting ? 'Sending…' : 'Send parcel photos' }}
        </button>
      </div>
    </template>

    <AddParcelSheet
      v-if="showSheet && order"
      :initial-total="parcelRows.length || order.estimatedTotalParcel"
      :initial-price="totalPrice || order.estimatedTotalPrice"
      :no-sticker="noSticker"
      :submitting="sheetSubmitting"
      :error="sheetError"
      @submit="onSheetSubmit"
      @close="showSheet = false"
    />

    <ScanQRCodeModal
      v-if="scanTargetKey !== null"
      title="Scan sticker"
      hint="Align the parcel sticker's QR code within the frame"
      @scan="onScanned"
      @close="scanTargetKey = null"
    />
  </div>
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--ink);
  cursor: pointer;
}
.header-btn:active {
  transform: scale(0.94);
}
.header-btn svg {
  width: 22px;
  height: 22px;
}
.header-btn {
  position: relative;
}
.header-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border: 2px solid #fff;
  border-radius: 999px;
  background: var(--red);
  color: #fff;
  font: 700 0.62rem/14px var(--sans);
  text-align: center;
}
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 72px 24px;
  color: var(--muted);
  text-align: center;
}
.state p {
  margin: 0;
}
.state-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 999px;
  background: #fff;
  color: var(--ink);
  font: 700 0.85rem var(--sans);
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.08);
  cursor: pointer;
}
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-dashed);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.spinner.small {
  width: 16px;
  height: 16px;
  border-width: 2px;
  border-color: rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
}
.detail-body {
  flex: 1;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 16px 16px 24px;
}
.sender-card {
  padding: 16px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(17, 24, 39, 0.05);
}
.sender-top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--divider);
}
.avatar {
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
  font: 700 1.2rem var(--sans);
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sender-meta {
  flex: 1;
  min-width: 0;
}
.sender-label {
  margin: 0;
  color: var(--muted);
  font: 600 0.7rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sender-name {
  margin: 1px 0 0;
  color: var(--ink);
  font: 700 1rem var(--sans);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sender-shop {
  margin: 1px 0 0;
  color: var(--muted);
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-badge {
  flex-shrink: 0;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--muted);
  color: #fff;
  font: 700 0.65rem var(--sans);
  white-space: nowrap;
}
.status-badge.in-progress {
  background: var(--orange);
}
.status-badge.on-route {
  background: var(--blue);
}
.status-badge.picked-up {
  background: var(--green);
}
.status-badge.abort-pick-up,
.status-badge.cancelled,
.status-badge.deleted {
  background: var(--red);
}
.sender-rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
}
.sender-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.row-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--fill);
  color: var(--text-3);
}
.row-icon svg {
  width: 18px;
  height: 18px;
}
.row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.row-label {
  color: var(--muted);
  font-size: 0.72rem;
}
.row-value {
  color: var(--ink);
  font: 500 0.9rem var(--sans);
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.row-action {
  flex-shrink: 0;
  padding: 7px 14px;
  border-radius: 999px;
  background: var(--blue-soft);
  color: var(--blue);
  font: 700 0.78rem var(--sans);
  text-decoration: none;
}
.row-action.call {
  background: var(--green-soft);
  color: var(--green-strong);
}
.bottom-bar {
  position: sticky;
  bottom: 0;
  z-index: 10;
  width: 100%;
  padding: 10px 16px calc(14px + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -6px 20px rgba(17, 24, 39, 0.06);
}
.bottom-bar > * {
  max-width: 448px;
  margin-left: auto;
  margin-right: auto;
}
.submit-hint {
  margin-top: 0;
  margin-bottom: 8px;
  color: var(--muted);
  font: 500 0.78rem var(--sans);
  text-align: center;
}
.submit-hint.ready {
  color: var(--green-strong);
}
.error-text {
  margin-top: 0;
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--red-soft);
  color: var(--red-strong);
  font: 600 0.8rem var(--sans);
  text-align: center;
}
.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 1rem var(--sans);
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(42, 154, 46, 0.25);
  transition: background 0.2s ease, box-shadow 0.2s ease;
}
.submit-btn:disabled {
  background: #b9bec5;
  box-shadow: none;
  cursor: not-allowed;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
