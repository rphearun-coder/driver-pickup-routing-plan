export type DevicePlatform = 'iOS' | 'Android' | 'Desktop';

// navigator.platform is deprecated and userAgent doesn't reliably expose "iPadOS" (iPads
// report as Mac since iOS 13's desktop-class Safari UA), so iPad is detected via its
// touch-point quirk: a real Mac reports maxTouchPoints 0, an iPad reports 5.
export function getDevicePlatform(): DevicePlatform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  return 'Desktop';
}

export function getBrowserName(): string {
  const ua = navigator.userAgent;
  if (/CriOS/.test(ua)) return 'Chrome';
  if (/FxiOS/.test(ua)) return 'Firefox';
  if (/EdgiOS|Edg\//.test(ua)) return 'Edge';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Chrome/.test(ua)) return 'Chrome';
  if (/Safari/.test(ua)) return 'Safari';
  if (/Firefox/.test(ua)) return 'Firefox';
  return 'this browser';
}

export type GeoPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

// The Permissions API can't observe iOS Safari's location toggle reliably pre-16, so a
// getCurrentPosition() probe (see useDeviceGps.ts) is the real source of truth there —
// this is a best-effort read used to render an initial badge before that probe runs.
export async function queryGeoPermission(): Promise<GeoPermissionState> {
  if (!navigator.permissions?.query) return 'unsupported';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state as GeoPermissionState;
  } catch {
    return 'unsupported';
  }
}
