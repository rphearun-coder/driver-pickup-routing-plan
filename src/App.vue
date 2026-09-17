<template>
  <RouterView />
</template>

<script setup lang="ts">
import { watch } from "vue";
import { RouterView } from "vue-router";
import { useAuthStore } from "./stores/auth";
import { useAuth } from "./composables/useAuth";
import { useDriverLocationPublishing } from "./composables/useDriverLocationPublishing";
import { getMyProfile } from "./api/users";

// Starts the app-wide live location publisher (see useDriverLocationPublishing.ts) —
// it's a singleton keyed off useDriverPresence's isOnline, so simply importing/calling
// it here means the driver's position keeps publishing on every page from the moment
// they go online, not just while they're sitting on the map page.
useDriverLocationPublishing();

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
