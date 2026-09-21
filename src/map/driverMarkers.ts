import { createInfoWindowCloseButton, ensureInfoWindowStyleOverride } from './infoWindowChrome';
import type { DriverLocation, LatLng } from '../types';

function ensurePulsingMarkerStyle(): void {
  if (document.getElementById('pulsing-marker-style')) return;
  const style = document.createElement('style');
  style.id = 'pulsing-marker-style';
  style.textContent = `
    .pulsing-marker {
      position: absolute;
      width: 0;
      height: 0;
      cursor: pointer;
    }
    .pulsing-marker-ring {
      position: absolute;
      top: 0;
      left: 0;
      width: 16px;
      height: 16px;
      margin: -8px 0 0 -8px;
      border-radius: 50%;
      background: transparent;
      border: 2px solid #1a9c4b;
      opacity: 0;
      pointer-events: none;
    }
    .pulsing-marker.online .pulsing-marker-ring {
      animation: pulsing-marker-pulse 2s cubic-bezier(0.2, 0.6, 0.4, 1) infinite;
    }
    .pulsing-marker.online .pulsing-marker-ring--delay1 {
      animation-delay: 0.66s;
    }
    .pulsing-marker.online .pulsing-marker-ring--delay2 {
      animation-delay: 1.33s;
    }
    .pulsing-marker-halo {
      position: absolute;
      top: 0;
      left: 0;
      width: 16px;
      height: 16px;
      margin: -8px 0 0 -8px;
      border-radius: 50%;
      background: #1a9c4b;
      opacity: 0;
      pointer-events: none;
    }
    .pulsing-marker.online .pulsing-marker-halo {
      animation: pulsing-marker-halo 2s ease-in-out infinite;
    }
    .pulsing-marker-dot {
      position: absolute;
      top: 0;
      left: 0;
      width: 16px;
      height: 16px;
      margin: -8px 0 0 -8px;
      border-radius: 50%;
      background: #1a9c4b;
      border: 2px solid #ffffff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
      transform-origin: center;
    }
    .pulsing-marker.online .pulsing-marker-dot {
      animation: pulsing-marker-breathe 2s ease-in-out infinite;
    }
    .pulsing-marker-dot.offline {
      background: #9aa0a6;
    }
    .pulsing-marker-icon {
      position: absolute;
      top: 0;
      left: 0;
      width: 16px;
      height: 16px;
      margin: -8px 0 0 -8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      line-height: 1;
      pointer-events: none;
      user-select: none;
    }
    @keyframes pulsing-marker-pulse {
      0% { transform: scale(1); opacity: 0.7; }
      100% { transform: scale(4.5); opacity: 0; }
    }
    @keyframes pulsing-marker-halo {
      0%, 100% { transform: scale(1.4); opacity: 0.35; }
      50% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes pulsing-marker-breathe {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(26, 156, 75, 0.6), 0 1px 4px rgba(0, 0, 0, 0.4); }
      50% { transform: scale(1.15); box-shadow: 0 0 8px 2px rgba(26, 156, 75, 0.5), 0 1px 4px rgba(0, 0, 0, 0.4); }
    }
  `;
  document.head.appendChild(style);
}

interface PulsingMarkerOverlay {
  setMap(map: any): void;
  setPosition(pos: LatLng): void;
  setOnline(online: boolean): void;
}

function createPulsingMarker(google: any, map: any, position: LatLng, onClick: () => void): PulsingMarkerOverlay {
  ensurePulsingMarkerStyle();

  class PulsingMarker extends google.maps.OverlayView {
    position: LatLng;
    div: HTMLDivElement | null;
    online: boolean;

    constructor() {
      super();
      this.position = position;
      this.div = null;
      this.online = false;
    }
    onAdd() {
      const div = document.createElement('div');
      div.className = 'pulsing-marker';
      div.classList.toggle('online', this.online);
      div.innerHTML =
        '<span class="pulsing-marker-ring"></span>' +
        '<span class="pulsing-marker-ring pulsing-marker-ring--delay1"></span>' +
        '<span class="pulsing-marker-ring pulsing-marker-ring--delay2"></span>' +
        '<span class="pulsing-marker-halo"></span>' +
        `<span class="pulsing-marker-dot${this.online ? '' : ' offline'}"></span>` +
        '<span class="pulsing-marker-icon">🛵</span>';
      div.addEventListener('click', onClick);
      this.div = div;
      this.getPanes().overlayMouseTarget.appendChild(div);
    }
    draw() {
      if (!this.div) return;
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(
        new google.maps.LatLng(this.position.lat, this.position.lng)
      );
      if (point) {
        this.div.style.left = `${point.x}px`;
        this.div.style.top = `${point.y}px`;
      }
    }
    onRemove() {
      this.div?.remove();
      this.div = null;
    }
    setPosition(pos: LatLng) {
      this.position = pos;
      this.draw();
    }
    setOnline(online: boolean) {
      this.online = online;
      this.div?.classList.toggle('online', online);
      this.div?.querySelector('.pulsing-marker-dot')?.classList.toggle('offline', !online);
    }
  }

  const overlay = new PulsingMarker() as unknown as PulsingMarkerOverlay;
  overlay.setMap(map);
  return overlay;
}

function formatRelativeTime(atMs: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - atMs) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

interface DriverProfileInfo {
  online: boolean;
  lastUpdatedAt: number;
  name?: string;
}

function buildDriverInfoWindowContent(
  data: DriverLocation,
  info: DriverProfileInfo,
  onClose: () => void
): HTMLDivElement {
  const card = document.createElement('div');
  card.style.cssText = 'font-family:system-ui,sans-serif;min-width:170px;max-width:230px;position:relative;';
  card.appendChild(createInfoWindowCloseButton(onClose));

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-right:20px;';

  const title = document.createElement('span');
  title.textContent = info.name || 'You';
  title.style.cssText = 'font-size:12px;font-weight:600;color:#202124;';
  titleRow.appendChild(title);

  const isActive = info.online;
  const statusBadge = document.createElement('span');
  statusBadge.textContent = isActive ? '● Online' : '○ Offline';
  statusBadge.style.cssText = `font-size:11px;font-weight:700;color:${isActive ? '#1a9c4b' : '#9aa0a6'};`;
  titleRow.appendChild(statusBadge);

  card.appendChild(titleRow);

  const idRow = document.createElement('div');
  idRow.textContent = `ID: ${data.driverId}`;
  idRow.style.cssText = 'font-size:11px;color:#5f6368;margin-top:4px;word-break:break-all;';
  card.appendChild(idRow);

  const coordsRow = document.createElement('div');
  coordsRow.textContent = `${Number(data.lat).toFixed(5)}, ${Number(data.lon).toFixed(5)}`;
  coordsRow.style.cssText = 'font-size:11px;color:#5f6368;margin-top:2px;';
  card.appendChild(coordsRow);

  if (data.driverShift != null || data.shiftType != null) {
    const shiftParts: string[] = [];
    if (data.driverShift != null) shiftParts.push(`Shift ${data.driverShift}`);
    if (data.shiftType != null) shiftParts.push(`Type ${data.shiftType}`);
    const shiftRow = document.createElement('div');
    shiftRow.textContent = shiftParts.join(' · ');
    shiftRow.style.cssText = 'font-size:11px;color:#5f6368;margin-top:2px;';
    card.appendChild(shiftRow);
  }

  const updatedRow = document.createElement('div');
  updatedRow.textContent = `Updated ${formatRelativeTime(info.lastUpdatedAt)}`;
  updatedRow.style.cssText = 'font-size:10.5px;color:#9aa0a6;margin-top:4px;';
  card.appendChild(updatedRow);

  return card;
}

export interface DriverMarkerLayerOptions {
  currentDriverId?: string;
  driverName?: string;
}

export function createDriverMarkerLayer(
  google: any,
  map: any,
  { currentDriverId = '', driverName = '' }: DriverMarkerLayerOptions = {}
) {
  ensureInfoWindowStyleOverride();
  let meDriverId = currentDriverId;
  let meOverlay: PulsingMarkerOverlay | null = null;
  let meOnline = true;
  let meName = driverName;
  let meLastSeenAt = Date.now();
  let meData: DriverLocation | null = null;
  let mePosition: LatLng | null = null;

  const infoWindow = new google.maps.InfoWindow({ minWidth: 170 });
  let infoWindowOpen = false;

  function closeInfoWindow(): void {
    infoWindow.close();
    infoWindowOpen = false;
  }

  function contentFor(data: DriverLocation) {
    return buildDriverInfoWindowContent(
      data,
      { online: meOnline, lastUpdatedAt: meLastSeenAt, name: meName },
      closeInfoWindow
    );
  }

  function refreshInfoWindowIfOpen(): void {
    if (!infoWindowOpen || !meData) return;
    infoWindow.setContent(contentFor(meData));
  }

  function openInfoWindow(data: DriverLocation, position: LatLng): void {
    infoWindowOpen = true;
    infoWindow.setContent(contentFor(data));
    infoWindow.setPosition(position);
    infoWindow.open({ map });
  }

  infoWindow.addListener('closeclick', () => (infoWindowOpen = false));

  function upsert(data: DriverLocation): void {
    const { driverId, lat, lon } = data;
    if (driverId == null || lat == null || lon == null || driverId !== meDriverId) return;
    if (!meOnline) return;

    const position: LatLng = { lat: Number(lat), lng: Number(lon) };
    meLastSeenAt = Date.now();
    meData = data;
    mePosition = position;

    if (meOverlay) {
      meOverlay.setPosition(position);
      refreshInfoWindowIfOpen();
      return;
    }

    map.setCenter(position);
    map.setZoom(15);
    meOverlay = createPulsingMarker(google, map, position, () => {
      openInfoWindow(meData ?? data, mePosition ?? position);
    });
    meOverlay.setOnline(meOnline);
  }

  function setOnline(online: boolean): void {
    meOnline = online;
    meOverlay?.setOnline(online);
    refreshInfoWindowIfOpen();
  }

  function setDriverName(name: string): void {
    meName = name;
    refreshInfoWindowIfOpen();
  }

  function setCurrentDriverId(id: string): void {
    meDriverId = id;
  }

  return { upsert, setOnline, setDriverName, setCurrentDriverId };
}
