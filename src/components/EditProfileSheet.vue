<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import PhoneNumberInput from './PhoneNumberInput.vue';
import { getMyFullProfile, updateMyProfile, type FullProfile } from '../api/users';

const emit = defineEmits<{ close: []; saved: [] }>();

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const fullProfile = ref<FullProfile | null>(null);
const fullName = ref('');
const phoneNumber = ref('');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const profile = await getMyFullProfile();
    fullProfile.value = profile;
    fullName.value = profile.fullName ?? '';
    phoneNumber.value = profile.phoneNumber ?? '';
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load profile.';
  } finally {
    loading.value = false;
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
      avatar: fullProfile.value.avatar,
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
});
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <div class="sheet">
      <span class="drag-handle"></span>
      <h2 class="sheet-title">Edit Profile</h2>

      <p v-if="loading" class="hint">Loading...</p>
      <template v-else>
        <label class="field-label" for="edit-profile-name">Full name</label>
        <input id="edit-profile-name" v-model="fullName" type="text" class="text-input" placeholder="Full name" />

        <label class="field-label" for="edit-profile-phone">Phone number</label>
        <PhoneNumberInput v-model="phoneNumber" />

        <p v-if="error" class="error-text">{{ error }}</p>

        <button type="button" class="confirm-btn" :disabled="saving" @click="onSubmit">
          {{ saving ? 'Saving...' : 'Save Changes' }}
        </button>
      </template>
    </div>
  </div>
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
  max-height: 90vh;
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
  color: #e33;
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
