<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getMyProfile } from '../api/users';
import { useAuthStore } from '../stores/auth';
import { useAuth } from '../composables/useAuth';
import { useDriverPresence } from '../composables/useDriverPresence';
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
  return `${isOnline.value ? 'Online' : 'Offline'} · updated ${time}`;
});
const profile = ref<AuthenticatedUser | null>(null);
const showEditProfile = ref(false);
const showChangePassword = ref(false);
const toastMessage = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;

async function loadProfile(): Promise<void> {
  try {
    profile.value = await getMyProfile();
  } catch {
    profile.value = null;
  }
}

onMounted(loadProfile);

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
      <div class="avatar-placeholder">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="9" r="4" /><path d="M4 21c1.6-4.5 5.2-7 8-7s6.4 2.5 8 7Z" />
        </svg>
      </div>
      <div class="account-info">
        <p v-if="profile" class="name">{{ profile.fullName || profile.username }}</p>
        <p v-else class="name-error">Profile could not be loaded.</p>
        <p v-if="profile?.phoneNumber" class="phone">{{ profile.phoneNumber }}</p>
      </div>
    </div>

    <p v-if="presenceError" class="presence-error">{{ presenceError }}</p>
    <p v-else-if="presenceStatusText" class="presence-status" :class="{ online: isOnline }">{{ presenceStatusText }}</p>

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
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--wash);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--line);
  overflow: hidden;
}
.avatar-placeholder svg {
  width: 78%;
  height: 78%;
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
.presence-error,
.presence-status {
  width: calc(100% - 40px);
  max-width: 440px;
  margin: 14px auto 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: #fff;
  font: 600 0.78rem var(--sans);
  text-align: center;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}
.presence-error {
  color: #e33;
}
.presence-status {
  color: var(--muted);
}
.presence-status.online {
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
