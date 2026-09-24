<template>
  <div
    class="pull-indicator"
    :class="{ 'pull-indicator--settling': !isPulling }"
    :style="{ height: (isRefreshing ? 44 : pullDistance) + 'px' }"
  >
    <div class="pull-indicator__spinner" :class="{ 'pull-indicator__spinner--spin': isRefreshing }"></div>
  </div>
  <RouterView :key="refreshKey" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterView } from "vue-router";
import { useAuthStore } from "./stores/auth";
import { useAuth } from "./composables/useAuth";
import { refreshDriverLocation, useDriverLocationPublishing } from "./composables/useDriverLocationPublishing";
import { MOBILE_INTERACTION_EVENT } from "./composables/useMobileInteraction";
import { usePullToRefresh } from "./composables/usePullToRefresh";
import { getMyProfile } from "./api/users";

// Forces RouterView to unmount/remount the current page, re-running its own data
// fetches — the same "pull down to refresh what's on screen" behavior a native
// app gives you, without tearing down app-wide singletons (MQTT connection, auth).
const refreshKey = ref(0);
const MIN_REFRESH_VISIBLE_MS = 500;

const { pullDistance, isRefreshing, isPulling } = usePullToRefresh({
  container: () => document.getElementById('app'),
  onRefresh: async () => {
    refreshKey.value++;
    await new Promise((resolve) => setTimeout(resolve, MIN_REFRESH_VISIBLE_MS));
  },
});

// Starts the app-wide live location publisher (see useDriverLocationPublishing.ts) —
// it's a singleton keyed off useDriverPresence's isOnline, so simply importing/calling
// it here means the driver's position keeps publishing on every page from the moment
// they go online, not just while they're sitting on the map page.
useDriverLocationPublishing();

let lastMobileInteractionAt = 0;
let appScrollContainer: HTMLElement | null = null;

function handleMobileInteraction(): void {
  const now = Date.now();
  if (now - lastMobileInteractionAt < 1500) return;
  lastMobileInteractionAt = now;
  window.dispatchEvent(new Event(MOBILE_INTERACTION_EVENT));
  refreshDriverLocation();
}

onMounted(() => {
  appScrollContainer = document.getElementById('app');
  appScrollContainer?.addEventListener('scroll', handleMobileInteraction, { passive: true });
  appScrollContainer?.addEventListener('touchmove', handleMobileInteraction, { passive: true });
});

onBeforeUnmount(() => {
  appScrollContainer?.removeEventListener('scroll', handleMobileInteraction);
  appScrollContainer?.removeEventListener('touchmove', handleMobileInteraction);
});

const authStore = useAuthStore();
const { driverToken, setSession, logoutDriver } = useAuth();

async function bridgeSession(token: string): Promise<void> {
  if (!authStore.user) {
    try {
      authStore.setUser(await getMyProfile());
    } catch {
      return; 
    }
  }
  if (authStore.user) {
    const { id, username, fullName } = authStore.user;
    setSession(token, { id, username, fullName });
  }
}

watch(
  () => authStore.accessToken,
  (token) => {
    if (token && token !== driverToken.value) {
      bridgeSession(token);
    } else if (!token && driverToken.value) {
      logoutDriver();
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.pull-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  height: 0;
  flex-shrink: 0;
}
.pull-indicator--settling {
  transition: height 0.2s ease-out;
}
.pull-indicator__spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--line);
  border-top-color: var(--orange);
  border-radius: 50%;
  opacity: 0.85;
}
.pull-indicator__spinner--spin {
  animation: pull-indicator-spin 0.8s linear infinite;
}
@keyframes pull-indicator-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
