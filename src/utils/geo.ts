// Location helpers for the driver app. Distances, estimates and sorting (Nearest /
// Newest) are done by the Order Service — see RouteSortParams below and its own
// src/common/utils/geo.ts. This file only validates coordinates and formats the
// server's estimate text.

export interface LatLng {
  lat: number;
  lng: number;
}

/** A usable coordinate pair: both numbers, finite, and not the 0,0 "unset" placeholder. */
export function toLatLng(lat?: number | string | null, lng?: number | string | null): LatLng | null {
  if (lat == null || lng == null || lat === '' || lng === '') return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la === 0 && ln === 0) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return { lat: la, lng: ln };
}

/**
 * Sort order + optional origin for a driver's stop list, sent in the filter of
 * getOrderListByUser (Pickups) and getDeliveryList (Deliveries). The server sorts.
 */
export interface RouteSortParams {
  routeSort?: 'NEAREST' | 'NEWEST';
  originLat?: number;
  originLon?: number;
}

export interface DistanceParts {
  distanceText: string;
  durationText: string;
}

// The Order Service's pre-formatted text runs the number into the unit ("4.8km",
// "10min"); put the space back so it reads the same everywhere.
function withUnitSpacing(text: string): string {
  return text.replace(/(\d)([a-zA-Z])/g, '$1 $2');
}

/**
 * Distance / time text from the Order Service's route estimates (Pickups' orders and
 * Deliveries' parcels share the field names). Prefers the server's own text; falls back
 * to the raw meters/seconds when that text is empty.
 */
export function formatDistanceParts(
  meters?: number,
  seconds?: number,
  metersText?: string,
  secondsText?: string,
): DistanceParts {
  if (metersText && secondsText) {
    return { distanceText: withUnitSpacing(metersText), durationText: withUnitSpacing(secondsText) };
  }
  const km = (meters ?? 0) / 1000;
  const min = Math.round((seconds ?? 0) / 60);
  return { distanceText: `${km.toFixed(1)} km`, durationText: `${min} min` };
}
