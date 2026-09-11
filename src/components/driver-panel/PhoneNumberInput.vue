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
