<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AddReturnParcelSheet from '../components/AddReturnParcelSheet.vue';
import AppToast from '../components/AppToast.vue';
import ImageLightbox from '../components/ImageLightbox.vue';
import ScanQRCodeModal from '../components/ScanQRCodeModal.vue';
import { useToast, type ToastType } from '../composables/useToast';
import { getOrderById } from '../api/pickup-orders';
import {
  confirmReturnParcel,
  getBeReturnParcels,
  getDriverReturnedParcels,
  resolveParcelImageUrl,
  uploadParcelProof,
  type ReturnParcel,
} from '../api/parcels';
import { useOrderDetailStore } from '../stores/orderDetail';

const route = useRoute();
const router = useRouter();
const store = useOrderDetailStore();
const order = computed(() => store.order);

const parcels = ref<ReturnParcel[]>([]);
const loading = ref(true);
const loadError = ref('');
const selectedIds = ref<Set<string>>(new Set());
const failedIds = ref<Map<string, string>>(new Map());
const brokenThumbIds = ref<Set<string>>(new Set());
const proofFile = ref<File | null>(null);
const proofPreviewUrl = ref('');
const proofInput = ref<HTMLInputElement | null>(null);
const showScan = ref(false);
const submitting = ref(false);
const error = ref('');
const returnedCount = ref(0);
const activeTab = ref<'pending' | 'returned'>('pending');
const returnedParcels = ref<ReturnParcel[]>([]);
const returnedLoading = ref(false);
const returnedError = ref('');
const showAdd = ref(false);
const addInitialId = ref('');
const proofViewUrl = ref('');

const senderName = computed(() => order.value?.partner?.fullName || order.value?.partner?.shop?.shopName || 'this shop');
const partnerId = computed(() => order.value?.partner?.id ?? '');
const allSelected = computed(() => parcels.value.length > 0 && selectedIds.value.size === parcels.value.length);
const canSubmit = computed(() => selectedIds.value.size > 0 && !!proofFile.value && !submitting.value);

const submitHint = computed(() => {
  if (!selectedIds.value.size) return 'Select the parcels you are handing back.';
  if (!proofFile.value) return 'Take a handover photo to confirm.';
  const n = selectedIds.value.size;
  return `Ready to return ${n} parcel${n > 1 ? 's' : ''}.`;
});

const toast = useToast(3000);
function showMessage(text: string, type: ToastType = 'error'): void {
  toast.show(text, type);
}
function thumbUrl(item: ReturnParcel): string {
  return brokenThumbIds.value.has(item.id) ? '' : resolveParcelImageUrl(item.parcelImage);
}

function onThumbError(id: string): void {
  brokenThumbIds.value = new Set(brokenThumbIds.value).add(id);
}

function parcelCode(item: ReturnParcel): string {
  return item.parcelUID || `#${item.id.slice(-6).toUpperCase()}`;
}

function formatCod(item: ReturnParcel): string {
  const parts: string[] = [];
  if (item.codUsd) parts.push(`$${item.codUsd.toFixed(2)}`);
  if (item.codRiel) parts.push(`${Math.round(item.codRiel).toLocaleString()}៛`);
  return parts.join(' · ');
}

async function loadParcels(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    // List/detail pages stash the order; a reload or direct link has to fetch it.
    if (store.order?.id !== route.params.id) store.setOrder(await getOrderById(String(route.params.id)));
    const partnerId = store.order?.partner?.id;
    if (!partnerId) throw new Error("This pickup's sender couldn't be found.");
    parcels.value = await getBeReturnParcels(partnerId);
    const ids = new Set(parcels.value.map((p) => p.id));
    selectedIds.value = new Set([...selectedIds.value].filter((id) => ids.has(id)));
  } catch (err: any) {
    loadError.value = err.message ?? 'Failed to load return parcels';
  } finally {
    loading.value = false;
  }
  loadReturned();
}

// Parcels already handed back to this shop. driverListReturnParcel can't filter
// by shop, so the driver's recent RETURN parcels are narrowed down here.
async function loadReturned(): Promise<void> {
  if (!partnerId.value) return;
  returnedLoading.value = true;
  returnedError.value = '';
  try {
    const all = await getDriverReturnedParcels();
    returnedParcels.value = all
      .filter((p) => p.userId === partnerId.value)
      .sort((a, b) => ((a.deliveredAt ?? a.updatedAt ?? '') < (b.deliveredAt ?? b.updatedAt ?? '') ? 1 : -1));
  } catch (err: any) {
    returnedError.value = err.message ?? 'Failed to load returned parcels';
  } finally {
    returnedLoading.value = false;
  }
}

function returnedTime(item: ReturnParcel): string {
  const value = item.deliveredAt || item.updatedAt;
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function viewDetail(item: ReturnParcel): void {
  store.setParcel(item);
  router.push({ name: 'parcel-detail', params: { id: item.id } });
}

function openAdd(initialId = ''): void {
  addInitialId.value = initialId;
  showAdd.value = true;
}

function onAdded(parcel: ReturnParcel): void {
  showAdd.value = false;
  parcels.value = [parcel, ...parcels.value.filter((p) => p.id !== parcel.id)];
  selectedIds.value = new Set(selectedIds.value).add(parcel.id);
  activeTab.value = 'pending';
  showMessage(`${parcelCode(parcel)} added to the return list.`, 'success');
}

onMounted(loadParcels);
onBeforeUnmount(() => {
  if (proofPreviewUrl.value) URL.revokeObjectURL(proofPreviewUrl.value);
});

function toggle(id: string): void {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function toggleAll(): void {
  selectedIds.value = allSelected.value ? new Set() : new Set(parcels.value.map((p) => p.id));
}

function pickProof(): void {
  proofInput.value?.click();
}

function onProofChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (proofPreviewUrl.value) URL.revokeObjectURL(proofPreviewUrl.value);
  proofFile.value = file;
  proofPreviewUrl.value = URL.createObjectURL(file);
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Scanning a parcel's QR ticks it if it's already on the list — otherwise it's a
// parcel the driver is taking on now, so the add flow checks and adds it.
function onScanned(raw: string): void {
  const id = raw.match(UUID_PATTERN)?.[0]?.toLowerCase();
  if (!id) {
    showMessage("That QR code isn't a Jalat parcel.");
    return;
  }
  const item = parcels.value.find((p) => p.id.toLowerCase() === id);
  if (!item) {
    openAdd(id);
    return;
  }
  selectedIds.value = new Set(selectedIds.value).add(item.id);
  showMessage(`${parcelCode(item)} selected.`, 'success');
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value || !proofFile.value) return;
  error.value = '';
  submitting.value = true;
  try {
    // One handover photo covers every parcel returned in this visit.
    const proofImage = await uploadParcelProof(proofFile.value);
    const ids = [...selectedIds.value];
    const results = await Promise.allSettled(ids.map((id) => confirmReturnParcel(id, proofImage)));

    const failed = new Map<string, string>();
    results.forEach((result, i) => {
      if (result.status === 'rejected') failed.set(ids[i], result.reason?.message ?? 'Failed');
    });
    const returned = ids.filter((id) => !failed.has(id));
    returnedCount.value += returned.length;
    failedIds.value = failed;
    parcels.value = parcels.value.filter((p) => !returned.includes(p.id));
    selectedIds.value = new Set(failed.keys());

    if (returned.length) loadReturned();
    if (failed.size) {
      error.value = `${failed.size} parcel${failed.size > 1 ? 's' : ''} couldn't be returned — see below and try again.`;
    } else {
      if (proofPreviewUrl.value) URL.revokeObjectURL(proofPreviewUrl.value);
      proofFile.value = null;
      proofPreviewUrl.value = '';
    }
  } catch (err: any) {
    error.value = err.message ?? 'Failed to return parcels';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="returns-page">
    <header class="page-header">
      <button type="button" class="header-btn" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <div class="header-title">
        <h1>Return Parcels</h1>
      </div>
      <button
        v-if="partnerId && !loading && !loadError"
        type="button"
        class="header-btn"
        aria-label="Scan parcel"
        title="Scan parcel"
        @click="showScan = true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
          <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
          <path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13.5 13.5h1M15.5 15.5h.5" stroke-width="1.6" />
        </svg>
      </button>
      <span v-else class="header-spacer" aria-hidden="true"></span>
    </header>

    <div class="body">
      <section class="intro-card">
        <div class="intro-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.5 9A8 8 0 1 1 4 12.5" />
            <path d="M4 5v4h4" />
            <path d="M12 8.5l3.5 2v3.8L12 16.3l-3.5-2v-3.8z" />
          </svg>
        </div>
        <div>
          <p class="intro-title">Hand back to {{ senderName }}</p>
          <p class="intro-text">Parcels that couldn't be delivered and are waiting to go back to this shop.</p>
        </div>
      </section>

      <div v-if="returnedCount" class="success-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        {{ returnedCount }} parcel{{ returnedCount > 1 ? 's' : '' }} returned to the shop.
      </div>

      <div v-if="!loading && !loadError" class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'pending'"
          :class="{ active: activeTab === 'pending' }"
          @click="activeTab = 'pending'"
        >
          To return <span class="tab-count">{{ parcels.length }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'returned'"
          :class="{ active: activeTab === 'returned' }"
          @click="activeTab = 'returned'"
        >
          Returned <span class="tab-count">{{ returnedLoading ? '…' : returnedParcels.length }}</span>
        </button>
      </div>

      <template v-if="activeTab === 'returned' && !loading && !loadError">
        <div v-if="returnedLoading" class="state">
          <span class="spinner" aria-hidden="true"></span>
          <p>Loading returned parcels…</p>
        </div>
        <div v-else-if="returnedError" class="state">
          <p>{{ returnedError }}</p>
          <button type="button" class="state-btn" @click="loadReturned">Try again</button>
        </div>
        <div v-else-if="!returnedParcels.length" class="empty-state">
          <div class="empty-icon muted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" />
            </svg>
          </div>
          <p class="empty-title">No returns yet</p>
          <p class="empty-text">Parcels you hand back to this shop will show up here.</p>
        </div>
        <ul v-else class="parcel-list returned-list">
          <li v-for="item in returnedParcels" :key="item.id" class="parcel-card returned">
            <button
              type="button"
              class="thumb"
              :disabled="!resolveParcelImageUrl(item.proofOfReturnToSender)"
              aria-label="View handover photo"
              @click="proofViewUrl = resolveParcelImageUrl(item.proofOfReturnToSender)"
            >
              <img
                v-if="resolveParcelImageUrl(item.proofOfReturnToSender) || thumbUrl(item)"
                :src="resolveParcelImageUrl(item.proofOfReturnToSender) || thumbUrl(item)"
                alt=""
                @error="onThumbError(item.id)"
              />
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
                <path d="M12 2.8 20 7.2v9.6L12 21.2 4 16.8V7.2z" />
                <path d="M4 7.2 12 11.6l8-4.4M12 11.6v9.6" />
              </svg>
            </button>
            <span class="parcel-info">
              <span class="parcel-code">{{ parcelCode(item) }}</span>
              <span class="parcel-recipient">
                {{ item.recipientName || 'Unknown recipient' }}
                <template v-if="item.recipientNumber"> · {{ item.recipientNumber }}</template>
              </span>
              <span class="returned-meta">
                <span class="returned-chip">✓ Returned</span>
                <span v-if="returnedTime(item)" class="returned-time">{{ returnedTime(item) }}</span>
              </span>
            </span>
            <button type="button" class="details-btn" aria-label="Parcel details" @click="viewDetail(item)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </li>
        </ul>
      </template>

      <div v-else-if="loading" class="state">
        <span class="spinner" aria-hidden="true"></span>
        <p>Loading return parcels…</p>
      </div>

      <div v-else-if="loadError" class="state">
        <p>{{ loadError }}</p>
        <button type="button" class="state-btn" @click="loadParcels">Try again</button>
      </div>

      <div v-else-if="!parcels.length" class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <p class="empty-title">{{ returnedCount ? 'All done' : 'Nothing to return' }}</p>
        <p class="empty-text">You have no parcels waiting to go back to this shop. Picked one up at the warehouse? Add it here.</p>
        <div class="empty-actions">
          <button type="button" class="empty-btn" @click="openAdd()">+ Add return parcel</button>
          <button type="button" class="empty-btn secondary" @click="router.back()">Back to pickup</button>
        </div>
      </div>

      <template v-else>
        <div class="list-heading">
          <div class="list-actions">
            <button type="button" class="pill-btn blue" @click="toggleAll">
              {{ allSelected ? 'Clear all' : 'Select all' }}
            </button>
            <span class="selected-text">{{ selectedIds.size }} selected</span>
          </div>
          <button type="button" class="pill-btn green" @click="openAdd()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add parcel
          </button>
        </div>

        <ul class="parcel-list">
          <li
            v-for="item in parcels"
            :key="item.id"
            class="parcel-card"
            :class="{ selected: selectedIds.has(item.id), failed: failedIds.has(item.id) }"
          >
            <button
              type="button"
              class="select-area"
              role="checkbox"
              :aria-checked="selectedIds.has(item.id)"
              @click="toggle(item.id)"
            >
              <span class="checkbox" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <span class="thumb">
                <img v-if="thumbUrl(item)" :src="thumbUrl(item)" alt="" @error="onThumbError(item.id)" />
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
                  <path d="M12 2.8 20 7.2v9.6L12 21.2 4 16.8V7.2z" />
                  <path d="M4 7.2 12 11.6l8-4.4M12 11.6v9.6" />
                </svg>
              </span>
              <span class="parcel-info">
                <span class="parcel-code">{{ parcelCode(item) }}</span>
                <span class="parcel-recipient">
                  {{ item.recipientName || 'Unknown recipient' }}
                  <template v-if="item.recipientNumber"> · {{ item.recipientNumber }}</template>
                </span>
                <span v-if="item.reason" class="parcel-reason">{{ item.reason }}</span>
                <span v-if="failedIds.has(item.id)" class="parcel-error">{{ failedIds.get(item.id) }}</span>
              </span>
              <span v-if="formatCod(item)" class="cod">{{ formatCod(item) }}</span>
            </button>
            <button type="button" class="details-btn" aria-label="Parcel details" @click="viewDetail(item)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </li>
        </ul>

        <section class="proof-section">
          <h2>Handover photo <span class="required">*</span></h2>
          <p class="proof-hint">Take one photo showing the parcels handed to the shop.</p>
          <button type="button" class="proof-card" :class="{ filled: proofPreviewUrl }" @click="pickProof">
            <img v-if="proofPreviewUrl" :src="proofPreviewUrl" alt="Handover photo" />
            <template v-else>
              <span class="proof-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </span>
              <span class="proof-label">Take photo</span>
            </template>
            <span v-if="proofPreviewUrl" class="retake-pill">Retake</span>
          </button>
          <input ref="proofInput" type="file" accept="image/*" capture="environment" class="file-input" @change="onProofChange" />
        </section>
      </template>
    </div>

    <AppToast :message="toast.message.value" :type="toast.type.value" offset="130px" />
    <div v-if="activeTab === 'pending' && parcels.length && !loading" class="bottom-bar">
      <p v-if="error" class="error-text">{{ error }}</p>
      <p v-else class="submit-hint" :class="{ ready: canSubmit }">{{ submitHint }}</p>
      <button type="button" class="submit-btn" :disabled="!canSubmit" @click="onSubmit">
        <span v-if="submitting" class="spinner small" aria-hidden="true"></span>
        {{ submitting ? 'Returning…' : selectedIds.size ? `Confirm return (${selectedIds.size})` : 'Confirm return' }}
      </button>
    </div>

    <ScanQRCodeModal
      v-if="showScan"
      title="Scan parcel"
      hint="Scan a parcel to select it, or to add it to the return list"
      @scan="onScanned"
      @close="showScan = false"
    />

    <AddReturnParcelSheet
      v-if="showAdd && partnerId"
      :partner-id="partnerId"
      :shop-name="senderName"
      :initial-id="addInitialId"
      @added="onAdded"
      @close="showAdd = false"
    />

    <ImageLightbox v-if="proofViewUrl" :src="proofViewUrl" alt="Handover photo" caption="Handover photo · tap to close" @close="proofViewUrl = ''" />  </div>
</template>

<style scoped>
.returns-page {
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
.header-spacer {
  width: 40px;
}
.body {
  flex: 1;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 16px 16px 24px;
}
.intro-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(17, 24, 39, 0.05);
}
.intro-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--orange-soft);
  color: var(--orange);
}
.intro-icon svg {
  width: 24px;
  height: 24px;
}
.intro-title {
  margin: 0 0 2px;
  color: var(--ink);
  font: 700 0.95rem var(--sans);
}
.intro-text {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.4;
}
.success-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 600 0.85rem var(--sans);
}
.success-banner svg {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 56px 24px;
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
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 20px;
  padding: 36px 20px;
  border: 1.5px dashed var(--border-dashed);
  border-radius: 16px;
  text-align: center;
}
.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 12px;
  border-radius: 50%;
  background: var(--green-soft);
  color: var(--green);
}
.empty-icon svg {
  width: 28px;
  height: 28px;
}
.empty-title {
  margin: 0 0 4px;
  color: var(--ink);
  font: 700 0.95rem var(--sans);
}
.empty-text {
  margin: 0 0 16px;
  color: var(--muted);
  font-size: 0.82rem;
}
.empty-btn {
  padding: 10px 18px;
  border: none;
  border-radius: 999px;
  background: var(--green);
  color: #fff;
  font: 700 0.85rem var(--sans);
  cursor: pointer;
}
.list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 22px 0 12px;
}
.list-heading h2,
.proof-section h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--ink);
  font: 700 1.05rem var(--sans);
}
.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.empty-btn.secondary {
  background: var(--fill);
  color: var(--ink);
}
.empty-icon.muted {
  background: var(--input);
  color: var(--muted);
}
.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-top: 16px;
  padding: 4px;
  border-radius: 12px;
  background: var(--fill-strong);
}
.tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  border: none;
  border-radius: 9px;
  background: none;
  color: var(--muted);
  font: 600 0.88rem var(--sans);
  cursor: pointer;
}
.tabs button.active {
  background: #fff;
  color: var(--ink);
  box-shadow: 0 1px 4px rgba(17, 24, 39, 0.12);
}
.tab-count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--fill);
  color: var(--muted);
  font: 700 0.7rem var(--sans);
}
.tabs button.active .tab-count {
  background: var(--orange-soft);
  color: var(--orange);
}
.list-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.selected-text {
  color: var(--muted);
  font: 500 0.78rem var(--sans);
}
.pill-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border: none;
  border-radius: 999px;
  font: 700 0.8rem var(--sans);
  cursor: pointer;
}
.pill-btn svg {
  width: 14px;
  height: 14px;
}
.pill-btn.blue {
  background: var(--blue-soft);
  color: var(--blue);
}
.pill-btn.green {
  background: var(--green-soft);
  color: var(--green-strong);
}
.parcel-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.returned-list {
  margin-top: 16px;
}
.parcel-card {
  display: flex;
  align-items: center;
  width: 100%;
  border: 1.5px solid var(--border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.04);
  overflow: hidden;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.parcel-card.returned {
  gap: 12px;
  padding: 10px 0 10px 10px;
}
.select-area {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px 10px 10px;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.details-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  align-self: stretch;
  padding: 0;
  border: none;
  border-left: 1px solid var(--divider);
  background: none;
  color: var(--faint);
  cursor: pointer;
}
.details-btn svg {
  width: 18px;
  height: 18px;
}
.returned-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}
.returned-chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--green-soft);
  color: var(--green-strong);
  font: 600 0.68rem var(--sans);
}
.returned-time {
  color: var(--muted);
  font: 500 0.7rem var(--sans);
}
.parcel-card.selected {
  border-color: var(--green);
  background: var(--green-tint);
}
.parcel-card.failed {
  border-color: var(--red);
  background: var(--red-tint);
}
.checkbox {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 2px solid var(--border-dashed);
  border-radius: 7px;
  color: transparent;
  transition: all 0.15s ease;
}
.checkbox svg {
  width: 13px;
  height: 13px;
}
.parcel-card.selected .checkbox {
  border-color: var(--green);
  background: var(--green);
  color: #fff;
}
.thumb {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: none;
  border-radius: 10px;
  overflow: hidden;
  background: var(--input);
  color: var(--faint);
}
button.thumb:not(:disabled) {
  cursor: zoom-in;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb svg {
  width: 24px;
  height: 24px;
}
.parcel-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.parcel-code {
  color: var(--ink);
  font: 700 0.88rem var(--sans);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.parcel-recipient {
  color: var(--muted);
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.parcel-reason {
  align-self: flex-start;
  max-width: 100%;
  margin-top: 2px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--orange-soft);
  color: var(--orange-strong);
  font: 600 0.68rem var(--sans);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.parcel-error {
  color: var(--red-strong);
  font: 600 0.72rem var(--sans);
}
.cod {
  flex-shrink: 0;
  color: var(--ink);
  font: 700 0.8rem var(--sans);
  text-align: right;
}
.proof-section {
  margin-top: 24px;
}
.required {
  color: var(--red);
}
.proof-hint {
  margin: 4px 0 12px;
  color: var(--muted);
  font-size: 0.8rem;
}
.proof-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 170px;
  padding: 0;
  border: 1.5px dashed var(--border-dashed);
  border-radius: 16px;
  background: #fff;
  overflow: hidden;
  cursor: pointer;
}
.proof-card.filled {
  border-style: solid;
  border-color: var(--green-border);
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
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--green-soft);
  color: var(--green);
}
.proof-icon svg {
  width: 24px;
  height: 24px;
}
.proof-label {
  color: var(--ink);
  font: 700 0.88rem var(--sans);
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
.file-input {
  display: none;
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
