const STORAGE_KEY = 'driver-id-map-app:udid';

// The User Service ties an active session to this value ("device"): a login sharing the
// same udid silently replaces that device's stored token, invalidating whatever browser
// tab was already holding it. A fixed constant here means any second client reusing that
// constant (another tab, a test script) kicks out this browser — so persist a value unique
// to this browser instead.
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return 'pwa-jalat-fallback';
  }
}
