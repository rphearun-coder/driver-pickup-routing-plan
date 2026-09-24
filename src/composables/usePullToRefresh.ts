import { onBeforeUnmount, onMounted, ref } from 'vue';

const PULL_THRESHOLD_PX = 70;
const MAX_PULL_PX = 90;
const RESISTANCE = 0.5;

export interface UsePullToRefreshOptions {
  // Lazily resolved — the scroll container (#app) may not exist yet when this
  // composable is set up, since App.vue's own onMounted hasn't run first.
  container: () => HTMLElement | null | undefined;
  onRefresh: () => void | Promise<void>;
}

export function usePullToRefresh({ container, onRefresh }: UsePullToRefreshOptions) {
  const pullDistance = ref(0);
  const isRefreshing = ref(false);
  // True only while a finger is actively dragging — distinct from isRefreshing so the
  // consumer can skip CSS transitions during the drag itself (must track 1:1 with the
  // finger) and only animate the snap-back/settle-into-place once the touch ends.
  const isPulling = ref(false);

  let el: HTMLElement | null = null;
  let startY = 0;
  let tracking = false;

  function handleTouchStart(event: TouchEvent): void {
    if (isRefreshing.value || !el || el.scrollTop > 0) return;
    tracking = true;
    isPulling.value = true;
    startY = event.touches[0].clientY;
  }

  function handleTouchMove(event: TouchEvent): void {
    if (!tracking || !el) return;
    const rawDelta = event.touches[0].clientY - startY;
    if (rawDelta <= 0 || el.scrollTop > 0) {
      tracking = false;
      isPulling.value = false;
      pullDistance.value = 0;
      return;
    }
    // Can only preventDefault on a non-passive listener — needed here to stop the
    // page itself scrolling/bouncing while the pull gesture is in progress.
    event.preventDefault();
    pullDistance.value = Math.min(rawDelta * RESISTANCE, MAX_PULL_PX);
  }

  async function handleTouchEnd(): Promise<void> {
    if (!tracking) return;
    tracking = false;
    isPulling.value = false;
    if (pullDistance.value < PULL_THRESHOLD_PX) {
      pullDistance.value = 0;
      return;
    }
    isRefreshing.value = true;
    try {
      await onRefresh();
    } finally {
      isRefreshing.value = false;
      pullDistance.value = 0;
    }
  }

  function handleTouchCancel(): void {
    tracking = false;
    isPulling.value = false;
    if (!isRefreshing.value) pullDistance.value = 0;
  }

  onMounted(() => {
    el = container() ?? null;
    if (!el) return;
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchCancel);
  });

  onBeforeUnmount(() => {
    if (!el) return;
    el.removeEventListener('touchstart', handleTouchStart);
    el.removeEventListener('touchmove', handleTouchMove);
    el.removeEventListener('touchend', handleTouchEnd);
    el.removeEventListener('touchcancel', handleTouchCancel);
  });

  return { pullDistance, isRefreshing, isPulling, PULL_THRESHOLD_PX };
}
