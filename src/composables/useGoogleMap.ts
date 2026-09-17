import { shallowRef, type Ref } from 'vue';
import { loadGoogleMaps } from '@/map/loadGoogleMaps';
import type { LatLng } from '@/types';

export interface UseGoogleMapOptions {
  center: LatLng;
  zoom: number;
  disableDefaultUI?: boolean;
}

export function useGoogleMap(mapEl: Ref<HTMLDivElement | null>, options: UseGoogleMapOptions) {
  const google = shallowRef<any>(null);
  const map = shallowRef<any>(null);

  async function init(): Promise<{ google: any; map: any }> {
    google.value = await loadGoogleMaps();
    map.value = new google.value.maps.Map(mapEl.value, {
      zoom: options.zoom,
      center: options.center,
      disableDefaultUI: options.disableDefaultUI ?? false,
    });
    return { google: google.value, map: map.value };
  }

  return { google, map, init };
}
