import axios from 'axios';
import router from '../router';
import { useAuthStore } from '../stores/auth';

class UploadAuthError extends Error {}

async function sendOnce(baseURL: string, file: File, folder: string, token: string | null): Promise<string> {
  const form = new FormData();
  form.append('file', file);

  try {
    const { data } = await axios.post<{ name: string }>(`${baseURL}/upload/v2/image`, form, {
      params: { folder },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return data.name;
  } catch (err: any) {
    if (!err?.response) {
      throw new Error("Can't reach the server right now. Check your connection and try again.");
    }
    if (err.response.status === 401) {
      throw new UploadAuthError(err.response.data?.message || 'Unauthorized');
    }
    throw err;
  }
}

// Mirrors postGraphQL's auth-error handling (lib/graphql-request.ts) for the REST
// upload/v2/image endpoint, which these calls hit directly rather than through
// postGraphQL. Without this, a missing/expired token surfaced as a raw "Invalid
// Authorization Scheme" (see e.g. Jalat-Order-Service/src/api/auth/auth.guard.ts)
// left on screen instead of clearing the session and returning to /login.
// One retry happens first — a fresh token can transiently 401 right after login
// (same Redis session-cache race postGraphQL works around) — before an auth
// failure is treated as real.
export async function uploadImageToFolder(baseURL: string, file: File, folder: string): Promise<string> {
  const token = useAuthStore().accessToken;

  try {
    return await sendOnce(baseURL, file, folder, token);
  } catch (err) {
    if (!(err instanceof UploadAuthError)) throw err;

    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      return await sendOnce(baseURL, file, folder, token);
    } catch (retryErr) {
      if (retryErr instanceof UploadAuthError) {
        useAuthStore().logout();
        if (router.currentRoute.value.name !== 'login') {
          router.push({ name: 'login' });
        }
      }
      throw retryErr;
    }
  }
}
