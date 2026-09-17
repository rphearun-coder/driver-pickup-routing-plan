import { ref, watch } from 'vue';
import { getOnlineStatus, toggleOnlineStatus } from '@/api/driver-online-status';
import { DEV_BYPASS_AUTH } from '@/config';
import { useAuth } from '@/composables/useAuth';

// Singleton (module-level refs, mirrors useAuth.ts) so every page shares one
// online/offline state instead of each toggle owning its own copy — App.vue's
// location publisher and the Home/map pages' toggle buttons all read and
// drive the exact same isOnline.
const isOnline = ref(false);
const isSyncing = ref(false);
const presenceError = ref('');
const updatedAt = ref<string>('');

const { driverToken, driverUser } = useAuth();

function setOnline(value: boolean, at?: string): void {
  if (at) updatedAt.value = at;
  isOnline.value = value;
}

async function syncFromServer(): Promise<void> {
  if (!driverToken.value) return;
  if (DEV_BYPASS_AUTH) return; // local toggle only; nothing to sync from
  try {
    const { status, updatedAt: at } = await getOnlineStatus(driverToken.value);
    setOnline(status === 'ONLINE', at);
  } catch (err) {
    if (!driverToken.value) {
      setOnline(false);
      return;
    }
    presenceError.value = err instanceof Error ? err.message : 'Failed to load online status';
  }
}

watch(driverToken, (token) => (token ? syncFromServer() : setOnline(false)), { immediate: true });

async function toggleOnline(): Promise<void> {
  const currentDriverId = driverUser.value?.id || '';
  if (!currentDriverId || !driverToken.value) {
    presenceError.value = 'Log in as a driver first.';
    return;
  }

  presenceError.value = '';

  if (DEV_BYPASS_AUTH) {
    setOnline(!isOnline.value);
    return;
  }

  isSyncing.value = true;
  try {
    const { status, updatedAt: at } = await toggleOnlineStatus(driverToken.value);
    setOnline(status === 'ONLINE', at);
  } catch (err) {
    if (!driverToken.value) {
      setOnline(false);
      return;
    }
    presenceError.value = err instanceof Error ? err.message : 'Failed to update online status';
  } finally {
    isSyncing.value = false;
  }
}

export function useDriverPresence() {
  return {
    isOnline,
    isSyncing,
    presenceError,
    updatedAt,
    toggleOnline,
  };
}
