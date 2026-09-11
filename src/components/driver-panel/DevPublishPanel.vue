<template>
  <span class="dev-publish">
    <button type="button" class="dev-publish-toggle" title="Dev tools" @click="open = true">
      <IconTools class="icon" />
    </button>

    <div v-if="open" class="dev-modal-backdrop" @click.self="open = false">
      <form class="dev-publish-form" @submit.prevent="submit">
        <div class="dev-modal-header">
          <span>Dev tools</span>
          <button type="button" class="dev-modal-close" title="Close" @click="open = false">&times;</button>
        </div>

        <label class="dev-field">
          <span>Driver ID</span>
          <input v-model="driverId" type="text" placeholder="e.g. driver-42" />
        </label>
        <div class="dev-row">
          <label class="dev-field">
            <span>Lat</span>
            <input v-model.number="lat" type="number" step="any" required />
          </label>
          <label class="dev-field">
            <span>Lon</span>
            <input v-model.number="lon" type="number" step="any" required />
          </label>
        </div>
        <button type="submit" class="dev-publish-btn" :disabled="!driverId.trim()">Publish</button>

        <label class="dev-field dev-field-speed">
          <span>Drive speed</span>
          <select v-model.number="driveSpeedMs" @change="$emit('set-drive-speed', driveSpeedMs)">
            <option :value="2000">Slow</option>
            <option :value="1000">Normal</option>
            <option :value="400">Fast</option>
          </select>
        </label>
      </form>
    </div>
  </span>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import IconTools from '../icons/IconTools.vue';

const props = withDefaults(
  defineProps<{
    defaultDriverId?: string;
    defaultLat?: number;
    defaultLon?: number;
  }>(),
  {
    defaultDriverId: '',
    defaultLat: 11.525498645201512,
    defaultLon: 104.90918454916454,
  }
);

const emit = defineEmits<{
  publish: [payload: { driverId: string; lat: number; lon: number }];
  'set-drive-speed': [ms: number];
}>();

const open = ref(false);
const driverId = ref(props.defaultDriverId);
const lat = ref(props.defaultLat);
const lon = ref(props.defaultLon);
const driveSpeedMs = ref(1000);

function submit(): void {
  const id = driverId.value.trim();
  if (!id) return;
  emit('publish', { driverId: id, lat: lat.value, lon: lon.value });
  open.value = false;
}
</script>

<style scoped>
.dev-publish {
  display: inline-flex;
  font-family: system-ui, -apple-system, sans-serif;
}
.dev-publish-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  cursor: pointer;
}
.dev-publish-toggle:hover {
  background: #f7f8fa;
}
.dev-publish-toggle .icon {
  width: 11px;
  height: 11px;
}
.dev-modal-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1000;
}
.dev-publish-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 220px;
  padding: 14px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}
.dev-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 700;
  color: #202124;
}
.dev-modal-close {
  border: none;
  background: transparent;
  color: #5f6368;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.dev-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  font-size: 10px;
  font-weight: 600;
  color: #6b7280;
}
.dev-field input {
  box-sizing: border-box;
  width: 100%;
  padding: 5px 6px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  font-size: 12px;
  font-family: inherit;
  background: #fff;
  color: #111827;
}
.dev-field input:focus,
.dev-field select:focus {
  outline: none;
  border-color: #1a73e8;
}
.dev-field select {
  box-sizing: border-box;
  width: 100%;
  padding: 5px 6px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  font-size: 12px;
  font-family: inherit;
  background: #fff;
  color: #111827;
}
.dev-field-speed {
  padding-top: 6px;
  border-top: 1px solid #f1f3f4;
}
.dev-row {
  display: flex;
  gap: 6px;
}
.dev-publish-btn {
  min-height: 26px;
  border: none;
  border-radius: 6px;
  background: #1a73e8;
  color: #fff;
  font-weight: 700;
  font-size: 11px;
  cursor: pointer;
}
.dev-publish-btn:hover:not(:disabled) {
  background: #1558b0;
}
.dev-publish-btn:disabled {
  background: #e5e7eb;
  color: #9ca3af;
  cursor: not-allowed;
}
</style>
