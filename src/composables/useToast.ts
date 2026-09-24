import { onBeforeUnmount, ref } from 'vue';

export type ToastType = 'success' | 'error';

// One short-lived message per page, rendered by <AppToast>. Calling show() again
// replaces the current message and restarts its timer.
export function useToast(durationMs = 3500) {
  const message = ref('');
  const type = ref<ToastType>('success');
  let timer: ReturnType<typeof setTimeout> | undefined;

  function show(text: string, kind: ToastType = 'success'): void {
    message.value = text;
    type.value = kind;
    clearTimeout(timer);
    timer = setTimeout(() => (message.value = ''), durationMs);
  }

  function clear(): void {
    clearTimeout(timer);
    message.value = '';
  }

  onBeforeUnmount(() => clearTimeout(timer));

  return { message, type, show, clear };
}
