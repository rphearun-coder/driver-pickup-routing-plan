<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getMyFullProfile, getMyProfile, updateMyProfile, uploadAvatarImage } from '../api/users';
import { resolveParcelImageUrl } from '../api/parcels';
import { checkPaymentService } from '../api/payment';
import { avatarColor, avatarInitials } from '../lib/avatar';
import { prepareAvatarImage } from '../lib/image';
import { useAuthStore } from '../stores/auth';
import { useAuth } from '../composables/useAuth';
import { useDriverPresence } from '../composables/useDriverPresence';
import { useMobileInteraction } from '../composables/useMobileInteraction';
import EditProfileSheet from '../components/EditProfileSheet.vue';
import ChangePasswordSheet from '../components/ChangePasswordSheet.vue';
import type { AuthenticatedUser } from '../types/api';

const auth = useAuthStore();
const { logoutDriver } = useAuth();
const { isOnline, presenceError, updatedAt } = useDriverPresence();
const router = useRouter();

const presenceStatusText = computed(() => {
  if (!updatedAt.value) return '';
  const time = new Date(updatedAt.value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${isOnline.value ? 'Online' : 'Offline'} · ${time}`;
});
const profile = ref<AuthenticatedUser | null>(null);
const showEditProfile = ref(false);
const showChangePassword = ref(false);
const toastMessage = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const avatarUploading = ref(false);
const avatarPreviewUrl = ref('');
const avatarInput = ref<HTMLInputElement | null>(null);
const paymentServiceStatus = ref<'checking' | 'online' | 'offline'>('checking');

useMobileInteraction(() => {
  showEditProfile.value = false;
  showChangePassword.value = false;
});

async function loadProfile(): Promise<void> {
  try {
    profile.value = await getMyProfile();
  } catch {
    profile.value = null;
  }
}

async function checkServiceStatus(): Promise<void> {
  paymentServiceStatus.value = 'checking';
  try {
    await checkPaymentService();
    paymentServiceStatus.value = 'online';
  } catch {
    paymentServiceStatus.value = 'offline';
  }
}

onMounted(() => {
  loadProfile();
  checkServiceStatus();
});

function showToast(text: string): void {
  toastMessage.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMessage.value = ''), 3000);
}

function onProfileSaved(): void {
  showEditProfile.value = false;
  showToast('Profile updated.');
  loadProfile();
}

function onPasswordChanged(): void {
  showChangePassword.value = false;
  showToast('Password changed.');
}

function revokeAvatarPreview(): void {
  if (avatarPreviewUrl.value) URL.revokeObjectURL(avatarPreviewUrl.value);
  avatarPreviewUrl.value = '';
}

function onAvatarPick(): void {
  if (!avatarUploading.value) avatarInput.value?.click();
}

// Quick-edit from the profile card itself: uploads and saves immediately, unlike
// EditProfileSheet's picker which only stages the key until "Save Changes". Still
// has to round-trip through getMyFullProfile/updateMyProfile (see EditProfileSheet.vue)
// since a plain avatar-only update would otherwise wipe bankAccounts/driverProfile.
async function onAvatarFileChange(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (!file) return;

  avatarUploading.value = true;
  try {
    const prepared = await prepareAvatarImage(file);
    revokeAvatarPreview();
    avatarPreviewUrl.value = URL.createObjectURL(prepared);

    const avatar = await uploadAvatarImage(prepared);
    const full = await getMyFullProfile();
    await updateMyProfile({
      fullName: full.fullName ?? '',
      phoneNumber: full.phoneNumber ?? '',
      avatar,
      bankAccounts: full.bankAccounts,
      driverProfile: full.driverProfile,
    });
    await loadProfile();
    showToast('Profile photo updated.');
  } catch (err: any) {
    showToast(err.message ?? 'Failed to update photo.');
  } finally {
    revokeAvatarPreview();
    avatarUploading.value = false;
  }
}

function onLogout() {
  auth.logout();
  logoutDriver();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="settings-page">
    <header class="page-header">
      <h1>Profile</h1>
    </header>

    <div class="account-card">
      <button
        type="button"
        class="avatar-placeholder"
        :disabled="avatarUploading"
        :style="profile && !profile.avatar && !avatarPreviewUrl ? { background: avatarColor(profile.fullName || profile.username) } : undefined"
        @click="onAvatarPick"
      >
        <img v-if="avatarPreviewUrl || profile?.avatar" :src="avatarPreviewUrl || resolveParcelImageUrl(profile!.avatar)" alt="" />
        <span v-else-if="profile" class="avatar-initials">{{ avatarInitials(profile.fullName || profile.username) || '?' }}</span>
        <svg v-else viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="9" r="4" /><path d="M4 21c1.6-4.5 5.2-7 8-7s6.4 2.5 8 7Z" />
        </svg>
        <span v-if="avatarUploading" class="avatar-spinner"></span>
        <span class="avatar-edit-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 16V4M12 4l-4 4M12 4l4 4" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
        </span>
      </button>
      <input ref="avatarInput" type="file" accept="image/*" class="avatar-file-input" @change="onAvatarFileChange" />
      <div class="account-info">
        <p v-if="profile" class="name">{{ profile.fullName || profile.username }}</p>
        <p v-else class="name-error">Profile could not be loaded.</p>
        <p v-if="profile?.phoneNumber" class="phone">{{ profile.phoneNumber }}</p>
        <p v-if="presenceError" class="presence-error">{{ presenceError }}</p>
        <span v-else-if="presenceStatusText" class="presence-badge" :class="{ online: isOnline }">
          <span class="presence-dot"></span>{{ presenceStatusText }}
        </span>
      </div>
    </div>

    <main class="page-body">
      <section class="settings-section">
        <h2>Settings</h2>
        <ul class="settings-list">
          <li>
            <button type="button" @click="showEditProfile = true">
              <span>Edit profile</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </li>
          <li>
            <button type="button" @click="showChangePassword = true">
              <span>Change password</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </li>
          <li>
            <button type="button" @click="router.push({ name: 'device-gps' })">
              <span>Device &amp; GPS</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </li>
        </ul>
      </section>

      <section class="settings-section status-section">
        <h2>Service Status</h2>
        <ul class="settings-list">
          <li class="status-row">
            <span>Payment service</span>
            <span class="status-badge" :class="paymentServiceStatus">
              <span class="status-dot"></span>
              {{ paymentServiceStatus === 'checking' ? 'Checking…' : paymentServiceStatus === 'online' ? 'Online' : 'Unreachable' }}
            </span>
          </li>
        </ul>
      </section>

      <button type="button" class="logout" @click="onLogout">Log out</button>
    </main>

    <p v-if="toastMessage" class="toast">{{ toastMessage }}</p>

    <EditProfileSheet v-if="showEditProfile" @close="showEditProfile = false" @saved="onProfileSaved" />
    <ChangePasswordSheet v-if="showChangePassword" @close="showChangePassword = false" @changed="onPasswordChanged" />
  </div>
</template>

<style scoped>
.page-header {
  padding: 24px 20px 90px;
  background: var(--green);
  border-radius: 0 0 32px 32px;
}
.page-header h1 {
  margin: 0;
  color: #fff;
  font: 700 1.4rem var(--heading);
}
.account-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: calc(100% - 40px);
  max-width: 440px;
  margin: -58px auto 0;
  padding: 20px;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}
.avatar-placeholder {
  position: relative;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--wash);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--line);
  overflow: visible;
  cursor: pointer;
}
.avatar-placeholder:disabled {
  cursor: default;
}
.avatar-placeholder svg {
  width: 78%;
  height: 78%;
}
.avatar-placeholder img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.avatar-initials {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  font: 700 1.1rem var(--heading);
  color: #fff;
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
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border: 2px solid rgba(255, 255, 255, 0.4);
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
  width: 20px;
  height: 20px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
}
.avatar-edit-badge svg {
  width: 11px;
  height: 11px;
}
.avatar-file-input {
  display: none;
}
.account-info {
  min-width: 0;
}
.name {
  margin: 0 0 2px;
  font: 700 1rem var(--heading);
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.phone {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.name-error {
  margin: 0;
  color: var(--muted);
  font: 500 0.9rem var(--sans);
}
.presence-error {
  margin: 6px 0 0;
  color: #e33;
  font: 600 0.75rem var(--sans);
}
.presence-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  padding: 3px 9px 3px 7px;
  border-radius: 999px;
  background: var(--wash);
  color: var(--muted);
  font: 600 0.72rem var(--sans);
}
.presence-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.presence-badge.online {
  color: var(--green);
}
.page-body {
  padding: 32px 16px 40px;
  max-width: 480px;
  margin: 0 auto;
}
.settings-section {
  margin: 0;
  padding: 0;
}
.settings-section h2 {
  margin: 0 4px 8px;
  color: var(--muted);
  font: 700 0.78rem var(--sans);
}
.settings-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--line);
}
.settings-list li + li {
  border-top: 1px solid var(--line);
}
.settings-list button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border: none;
  background: transparent;
  color: var(--ink);
  font: 500 0.9rem var(--sans);
  cursor: pointer;
  text-align: left;
}
.settings-list button svg {
  width: 18px;
  height: 18px;
  color: var(--muted);
}
.status-section {
  margin-top: 24px;
}
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  color: var(--ink);
  font: 500 0.9rem var(--sans);
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font: 700 0.78rem var(--sans);
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.status-badge.checking {
  color: var(--muted);
}
.status-badge.online {
  color: var(--green);
}
.status-badge.offline {
  color: #e33;
}
.logout {
  display: block;
  width: 100%;
  margin: 32px 0 0;
  padding: 15px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 0.95rem var(--sans);
  cursor: pointer;
}
.toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 300;
  max-width: calc(100% - 48px);
  margin: 0;
  padding: 12px 18px;
  border-radius: 12px;
  background: var(--ink);
  color: #fff;
  text-align: center;
  font: 600 0.85rem var(--sans);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
  transform: translateX(-50%);
}
</style>
