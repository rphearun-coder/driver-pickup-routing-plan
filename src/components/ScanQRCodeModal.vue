<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import QrScanner from 'qr-scanner';

const props = withDefaults(
  defineProps<{
    title?: string;
    hint?: string;
  }>(),
  { title: 'Scan QR Code', hint: 'Align QR code within frame to scan' },
);

const emit = defineEmits<{
  scan: [value: string];
  close: [];
}>();

const videoEl = ref<HTMLVideoElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const scanError = ref('');
let scanner: QrScanner | null = null;
let handled = false;

// A real scan (camera or photo) always closes the sheet immediately — the caller
// owns what happens next (calling a mutation, showing its own success/error state).
function emitScan(value: string): void {
  if (handled) return;
  handled = true;
  emit('scan', value);
  emit('close');
}

function close(): void {
  emit('close');
}

async function startCamera(): Promise<void> {
  if (!videoEl.value) return;
  try {
    const hasCamera = await QrScanner.hasCamera();
    if (!hasCamera) {
      scanError.value = 'No camera found on this device — use "Upload from photos" instead.';
      return;
    }
    scanner = new QrScanner(videoEl.value, (result) => emitScan(result.data), {
      preferredCamera: 'environment',
      highlightScanRegion: false,
      highlightCodeOutline: false,
    });
    await scanner.start();
  } catch {
    scanError.value = 'Camera access was blocked — allow camera permission, or use "Upload from photos".';
  }
}

function triggerUpload(): void {
  fileInput.value?.click();
}

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  scanError.value = '';
  try {
    const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
    emitScan(result.data);
  } catch {
    scanError.value = 'No QR code found in that photo — try another.';
  } finally {
    input.value = '';
  }
}

onMounted(startCamera);
onBeforeUnmount(() => {
  scanner?.stop();
  scanner?.destroy();
  scanner = null;
});
</script>

<template>
  <Teleport to="#overlay-root">
    <div class="qr-scan-sheet">
      <header class="qr-scan-header">
        <button type="button" class="qr-cancel" @click="close">Cancel</button>
        <h2>{{ title }}</h2>
        <span class="qr-header-spacer" aria-hidden="true"></span>
      </header>

      <div class="qr-scan-body">
        <video ref="videoEl" class="qr-video" playsinline muted></video>

        <div class="qr-scan-overlay">
          <p class="qr-hint" :class="{ error: scanError }">{{ scanError || hint }}</p>
          <div class="qr-frame">
            <span class="qr-corner tl"></span>
            <span class="qr-corner tr"></span>
            <span class="qr-corner bl"></span>
            <span class="qr-corner br"></span>
          </div>
          <button type="button" class="qr-upload-btn" @click="triggerUpload">Upload from photos</button>
        </div>
      </div>

      <input ref="fileInput" type="file" accept="image/*" class="qr-file-input" @change="onFileChosen" />
    </div>
  </Teleport>
</template>

<style scoped>
.qr-scan-sheet {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  background: #000;
}
.qr-scan-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 14px 12px;
  background: #efeff1;
}
.qr-cancel {
  justify-self: start;
  padding: 6px 4px;
  border: none;
  background: none;
  color: #007aff;
  font: 400 1rem var(--sans);
  cursor: pointer;
}
.qr-scan-header h2 {
  grid-column: 2;
  margin: 0;
  color: #111;
  font: 700 1.02rem var(--sans);
}
.qr-header-spacer {
  justify-self: end;
  width: 52px;
}

.qr-scan-body {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: #000;
}
.qr-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.qr-scan-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 0 24px;
}
.qr-hint {
  margin: 0;
  max-width: 280px;
  color: #f2f2f2;
  text-align: center;
  font: 500 0.92rem var(--sans);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
.qr-hint.error {
  color: #ff8a80;
}

.qr-frame {
  position: relative;
  width: 260px;
  height: 260px;
  border-radius: 18px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
}
.qr-corner {
  position: absolute;
  width: 34px;
  height: 34px;
  border: 4px solid #34d058;
}
.qr-corner.tl {
  top: -2px;
  left: -2px;
  border-right: none;
  border-bottom: none;
  border-radius: 14px 0 0 0;
}
.qr-corner.tr {
  top: -2px;
  right: -2px;
  border-left: none;
  border-bottom: none;
  border-radius: 0 14px 0 0;
}
.qr-corner.bl {
  bottom: -2px;
  left: -2px;
  border-right: none;
  border-top: none;
  border-radius: 0 0 0 14px;
}
.qr-corner.br {
  bottom: -2px;
  right: -2px;
  border-left: none;
  border-top: none;
  border-radius: 0 0 14px 0;
}

.qr-upload-btn {
  padding: 12px 22px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #1f2937;
  font: 700 0.88rem var(--sans);
  cursor: pointer;
}

.qr-file-input {
  display: none;
}
</style>
