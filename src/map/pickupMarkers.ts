import { createInfoWindowCloseButton, ensureInfoWindowStyleOverride } from './infoWindowChrome';
import type { OrderStatus, PickupPoint } from '../types';

const WAREHOUSE_RECEIVED_COLOR = '#00897b';
const HEADING_TO_PICKUP_COLOR = '#1a73e8';

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING: '#9aa0a6',
  IN_PROGRESS: HEADING_TO_PICKUP_COLOR,
  PICKED_UP: WAREHOUSE_RECEIVED_COLOR,
  ABORT_PICK_UP: '#ef6c00',
  CANCELLED: '#c62828',
  DELETED: '#616161',
  ON_ROUTE: HEADING_TO_PICKUP_COLOR,
  REGISTERED: WAREHOUSE_RECEIVED_COLOR,
  PRINTED: WAREHOUSE_RECEIVED_COLOR,
};
const DEFAULT_STATUS_COLOR = '#8e24aa';

const COMPLETED_STATUSES: ReadonlySet<OrderStatus> = new Set(['PICKED_UP', 'REGISTERED', 'PRINTED']);

export function isCompletedStatus(status?: OrderStatus): boolean {
  return !!status && COMPLETED_STATUSES.has(status);
}

function statusColor(status?: OrderStatus): string {
  return (status && STATUS_COLORS[status]) ?? DEFAULT_STATUS_COLOR;
}

export function statusLabel(status?: OrderStatus): string | null {
  if (!status) return null;
  const words = status
    .split('_')
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(' ');
  return isCompletedStatus(status) ? `✓ ${words}` : words;
}

function buildInfoWindowContent(pickup: PickupPoint, index: number, onClose: () => void): HTMLDivElement {
  const card = document.createElement('div');
  card.style.cssText = 'font-family:system-ui,sans-serif;min-width:160px;max-width:220px;position:relative;';
  card.appendChild(createInfoWindowCloseButton(onClose));

  const body = document.createElement('div');
  body.style.cssText = 'padding-right:20px;';

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

  const title = document.createElement('span');
  title.textContent = pickup.partnerName ?? pickup.label ?? `Pickup ${index + 1}`;
  title.style.cssText = 'font-size:14px;font-weight:600;color:#202124;';
  titleRow.appendChild(title);

  if (pickup.status) {
    const badge = document.createElement('span');
    badge.textContent = statusLabel(pickup.status);
    badge.style.cssText =
      `display:inline-block;padding:2px 8px;border-radius:999px;` +
      `font-size:11px;font-weight:600;color:#fff;background:${statusColor(pickup.status)};`;
    titleRow.appendChild(badge);
  }

  body.appendChild(titleRow);

  const address = document.createElement('div');
  address.textContent = pickup.address ?? 'Locating address…';
  address.style.cssText = 'font-size:12px;color:#5f6368;margin-top:2px;';
  body.appendChild(address);

  const parts = [pickup.estimatedDistanceMetersText, pickup.estimatedDurationSecondsText].filter(Boolean);
  if (parts.length) {
    const stats = document.createElement('div');
    stats.textContent = parts.join(' · ');
    stats.style.cssText = 'font-size:12px;color:#5f6368;margin-top:4px;';
    body.appendChild(stats);
  }

  card.appendChild(body);
  return card;
}

function reverseGeocode(geocoder: any, lat: number, lng: number): Promise<string | null> {
  return new Promise((resolve) => {
    geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
      resolve(status === 'OK' && results?.[0] ? results[0].formatted_address : null);
    });
  });
}

export function createPickupMarkerLayer(google: any, map: any) {
  ensureInfoWindowStyleOverride();
  const markers: any[] = [];
  const infoWindow = new google.maps.InfoWindow({ minWidth: 180 });
  const geocoder = new google.maps.Geocoder();
  let openPickup: PickupPoint | null = null;
  infoWindow.addListener('closeclick', () => (openPickup = null));

  function setPickups(pickups: PickupPoint[]): void {
    clear();
    pickups.forEach((pickup, index) => {
      const [origin] = pickup.path;
      if (!origin) return;

      const marker = new google.maps.Marker({
        position: { lat: Number(origin.lat), lng: Number(origin.lng) },
        map,
        title: pickup.partnerName ?? pickup.label,
        zIndex: 500,
        label: {
          text: isCompletedStatus(pickup.status) ? '✓' : String(index + 1),
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: '700',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: statusColor(pickup.status),
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });

      const closeInfoWindow = () => {
        infoWindow.close();
        openPickup = null;
      };

      marker.addListener('click', () => {
        openPickup = pickup;
        infoWindow.setContent(buildInfoWindowContent(pickup, index, closeInfoWindow));
        infoWindow.open({ map, anchor: marker });
      });

      reverseGeocode(geocoder, Number(origin.lat), Number(origin.lng)).then((address) => {
        pickup.address = address ?? 'Address unavailable';
        if (openPickup === pickup) {
          infoWindow.setContent(buildInfoWindowContent(pickup, index, closeInfoWindow));
        }
      });

      markers.push(marker);
    });
  }

  function clear(): void {
    infoWindow.close();
    openPickup = null;
    markers.forEach((marker) => marker.setMap(null));
    markers.length = 0;
  }

  return { setPickups };
}

