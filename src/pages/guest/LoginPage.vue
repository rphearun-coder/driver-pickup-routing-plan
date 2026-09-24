<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { loginDriver } from '../../api/auth.ts';
import { useAuthStore } from '../../stores/auth.ts';
import { useAuth } from '../../composables/useAuth';
import PhoneNumberInput from '../../components/PhoneNumberInput.vue';
import BrandLogo from '../../components/BrandLogo.vue';

const phone = ref('+85515831198');
const password = ref('12345');
const showPassword = ref(false);
const error = ref('');
const loading = ref(false);

const auth = useAuthStore();
const { setSession } = useAuth();
const router = useRouter();

async function onSubmit() {
  error.value = '';
  loading.value = true;
  try {
    const { user, token } = await loginDriver(phone.value, password.value);
    auth.setToken(token);
    auth.setUser({
      id: user.id,
      username: user.username ?? '',
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      userType: user.userType ?? 'DRIVER',
      status: user.status ?? 'ACTIVE',
      roles: [user.userType ?? 'DRIVER'],
    });
    // Bridges this session into useAuth()'s driverToken/driverUser too, so the
    // Home page's online toggle and the live map's DriverPanel work off the
    // same login instead of needing a second, separate DriverPanel sign-in.
    await setSession(token, { id: user.id, username: user.username, fullName: user.fullName });
    router.push({ name: 'splash' });
  } catch (err: any) {
    error.value = err?.message ?? 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-screen">
    <div class="brand">
      <BrandLogo :size="96" />
      <h1>Driver Login</h1>
    </div>

    <form class="login-form" @submit.prevent="onSubmit">
      <PhoneNumberInput v-model="phone" placeholder="Phone number" />
      <div class="pin-field">
        <input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          inputmode="numeric"
          placeholder="PIN"
          required
        />
        <button
          type="button"
          class="toggle-visibility"
          :aria-label="showPassword ? 'Hide PIN' : 'Show PIN'"
          @click="showPassword = !showPassword"
        >
          <svg v-if="showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <path d="M1 1l22 22" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" class="submit" :disabled="loading">
        {{ loading ? 'Signing in...' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login-screen {
  min-height: 100svh;
  max-width: 480px;
  margin: 0 auto;
  padding: 32px 16px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
}
.brand h1 {
  font: 700 1.3rem var(--heading);
  color: var(--ink);
  margin: 0;
  text-align: center;
}
.login-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pin-field {
  display: flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  padding: 4px 16px;
}
.pin-field input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  padding: 14px 0;
  font: 500 16px var(--sans); /* iOS Safari auto-zooms on focus if an input's font-size is under 16px */
  color: var(--ink);
  background: transparent;
}
.pin-field input::placeholder {
  color: var(--muted);
}
.toggle-visibility {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.toggle-visibility svg {
  width: 20px;
  height: 20px;
}
.submit {
  margin-top: 16px;
  padding: 15px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 0.95rem var(--sans);
  cursor: pointer;
}
.submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.error {
  color: var(--red);
  font-size: 0.8rem;
  margin: 0;
}
</style>
