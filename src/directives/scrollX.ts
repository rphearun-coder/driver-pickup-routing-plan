import type { Directive } from 'vue';

// v-scroll-x — makes a horizontal overflow row (filter chips etc.) reachable with a
// mouse, not just touch: a vertical wheel scrolls it sideways, and click-dragging
// pans it. A drag that actually moved swallows the click so it doesn't select a chip.
// Toggles `is-scrollable` / `at-end` classes so CSS can show the right-edge fade.

interface ScrollXState {
  onWheel: (e: WheelEvent) => void;
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onClickCapture: (e: MouseEvent) => void;
  onScroll: () => void;
  resize: ResizeObserver;
}

const DRAG_THRESHOLD_PX = 5;
const states = new WeakMap<HTMLElement, ScrollXState>();

function updateEdges(el: HTMLElement): void {
  const scrollable = el.scrollWidth > el.clientWidth + 1;
  el.classList.toggle('is-scrollable', scrollable);
  el.classList.toggle('at-end', !scrollable || el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
}

export const vScrollX: Directive<HTMLElement> = {
  mounted(el) {
    let startX = 0;
    let startLeft = 0;
    let pointerId: number | null = null;
    let dragged = false;

    const state: ScrollXState = {
      onWheel(e) {
        if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      },
      onPointerDown(e) {
        if (e.pointerType !== 'mouse' || e.button !== 0 || el.scrollWidth <= el.clientWidth) return;
        pointerId = e.pointerId;
        startX = e.clientX;
        startLeft = el.scrollLeft;
        dragged = false;
      },
      onPointerMove(e) {
        if (pointerId !== e.pointerId) return;
        const dx = e.clientX - startX;
        if (!dragged && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        if (!dragged) {
          dragged = true;
          el.setPointerCapture(e.pointerId);
          el.classList.add('is-dragging');
        }
        el.scrollLeft = startLeft - dx;
      },
      onPointerUp(e) {
        if (pointerId !== e.pointerId) return;
        pointerId = null;
        el.classList.remove('is-dragging');
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      },
      onClickCapture(e) {
        if (!dragged) return;
        dragged = false;
        e.stopPropagation();
        e.preventDefault();
      },
      onScroll: () => updateEdges(el),
      resize: new ResizeObserver(() => updateEdges(el)),
    };

    el.addEventListener('wheel', state.onWheel, { passive: false });
    el.addEventListener('pointerdown', state.onPointerDown);
    el.addEventListener('pointermove', state.onPointerMove);
    el.addEventListener('pointerup', state.onPointerUp);
    el.addEventListener('pointercancel', state.onPointerUp);
    el.addEventListener('click', state.onClickCapture, true);
    el.addEventListener('scroll', state.onScroll, { passive: true });
    state.resize.observe(el);
    states.set(el, state);
    updateEdges(el);
  },
  updated(el) {
    updateEdges(el);
  },
  unmounted(el) {
    const state = states.get(el);
    if (!state) return;
    el.removeEventListener('wheel', state.onWheel);
    el.removeEventListener('pointerdown', state.onPointerDown);
    el.removeEventListener('pointermove', state.onPointerMove);
    el.removeEventListener('pointerup', state.onPointerUp);
    el.removeEventListener('pointercancel', state.onPointerUp);
    el.removeEventListener('click', state.onClickCapture, true);
    el.removeEventListener('scroll', state.onScroll);
    state.resize.disconnect();
    states.delete(el);
  },
};
