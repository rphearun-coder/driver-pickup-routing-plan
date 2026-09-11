<template>
  <form class="login-form" @submit.prevent="submitLogin">
    <p class="tagline">Log in to go online.</p>
    <PhoneNumberInput v-model="phoneNumber" />
    <input v-model="password" type="password" placeholder="Password" autocomplete="current-password" required />
    <p v-if="loginError" class="tagline error">{{ loginError }}</p>
    <button type="submit" class="btn btn-online" :disabled="loggingIn">
      {{ loggingIn ? 'Logging in…' : 'Log in' }}
    </button>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import PhoneNumberInput from './PhoneNumberInput.vue';

withDefaults(
  defineProps<{
    loginError?: string;
    loggingIn?: boolean;
  }>(),
  {
    loginError: '',
    loggingIn: false,
  }
);

const emit = defineEmits<{
  login: [payload: { phoneNumber: string; password: string }];
}>();

const phoneNumber = ref('+85570708595');
const password = ref('12345');

function submitLogin(): void {
  emit('login', { phoneNumber: phoneNumber.value.trim(), password: password.value });
}
</script>
