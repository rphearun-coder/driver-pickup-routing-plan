<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import ScanQRCodeModal from './ScanQRCodeModal.vue';
import {
  confirmReturnParcelFromWarehouse,
  getParcel,
  resolveParcelImageUrl,
  type ReturnParcel,
} from '../api/parcels';
import { extractUuid } from '../utils/inputRules';

const props = withDefaults(defineProps<{ partnerId: string; shopName: string; initialId?: string }>(), {
  initialId: '',
});
const emit = defineEmits<{ added: [parcel: ReturnParcel]; close: [] }>();

const query = ref(props.initialId);
const found = ref<ReturnParcel | null>(null);
const looking = ref(false);
const adding = ref(false);
const error = ref('');
const showScan = ref(false);

const parsedId = computed(() => extractUuid(query.value));
// Shown once they've typed something that clearly isn't a parcel ID yet.
const idHint = computed(() =>
  query.value.trim().length >= 8 && !parsedId.value ? 'A parcel ID looks like 1c1a20c5-8eb7-4284-981d-1b929402ff6c.' : '',
);

function onQueryInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  // Drop spaces/newlines pasted around the ID; keep the rest for UUID extraction.
  query.value = input.value.replace(/\s+/g, '');
  input.value = query.value;
  found.value = null;
  error.value = '';
}

// Only these can be taken on by a driver (see parcel.service.ts driverConfirmReturnParcelFromWH).
const TAKEABLE = new Set(['PROCESSING_RETURN', 'BE_RETURN']);

async function lookup(): Promise<void> {
  error.value = '';
  found.value = null;
  if (!parsedId.value) {
    error.value = 'Enter or scan a valid parcel ID.';
    return;
  }
  looking.value = true;
  try {
    const parcel = await getParcel(parsedId.value);
    if (parcel.userId && parcel.userId !== props.partnerId) {
      error.value = `This parcel belongs to another shop, not ${props.shopName}.`;
    } else if (!TAKEABLE.has(parcel.status)) {
      error.value = `This parcel can't be returned right now (status: ${parcel.status.replace(/_/g, ' ').toLowerCase()}).`;
    } else {
      found.value = parcel;
    }
  } catch (err: any) {
    error.value = err.message ?? 'Parcel not found';
  } finally {
    looking.value = false;
  }
}

function onScanned(raw: string): void {
  query.value = raw;
  lookup();
}

async function onAdd(): Promise<void> {
  if (!found.value) return;
  error.value = '';
  adding.value = true;
  try {
    const updated = await confirmReturnParcelFromWarehouse(found.value.id);
    emit('added', { ...found.value, ...updated, status: 'BE_RETURN' });
  } catch (err: any) {
    error.value = err.message ?? 'Failed to add this parcel';
  } finally {
    adding.value = false;
  }
}

const previousBodyOverflow = document.body.style.overflow;
onMounted(() => {
  document.body.style.overflow = 'hidden';
  if (props.initialId) lookup();
});
onUnmounted(() => (document.body.style.overflow = previousBodyOverflow));
</script>

<template>
  <Teleport to="#overlay-root">
    <div class="sheet-backdrop" @click.self="emit('close')">
      <div class="sheet">
        <span class="drag-handle"></span>

        <div class="sheet-header">
          <div>
            <h2 class="sheet-title">Add return parcel</h2>
            <p class="sheet-subtitle">Take on a returning parcel for {{ shopName }}.</p>
          </div>
          <button type="button" class="close-btn" aria-label="Close" @click="emit('close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <button type="button" class="scan-btn" @click="showScan = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
            <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
            <path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13.5 13.5h1M15.5 15.5h.5" stroke-width="1.6" />
          </svg>
          Scan parcel QR code
        </button>

        <div class="divider"><span>or enter the parcel ID</span></div>

        <form class="lookup" @submit.prevent="lookup">
          <input
            :value="query"
            type="text"
            class="text-input"
            :class="{ invalid: idHint, valid: parsedId }"
            placeholder="e.g. 1c1a20c5-8eb7-…"
            maxlength="200"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="search"
            :aria-invalid="!!idHint"
            @input="onQueryInput"
          />
          <button type="submit" class="lookup-btn" :disabled="looking || !parsedId">
            {{ looking ? '…' : 'Find' }}
          </button>
        </form>
        <p v-if="idHint" class="field-hint">{{ idHint }}</p>

        <p v-if="error" class="error-text">{{ error }}</p>

        <div v-if="found" class="preview">
          <span class="preview-thumb">
            <img v-if="resolveParcelImageUrl(found.parcelImage)" :src="resolveParcelImageUrl(found.parcelImage)" alt="" />
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
              <path d="M12 2.8 20 7.2v9.6L12 21.2 4 16.8V7.2z" />
              <path d="M4 7.2 12 11.6l8-4.4M12 11.6v9.6" />
            </svg>
          </span>
          <span class="preview-info">
            <span class="preview-code">{{ found.parcelUID || `#${found.id.slice(-6).toUpperCase()}` }}</span>
            <span class="preview-line">
              {{ found.recipientName || 'Unknown recipient' }}
              <template v-if="found.recipientNumber"> · {{ found.recipientNumber }}</template>
            </span>
            <span v-if="found.reason" class="preview-reason">{{ found.reason }}</span>
          </span>
          <span class="preview-ok">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </div>

        <button type="button" class="confirm-btn" :disabled="!found || adding" @click="onAdd">
          {{ adding ? 'Adding…' : 'Add to return list' }}
        </button>
      </div>

      <ScanQRCodeModal
        v-if="showScan"
        title="Scan parcel"
        hint="Scan the QR code on the returning parcel"
        @scan="onScanned"
        @close="showScan = false"
      />
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
  background: rgba(17, 24, 39, 0.6);
  overscroll-behavior: contain;
  animation: fade-in 0.2s ease;
}
.sheet {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: 90%;
  overflow-y: auto;
  padding: 10px 20px calc(24px + env(safe-area-inset-bottom));
  border-radius: 22px 22px 0 0;
  background: #fff;
  animation: slide-up 0.25s ease;
}
.drag-handle {
  display: block;
  width: 40px;
  height: 5px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: var(--disabled);
}
.sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
.sheet-title {
  margin: 0 0 2px;
  color: var(--ink);
  font: 700 1.15rem var(--sans);
}
.sheet-subtitle {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
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
  width: 16px;
  height: 16px;
}
.scan-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 52px;
  border: 1.5px solid var(--green);
  border-radius: 12px;
  background: var(--green-tint);
  color: var(--green-strong);
  font: 700 0.95rem var(--sans);
  cursor: pointer;
}
.scan-btn svg {
  width: 22px;
  height: 22px;
}
.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0 12px;
  color: var(--muted);
  font-size: 0.75rem;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--border);
}
.lookup {
  display: flex;
  gap: 8px;
}
.text-input {
  flex: 1;
  min-width: 0;
  height: 48px;
  padding: 0 14px;
  border: 1.5px solid transparent;
  border-radius: 12px;
  background: var(--input);
  color: var(--ink);
  font: 500 16px var(--sans); /* iOS Safari auto-zooms on focus if an input's font-size is under 16px */
  outline: none;
}
.text-input:focus {
  border-color: var(--green);
  background: #fff;
}
.text-input.invalid {
  border-color: #e0a33b;
  background: #fffaf2;
}
.text-input.valid {
  border-color: var(--green);
}
.field-hint {
  margin: 6px 4px 0;
  color: var(--orange-strong);
  font: 600 0.75rem var(--sans);
}
.lookup-btn {
  flex-shrink: 0;
  min-width: 70px;
  height: 48px;
  border: none;
  border-radius: 12px;
  background: var(--ink);
  color: #fff;
  font: 700 0.88rem var(--sans);
  cursor: pointer;
}
.lookup-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.error-text {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--red-soft);
  color: var(--red-strong);
  font: 600 0.8rem var(--sans);
  text-align: center;
}
.preview {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding: 10px 12px 10px 10px;
  border: 1.5px solid var(--green-border);
  border-radius: 14px;
  background: var(--green-tint);
}
.preview-thumb {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--input);
  color: var(--faint);
}
.preview-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.preview-thumb svg {
  width: 24px;
  height: 24px;
}
.preview-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.preview-code {
  color: var(--ink);
  font: 700 0.88rem var(--sans);
}
.preview-line {
  color: var(--muted);
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-reason {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--orange-soft);
  color: var(--orange-strong);
  font: 600 0.68rem var(--sans);
}
.preview-ok {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
}
.preview-ok svg {
  width: 13px;
  height: 13px;
}
.confirm-btn {
  width: 100%;
  height: 52px;
  margin-top: 20px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 1rem var(--sans);
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(42, 154, 46, 0.25);
}
.confirm-btn:disabled {
  background: #b7c2b8;
  box-shadow: none;
  cursor: not-allowed;
}
@keyframes slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
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
