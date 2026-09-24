import { ref } from 'vue';
import { useGpsStore } from '../stores/gps';
import type { RouteSortParams } from '../utils/geo';

export type SortMode = 'newest' | 'nearest';

// A fix this old is still good enough as the origin for the server's distances.
const ORIGIN_FIX_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Newest / Nearest for the driver's stop lists (Pickups, Deliveries). The Order Service
 * does the sorting (`routeSort` on getOrderListByUser / getDeliveryList) — the app only
 * keeps the choice, reloads when it changes, and sends the phone's recent GPS fix (if it
 * has one; never prompts) so "nearest" is measured from where the driver is now. Without
 * it the server uses the driver's last location from the Location Service.
 */
export function useRouteSort(reload: () => void) {
  const gps = useGpsStore();
  const sortBy = ref<SortMode>('nearest');

  function toggle(): void {
    sortBy.value = sortBy.value === 'nearest' ? 'newest' : 'nearest';
    reload();
  }

  function params(): RouteSortParams {
    const fix = gps.usableFix(ORIGIN_FIX_MAX_AGE_MS);
    return {
      routeSort: sortBy.value === 'nearest' ? 'NEAREST' : 'NEWEST',
      ...(fix ? { originLat: fix.lat, originLon: fix.lon } : {}),
    };
  }

  return { sortBy, toggle, params };
}
