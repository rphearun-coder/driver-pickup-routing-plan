export type GpsStatus = 'idle' | 'searching' | 'good' | 'weak' | 'stale' | 'denied' | 'unavailable';

// Phone GPS is normally 5-30 m; past 50 m the signal is weak (urban canyon, indoors).
export const GPS_WEAK_ACCURACY_METERS = 50;
// Beyond this the fix is cell-tower / IP level and would put the driver on the wrong street,
// so it is shown to the driver but never published to dispatch.
export const GPS_MAX_PUBLISH_ACCURACY_METERS = 200;
// No new fix for this long while tracking means the signal has gone quiet.
export const GPS_STALE_AFTER_MS = 30_000;

export interface GpsStatusInput {
  /** Live mode + online + signed in — i.e. location is supposed to be flowing. */
  tracking: boolean;
  blocked: '' | 'denied' | 'unavailable';
  /** When the newest fix this session was measured (0 = none yet) — not when it arrived. */
  lastFixAt: number;
  accuracyMeters: number | null;
  now: number;
}

export function computeGpsStatus({ tracking, blocked, lastFixAt, accuracyMeters, now }: GpsStatusInput): GpsStatus {
  if (blocked) return blocked;
  if (!tracking) return 'idle';
  if (!lastFixAt) return 'searching';
  if (now - lastFixAt > GPS_STALE_AFTER_MS) return 'stale';
  if (accuracyMeters !== null && accuracyMeters > GPS_WEAK_ACCURACY_METERS) return 'weak';
  return 'good';
}


export function isAccurateEnoughToPublish(accuracyMeters: number): boolean {
  return Number.isFinite(accuracyMeters) && accuracyMeters <= GPS_MAX_PUBLISH_ACCURACY_METERS;
}

export function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}
