<template>
  <div class="phone-input">
    <span class="phone-prefix">{{ countryCode }}</span>
    <input
      v-model="localNumber"
      type="tel"
      inputmode="numeric"
      autocomplete="tel-national"
      :placeholder="placeholder"
      required
      @input="emitValue"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const COUNTRY_CODE = '+855';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    countryCode?: string;
    placeholder?: string;
  }>(),
  {
    modelValue: '',
    countryCode: COUNTRY_CODE,
    placeholder: '70 708 595',
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

function stripCode(value: string): string {
  return value.startsWith(props.countryCode) ? value.slice(props.countryCode.length) : value;
}

const localNumber = ref(stripCode(props.modelValue));

watch(
  () => props.modelValue,
  (value) => {
    const stripped = stripCode(value);
    if (stripped !== localNumber.value) localNumber.value = stripped;
  }
);

function emitValue(): void {
  const codeDigits = props.countryCode.replace(/\D/g, '');
  let digits = localNumber.value.replace(/[^\d]/g, '');

  // Typing/pasting the full number (with country code, "+" or not) into this field
  // should still work instead of duplicating the prefix — strip it back off.
  if (digits.startsWith(codeDigits) && digits.length > codeDigits.length) {
    digits = digits.slice(codeDigits.length);
  }

  // Browser autofill (autocomplete="tel-national") fills the national format with
  // its leading trunk "0" (e.g. "070708595") — international format drops it.
  if (digits.startsWith('0') && digits.length > 1) {
    digits = digits.slice(1);
  }

  localNumber.value = digits;
  emit('update:modelValue', digits ? `${props.countryCode}${digits}` : '');
}
</script>

<style scoped>
.phone-input {
  display: flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  padding: 4px 16px;
}
.phone-input:focus-within {
  border-color: var(--green);
}
.phone-prefix {
  flex-shrink: 0;
  padding-right: 12px;
  margin-right: 12px;
  border-right: 1px solid var(--line);
  color: var(--muted);
  font: 700 0.85rem var(--sans);
  white-space: nowrap;
}
.phone-input input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  padding: 14px 0;
  font: 500 16px var(--sans); /* iOS Safari auto-zooms on focus if an input's font-size is under 16px */
  color: var(--ink);
  background: transparent;
}
.phone-input input::placeholder {
  color: var(--muted);
}
</style>
