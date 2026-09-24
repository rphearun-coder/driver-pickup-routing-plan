import type { LatLng } from '@/types';

// Central Phnom Penh — used as the map's fallback center/zoom before any real
// driver position is known, on both the driver's own pickup map and the public
// tracking page.
export const DEFAULT_MAP_CENTER: LatLng = { lat: 11.525480965356625, lng: 104.90954542274423 };
export const DEFAULT_MAP_ZOOM = 12;
