<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { changeMyPassword } from '../api/users';

const emit = defineEmits<{ close: []; changed: [] }>();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const saving = ref(false);
const error = ref('');

const canSubmit = computed(() => !!currentPassword.value && !!newPassword.value && !saving.value);

async function onSubmit(): Promise<void> {
  error.value = '';
  if (newPassword.value !== confirmPassword.value) {
    error.value = "New passwords don't match.";
    return;
  }
  saving.value = true;
  try {
    await changeMyPassword(currentPassword.value, newPassword.value);
    emit('changed');
  } catch (err: any) {
    error.value = err.message ?? 'Failed to change password.';
  } finally {
    saving.value = false;
  }
}

const previousBodyOverflow = document.body.style.overflow;

onMounted(() => {
  document.body.style.overflow = 'hidden';
});

onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <Teleport to="#overlay-root">
    <div class="sheet-backdrop" @click.self="emit('close')">
      <div class="sheet">
        <span class="drag-handle"></span>
        <h2 class="sheet-title">Change Password</h2>

        <label class="field-label" for="change-pw-current">Current password</label>
        <input id="change-pw-current" v-model="currentPassword" type="password" class="text-input" placeholder="Current password" autocomplete="current-password" />

        <label class="field-label" for="change-pw-new">New password</label>
        <input id="change-pw-new" v-model="newPassword" type="password" class="text-input" placeholder="New password" autocomplete="new-password" />

        <label class="field-label" for="change-pw-confirm">Confirm new password</label>
        <input id="change-pw-confirm" v-model="confirmPassword" type="password" class="text-input" placeholder="Confirm new password" autocomplete="new-password" />

        <p v-if="error" class="error-text">{{ error }}</p>

        <button type="button" class="confirm-btn" :disabled="!canSubmit" @click="onSubmit">
          {{ saving ? 'Saving...' : 'Change Password' }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  overscroll-behavior: contain;
}
.sheet {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: 90%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 20px 24px;
  border-radius: 24px 24px 0 0;
  background: #fff;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2);
}
.drag-handle {
  display: block;
  width: 40px;
  height: 4px;
  margin: 0 auto 16px;
  border-radius: 999px;
  background: var(--line);
}
.sheet-title {
  margin: 0 0 16px;
  font: 700 1.05rem var(--heading);
  color: var(--ink);
  text-align: center;
}
.field-label {
  display: block;
  margin: 0 2px 6px;
  color: var(--muted);
  font: 700 0.72rem var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.text-input {
  display: block;
  width: 100%;
  padding: 14px 16px;
  margin-bottom: 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  color: var(--ink);
  font: 500 16px var(--sans); /* iOS Safari auto-zooms on focus if an input's font-size is under 16px */
}
.text-input::placeholder {
  color: var(--muted);
}
.error-text {
  margin-top: 12px;
  color: var(--red);
  font-size: 0.8rem;
  text-align: center;
}
.confirm-btn {
  width: 100%;
  margin-top: 20px;
  padding: 15px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #fff;
  font: 700 0.95rem var(--sans);
  cursor: pointer;
}
.confirm-btn:disabled {
  background: #a9d9c1;
  cursor: not-allowed;
}
</style>
