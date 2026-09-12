<template>
  <section class="mode-strip" aria-label="Location mode">
    <div class="mode-strip-copy">
      <span
        class="mode-strip-dot"
        :class="modelValue === 'live' ? 'live' : 'test'"
      ></span>
      <span>Mode</span>
      <strong>{{ modelValue === "live" ? "Live" : "Test" }}</strong>
    </div>
    <div class="mode-switch" role="group" aria-label="Switch location mode">
      <button
        type="button"
        :class="{ active: modelValue === 'test' }"
        :aria-pressed="modelValue === 'test'"
        @click="selectMode('test')"
      >
        Test
      </button>
      <button
        type="button"
        :class="{ active: modelValue === 'live' }"
        :aria-pressed="modelValue === 'live'"
        @click="selectMode('live')"
      >
        Live
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
type LocationMode = "test" | "live";

const props = withDefaults(
  defineProps<{
    modelValue?: LocationMode;
  }>(),
  {
    modelValue: "test",
  },
);

const emit = defineEmits<{
  "update:modelValue": [mode: LocationMode];
}>();

function selectMode(mode: LocationMode): void {
  if (mode !== props.modelValue) emit("update:modelValue", mode);
}
</script>
