<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import PhoneNumberInput from './PhoneNumberInput.vue';
import { getMyFullProfile, updateMyProfile, uploadAvatarImage, type FullProfile } from '../api/users';
import { resolveParcelImageUrl } from '../api/parcels';
import { avatarColor, avatarInitials } from '../lib/avatar';
import { prepareAvatarImage } from '../lib/image';

const emit = defineEmits<{ close: []; saved: [] }>();

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const fullProfile = ref<FullProfile | null>(null);
const fullName = ref('');
const phoneNumber = ref('');
const avatarKey = ref('');
const avatarPreviewUrl = ref('');
const avatarUploading = ref(false);
const avatarInput = ref<HTMLInputElement | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const profile = await getMyFullProfile();
    fullProfile.value = profile;
    fullName.value = profile.fullName ?? '';
    phoneNumber.value = profile.phoneNumber ?? '';
    avatarKey.value = profile.avatar ?? '';
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load profile.';
  } finally {
    loading.value = false;
  }
}

function revokePreview(): void {
  if (avatarPreviewUrl.value) URL.revokeObjectURL(avatarPreviewUrl.value);
  avatarPreviewUrl.value = '';
}

function onAvatarPick(): void {
  avatarInput.value?.click();
}

async function onAvatarChange(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (!file) return;

  error.value = '';
  avatarUploading.value = true;
  try {
    const prepared = await prepareAvatarImage(file);
    revokePreview();
    avatarPreviewUrl.value = URL.createObjectURL(prepared);
    avatarKey.value = await uploadAvatarImage(prepared);
  } catch (err: any) {
    revokePreview();
    error.value = err.message ?? 'Failed to upload photo.';
  } finally {
    avatarUploading.value = false;
  }
}

// updateProfile requires bankAccounts/driverProfile even for a name/phone-only
// edit — resubmitting the values fetched above unchanged instead of leaving
// them out, which would otherwise wipe them.
async function onSubmit(): Promise<void> {
  if (!fullProfile.value) return;
  error.value = '';
  saving.value = true;
  try {
    await updateMyProfile({
      fullName: fullName.value.trim(),
      phoneNumber: phoneNumber.value,
      avatar: avatarKey.value,
      bankAccounts: fullProfile.value.bankAccounts,
      driverProfile: fullProfile.value.driverProfile,
    });
    emit('saved');
  } catch (err: any) {
    error.value = err.message ?? 'Failed to save profile.';
  } finally {
    saving.value = false;
  }
}

const previousBodyOverflow = document.body.style.overflow;

onMounted(() => {
  document.body.style.overflow = 'hidden';
  load();
});

onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow;
  revokePreview();
});
</script>

<template>
  <Teleport to="#overlay-root">
    <div class="sheet-backdrop" @click.self="emit('close')">
      <div class="sheet">
        <span class="drag-handle"></span>
        <h2 class="sheet-title">Edit Profile</h2>

        <p v-if="loading" class="hint">Loading...</p>
        <template v-else>
          <div class="avatar-picker">
            <button type="button" class="avatar-btn" :disabled="avatarUploading" @click="onAvatarPick">
              <img v-if="avatarPreviewUrl || avatarKey" :src="avatarPreviewUrl || resolveParcelImageUrl(avatarKey)" alt="" />
              <span v-else class="avatar-fallback" :style="{ background: avatarColor(fullName) }">
                {{ avatarInitials(fullName) || '?' }}
              </span>
              <span v-if="avatarUploading" class="avatar-spinner"></span>
              <span class="avatar-edit-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 16V4M12 4l-4 4M12 4l4 4" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                </svg>
              </span>
            </button>
          </div>
          <input ref="avatarInput" type="file" accept="image/*" class="avatar-file-input" @change="onAvatarChange" />

          <label class="field-label" for="edit-profile-name">Full name</label>
          <input id="edit-profile-name" v-model="fullName" type="text" class="text-input" placeholder="Full name" />

          <label class="field-label" for="edit-profile-phone">Phone number</label>
          <PhoneNumberInput v-model="phoneNumber" />

          <p v-if="error" class="error-text">{{ error }}</p>

          <button type="button" class="confirm-btn" :disabled="saving || avatarUploading" @click="onSubmit">
            {{ saving ? 'Saving...' : 'Save Changes' }}
          </button>
        </template>
      </div>
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
  background: rgba(0, 0, 0, 0.5);
  overscroll-behavior: contain;
}
.sheet {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: 90%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 20px 24px;
  border-radius: 24px 24px 0 0;
  background: #fff;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2);
}
.drag-handle {
  display: block;
  width: 40px;
  height: 4px;
  margin: 0 auto 16px;
  border-radius: 999px;
  background: var(--line);
}
.sheet-title {
  margin: 0 0 16px;
  font: 700 1.05rem var(--heading);
  color: var(--ink);
  text-align: center;
}
.hint {
  padding: 20px 0;
  text-align: center;
  color: var(--muted);
}
.avatar-picker {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}
.avatar-btn {
  position: relative;
  width: 88px;
  height: 88px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--wash);
  cursor: pointer;
  overflow: visible;
}
.avatar-btn:disabled {
  cursor: default;
}
.avatar-btn img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  color: #fff;
  font: 700 1.6rem var(--heading);
}
.avatar-spinner {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
}
.avatar-spinner::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border: 3px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: avatar-spin 0.8s linear infinite;
}
@keyframes avatar-spin {
  to {
    transform: rotate(360deg);
  }
}
.avatar-edit-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
}
.avatar-edit-badge svg {
  width: 14px;
  height: 14px;
}
.avatar-file-input {
  display: none;
}
.field-label {
  display: block;
  margin: 0 2px 6px;
  color: var(--muted);
  font: 700 0.72rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.field-label + .text-input,
.field-label + div {
  margin-bottom: 16px;
}
.text-input {
  display: block;
  width: 100%;
  padding: 14px 16px;
  margin-bottom: 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  color: var(--ink);
  font: 500 16px var(--sans); /* iOS Safari auto-zooms on focus if an input's font-size is under 16px */
}
.text-input::placeholder {
  color: var(--muted);
}
.error-text {
  margin-top: 12px;
  color: var(--red);
  font-size: 0.8rem;
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
  background: #a9d9c1;
  cursor: not-allowed;
}
</style>
