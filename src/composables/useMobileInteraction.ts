import { onBeforeUnmount } from 'vue';

export const MOBILE_INTERACTION_EVENT = 'jalat:mobile-interaction';

export function useMobileInteraction(onInteraction: () => void): void {
  if (typeof window === 'undefined') return;

  window.addEventListener(MOBILE_INTERACTION_EVENT, onInteraction);
  onBeforeUnmount(() => window.removeEventListener(MOBILE_INTERACTION_EVENT, onInteraction));
}
