<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import QRCode from 'qrcode';
import type { AuthenticatedUser } from '../types/api';

const props = defineProps<{ profile: AuthenticatedUser | null }>();
const emit = defineEmits<{ close: [] }>();

const qrDataUrl = ref('');
const shareStatus = ref('');
const copied = ref(false);

async function generateQr() {
  const value = props.profile?.id ?? props.profile?.phoneNumber ?? props.profile?.username ?? '';
  if (!value) return;
  qrDataUrl.value = await QRCode.toDataURL(value, {
    width: 400,
    margin: 1,
    color: { dark: '#21a366', light: '#ffffff' },
  });
}

async function onShare() {
  shareStatus.value = '';
  if (!qrDataUrl.value) return;

  const name = props.profile?.fullName || props.profile?.username || 'Driver';
  const blob = await (await fetch(qrDataUrl.value)).blob();
  const file = new File([blob], 'qr-code.png', { type: 'image/png' });

  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name, text: `${name}'s Jalat Logistic QR code` });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: name, text: `${name}'s Jalat Logistic QR code` });
      return;
    }
    shareStatus.value = 'Sharing is not supported here — use Copy ID instead.';
  } catch (err: any) {
    if (err?.name !== 'AbortError') shareStatus.value = 'Could not share the QR code.';
  }
}

async function onCopy() {
  const value = props.profile?.id ?? props.profile?.phoneNumber ?? props.profile?.username ?? '';
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    shareStatus.value = 'Could not copy the ID.';
  }
}

const previousBodyOverflow = document.body.style.overflow;

onMounted(() => {
  generateQr();
  document.body.style.overflow = 'hidden';
});

onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <Teleport to="#overlay-root">
    <div class="qr-backdrop" @click.self="emit('close')">
      <div class="qr-card">
        <button type="button" class="close" aria-label="Close" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          <span>Close</span>
        </button>

        <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR code" class="qr-image" />

        <div class="actions">
          <button type="button" class="share-btn" @click="onShare">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
            </svg>
            Share
          </button>
          <button type="button" class="copy-btn" @click="onCopy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
        <p v-if="shareStatus" class="share-status">{{ shareStatus }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.qr-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 16px;
  overscroll-behavior: contain;
}
.qr-card {
  position: relative;
  width: 100%;
  max-width: 320px;
  max-height: 85%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 44px 20px 20px;
  border-radius: 24px;
  background: #fff;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}
.close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 12px 0 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--wash);
  color: #000;
  font: 700 0.72rem var(--sans);
  cursor: pointer;
}
.close svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.qr-image {
  width: 100%;
  max-width: 220px;
  aspect-ratio: 1 / 1;
  margin: 0 auto 16px;
  display: block;
}
.actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}
.share-btn,
.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  border-radius: 999px;
  font: 700 0.68rem var(--sans);
  cursor: pointer;
}
.share-btn {
  background: var(--green);
  color: #fff;
}
.copy-btn {
  background: var(--wash);
  color: var(--ink);
  border: 1px solid var(--line);
}
.share-btn svg,
.copy-btn svg {
  width: 12px;
  height: 12px;
}
.share-status {
  margin-top: 10px;
  color: var(--muted);
  font-size: 0.78rem;
}
</style>
