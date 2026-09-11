import { ref, watch, type Ref } from 'vue';
import { getOnlineStatus, toggleOnlineStatus } from '@/api/driver-online-status';
import { DEV_BYPASS_AUTH } from '@/config';

export interface UseDriverPresenceOptions {
  currentDriverId: Ref<string>;
  driverToken: Ref<string>;
  onOnlineChange?: (online: boolean) => void;
}

export function useDriverPresence({ currentDriverId, driverToken, onOnlineChange }: UseDriverPresenceOptions) {
  const isOnline = ref(false);
  const isSyncing = ref(false);
  const presenceError = ref('');

  function setOnline(value: boolean): void {
    if (isOnline.value === value) return;
    isOnline.value = value;
    onOnlineChange?.(isOnline.value);
  }

  async function syncFromServer(): Promise<void> {
    if (!driverToken.value) return;
    if (DEV_BYPASS_AUTH) return; // local toggle only; nothing to sync from
    try {
      const status = await getOnlineStatus(driverToken.value);
      setOnline(status === 'ONLINE');
    } catch (err) {
      presenceError.value = err instanceof Error ? err.message : 'Failed to load online status';
    }
  }

  watch(driverToken, (token) => (token ? syncFromServer() : setOnline(false)), { immediate: true });

  async function toggleOnline(): Promise<void> {
    if (!currentDriverId.value) return;
    if (!driverToken.value) {
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
      const status = await toggleOnlineStatus(driverToken.value);
      setOnline(status === 'ONLINE');
    } catch (err) {
      presenceError.value = err instanceof Error ? err.message : 'Failed to update online status';
    } finally {
      isSyncing.value = false;
    }
  }

  return {
    isOnline,
    isSyncing,
    presenceError,
    toggleOnline,
  };
}
