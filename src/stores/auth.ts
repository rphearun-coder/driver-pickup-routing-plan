import { defineStore } from 'pinia';
import type { AuthenticatedUser } from '../types/api';

const TOKEN_STORAGE_KEY = 'accessToken';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: localStorage.getItem(TOKEN_STORAGE_KEY) as string | null,
    user: null as AuthenticatedUser | null,
  }),
  getters: {
    isAuthenticated: (state) => !!state.accessToken,
    hasRole: (state) => (role: string) => !!state.user?.roles?.includes(role),
  },
  actions: {
    setToken(accessToken: string) {
      this.accessToken = accessToken;
      localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    },
    setUser(user: AuthenticatedUser) {
      this.user = user;
    },
    logout() {
      this.accessToken = null;
      this.user = null;
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    },
  },
});
