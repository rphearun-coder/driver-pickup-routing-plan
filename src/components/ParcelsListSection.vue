<script lang="ts">
export interface ParcelRow {
  key: string;
  previewUrl?: string;
  hasPhoto: boolean;
  hasSticker: boolean;
  // Short label for the scanned sticker / registered parcel UID, shown under the title.
  code?: string;
  // Already registered on the backend — shown for reference, can't be changed here.
  locked?: boolean;
}
</script>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = withDefaults(defineProps<{ parcels: ParcelRow[]; editable?: boolean; showSticker?: boolean }>(), {
  editable: true,
  showSticker: true,
});
const emit = defineEmits<{
  'add-parcel': [];
  photo: [key: string, file: File];
  scan: [key: string];
  remove: [key: string];
}>();

function isReady(item: ParcelRow): boolean {
  return item.locked || (item.hasPhoto && (!props.showSticker || item.hasSticker));
}
const readyCount = computed(() => props.parcels.filter(isReady).length);
const progress = computed(() => (props.parcels.length ? (readyCount.value / props.parcels.length) * 100 : 0));

// One shared camera input — the row it's for is remembered right before opening it.
const fileInput = ref<HTMLInputElement | null>(null);
let photoKey = '';

function pickPhoto(key: string): void {
  photoKey = key;
  fileInput.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file && photoKey) emit('photo', photoKey, file);
  input.value = '';
}

// Full-screen look at a parcel photo, with a retake shortcut for editable rows.
const previewItem = ref<ParcelRow | null>(null);
function onThumbClick(item: ParcelRow): void {
  if (item.previewUrl) previewItem.value = item;
  else if (props.editable && !item.locked) pickPhoto(item.key);
}
function retake(): void {
  if (!previewItem.value) return;
  const key = previewItem.value.key;
  previewItem.value = null;
  pickPhoto(key);
}
</script>

<template>
  <section class="parcels-section">
    <div class="parcels-heading">
      <h2>
        Parcels
        <span class="count-pill">{{ parcels.length }}</span>
      </h2>
      <button v-if="editable" type="button" class="add-parcel-btn" @click="emit('add-parcel')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {{ parcels.length ? 'Edit count' : 'Add' }}
      </button>
    </div>

    <div v-if="parcels.length" class="progress">
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
      </div>
      <span class="progress-text">{{ readyCount }} of {{ parcels.length }} ready</span>
    </div>

    <ul v-if="parcels.length" class="parcels-list">
      <li
        v-for="(item, index) in parcels"
        :key="item.key"
        class="parcel-item"
        :class="{ ready: isReady(item), locked: item.locked }"
      >
        <button
          type="button"
          class="thumb"
          :class="{ empty: !item.previewUrl }"
          :disabled="!item.previewUrl && (!editable || item.locked)"
          :aria-label="item.previewUrl ? 'View photo' : 'Take parcel photo'"
          @click="onThumbClick(item)"
        >
          <img v-if="item.previewUrl" :src="item.previewUrl" alt="" />
          <span v-else class="thumb-number">{{ index + 1 }}</span>
          <span v-if="isReady(item)" class="thumb-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </button>

        <div class="parcel-info">
          <p class="parcel-title">Parcel {{ index + 1 }}</p>
          <p v-if="item.locked" class="parcel-sub">
            <span class="chip done">Registered</span>
            <span v-if="item.code" class="code">{{ item.code }}</span>
          </p>
          <p v-else class="parcel-sub">
            <span class="chip" :class="{ done: item.hasPhoto }">{{ item.hasPhoto ? '✓ Photo' : 'Photo' }}</span>
            <span v-if="showSticker" class="chip" :class="{ done: item.hasSticker }">
              {{ item.hasSticker ? `✓ ${item.code}` : 'Sticker' }}
            </span>
          </p>
        </div>

        <div v-if="editable && !item.locked" class="actions">
          <button
            type="button"
            class="action-btn"
            :class="{ done: item.hasPhoto }"
            aria-label="Take parcel photo"
            @click="pickPhoto(item.key)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </button>
          <button
            v-if="showSticker"
            type="button"
            class="action-btn"
            :class="{ done: item.hasSticker }"
            aria-label="Scan sticker"
            @click="emit('scan', item.key)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
              <path d="M8 9v6M11 9v6M14 9v6M16.5 9v6" stroke-width="1.6" />
            </svg>
          </button>
          <button type="button" class="action-btn delete" aria-label="Remove parcel" @click="emit('remove', item.key)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5" />
            </svg>
          </button>
        </div>
      </li>
    </ul>

    <div v-else class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
          <path d="M12 2.8 20 7.2v9.6L12 21.2 4 16.8V7.2z" />
          <path d="M4 7.2 12 11.6l8-4.4M12 11.6v9.6" />
        </svg>
      </div>
      <p class="empty-title">No parcels yet</p>
      <p class="empty-text">Count the parcels at the shop, then add a photo for each one.</p>
      <button v-if="editable" type="button" class="empty-btn" @click="emit('add-parcel')">Enter parcel count</button>
    </div>

    <input ref="fileInput" type="file" accept="image/*" capture="environment" class="file-input" @change="onFileChange" />

    <Teleport to="#overlay-root">
      <div v-if="previewItem" class="lightbox" @click.self="previewItem = null">
        <img :src="previewItem.previewUrl" alt="Parcel photo" />
        <div class="lightbox-actions">
          <button type="button" class="lightbox-btn" @click="previewItem = null">Close</button>
          <button v-if="editable && !previewItem.locked" type="button" class="lightbox-btn primary" @click="retake">
            Retake
          </button>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.parcels-section {
  margin-top: 24px;
}
.parcels-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.parcels-heading h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--ink);
  font: 700 1.05rem var(--sans);
}
.count-pill {
  min-width: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--blue-soft);
  color: var(--blue);
  font: 700 0.78rem var(--sans);
  text-align: center;
}
.add-parcel-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border: none;
  border-radius: 999px;
  background: var(--blue-soft);
  color: var(--blue);
  font: 700 0.8rem var(--sans);
  cursor: pointer;
}
.add-parcel-btn svg {
  width: 15px;
  height: 15px;
}
.progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.progress-track {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: var(--track);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--green);
  transition: width 0.25s ease;
}
.progress-text {
  flex-shrink: 0;
  color: var(--muted);
  font: 600 0.75rem var(--sans);
}
.parcels-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.parcel-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.04);
  transition: border-color 0.2s ease, background 0.2s ease;
}
.parcel-item.ready {
  border-color: var(--green-border);
  background: var(--green-tint);
}
.thumb {
  position: relative;
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  padding: 0;
  border: none;
  border-radius: 10px;
  overflow: visible;
  background: var(--input);
  cursor: pointer;
}
.thumb:disabled {
  cursor: default;
}
.thumb img {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  object-fit: cover;
}
.thumb.empty {
  border: 1.5px dashed var(--border-dashed);
}
.thumb-number {
  color: var(--muted);
  font: 700 1rem var(--sans);
}
.thumb-check {
  position: absolute;
  right: -5px;
  bottom: -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
}
.thumb-check svg {
  width: 11px;
  height: 11px;
}
.parcel-info {
  flex: 1;
  min-width: 0;
}
.parcel-title {
  margin: 0 0 5px;
  color: var(--ink);
  font: 700 0.92rem var(--sans);
}
.parcel-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin: 0;
}
.chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--orange-soft);
  color: var(--orange-strong);
  font: 600 0.7rem var(--sans);
  white-space: nowrap;
}
.chip.done {
  background: var(--green-soft);
  color: var(--green-strong);
}
.code {
  color: var(--muted);
  font: 500 0.7rem var(--sans);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  gap: 6px;
}
.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: var(--fill);
  color: var(--text-3);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.action-btn:active {
  transform: scale(0.94);
}
.action-btn svg {
  width: 20px;
  height: 20px;
}
.action-btn.done {
  background: var(--green-soft);
  color: var(--green);
}
.action-btn.delete {
  background: var(--red-soft);
  color: #e02424;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 20px;
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
  background: var(--input);
  color: var(--muted);
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
  line-height: 1.4;
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
.file-input {
  display: none;
}
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 24px 16px;
  background: rgba(0, 0, 0, 0.88);
}
.lightbox img {
  max-width: 100%;
  max-height: 75%;
  border-radius: 12px;
  object-fit: contain;
}
.lightbox-actions {
  display: flex;
  gap: 12px;
}
.lightbox-btn {
  min-width: 110px;
  padding: 12px 18px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font: 700 0.9rem var(--sans);
  cursor: pointer;
}
.lightbox-btn.primary {
  background: var(--green);
}
</style>
