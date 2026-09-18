import { ref } from 'vue';
import { getProfile, loginDriver } from '@/api/auth';
import { setUnauthorizedHandler } from '@/api/graphql';
import { DEV_BYPASS_AUTH } from '@/config';
import router from '@/router';
import { useAuthStore } from '@/stores/auth';
import type { AuthUser, UserProfile } from '@/types';

const DRIVER_STORAGE_KEY = 'driver-id-map-app:driverAuth';
const DEV_BYPASS_TOKEN = 'dev-bypass-token';

async function loginWithSampleProfile(): Promise<{ user: AuthUser; token: string; profile: UserProfile }> {
  const res = await fetch('/driver-profile.sample.json');
  const profile = (await res.json()) as UserProfile;
  return {
    user: { id: profile.id, fullName: profile.fullName },
    token: DEV_BYPASS_TOKEN,
    profile,
  };
}

interface StoredAuth {
  token: string;
  user: AuthUser;
}

function readStored(key: string): StoredAuth | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: StoredAuth | null): void {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // localStorage unavailable (private mode, etc.) — auth just won't persist across reloads.
  }
}

const storedDriver = readStored(DRIVER_STORAGE_KEY);

const driverToken = ref<string>(storedDriver?.token ?? '');
const driverUser = ref<AuthUser | null>(storedDriver?.user ?? null);
const driverProfile = ref<UserProfile | null>(null);
const driverLoginError = ref<string>('');
const driverLoggingIn = ref(false);

// Was only clearing the driver-token half of the session and leaving the
// driver stranded on whatever page they were on — useAuthStore's accessToken
// stayed valid-looking, so the router's requiresAuth guard never kicked them
// back to /login. Now mirrors lib/graphql-request.ts's auth-error handling:
// clear both halves of the session and actually redirect.
function forceLogout(): void {
  driverToken.value = '';
  driverUser.value = null;
  driverProfile.value = null;
  writeStored(DRIVER_STORAGE_KEY, null);
  driverLoginError.value = 'Your session expired. Please log in again.';

  useAuthStore().logout();
  if (router.currentRoute.value.name !== 'login') {
    router.push({ name: 'login' });
  }
}

setUnauthorizedHandler(forceLogout);

export function useAuth() {
  async function loginAsDriver(phoneNumber: string, password: string): Promise<boolean> {
    driverLoginError.value = '';
    driverLoggingIn.value = true;
    try {
      if (DEV_BYPASS_AUTH) {
        const { user, token, profile } = await loginWithSampleProfile();
        driverToken.value = token;
        driverUser.value = user;
        driverProfile.value = profile;
        writeStored(DRIVER_STORAGE_KEY, { token, user });
        return true;
      }

      const { user, token } = await loginDriver(phoneNumber, password);
      driverToken.value = token;
      driverUser.value = user;
      writeStored(DRIVER_STORAGE_KEY, { token, user });
      try {
        driverProfile.value = await getProfile(token);
      } catch {
        // profile is a nice-to-have — a fetch failure here shouldn't fail the login itself.
      }
      return true;
    } catch (err) {
      driverLoginError.value = err instanceof Error ? err.message : 'Login failed';
      return false;
    } finally {
      driverLoggingIn.value = false;
    }
  }

  function logoutDriver(): void {
    driverToken.value = '';
    driverUser.value = null;
    driverProfile.value = null;
    driverLoginError.value = '';
    writeStored(DRIVER_STORAGE_KEY, null);
  }

  // Bridges the main app login (Pinia's useAuthStore, driven by LoginPage's
  // loginDriver call) into this driver-token/driverUser pair, so features built
  // against useAuth() — useDriverPresence's online toggle, the DriverPanel —
  // work off the same session instead of requiring a second, separate
  // DriverPanel login for the same person.
  async function setSession(token: string, user: AuthUser): Promise<void> {
    driverLoginError.value = '';
    driverToken.value = token;
    driverUser.value = user;
    writeStored(DRIVER_STORAGE_KEY, { token, user });
    try {
      driverProfile.value = await getProfile(token);
    } catch {
      // profile is a nice-to-have — a fetch failure here shouldn't fail the bridge.
    }
  }

  return {
    driverToken,
    driverUser,
    driverProfile,
    driverLoginError,
    driverLoggingIn,
    loginAsDriver,
    logoutDriver,
    setSession,
  };
}
