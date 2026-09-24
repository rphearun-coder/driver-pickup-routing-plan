import { getDeviceId } from '@/utils/deviceId';

export class GraphQLError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'GraphQLError';
  }
}

const UNAUTHORIZED_CODES = new Set(['UNAUTHENTICATED', '401']);

let onUnauthorized: (() => void) | null = null;

// Called once by useAuth.ts so any expired/invalid token clears stored auth
// and drops the user back to the login form, instead of failing silently.
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export async function gqlRequest<T>(
  url: string,
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
  signal?: AbortSignal
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-platform': 'web',
        'x-udid': getDeviceId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (err) {
    // Aborts are intentional — let callers keep ignoring them by name.
    if ((err as { name?: string }).name === 'AbortError') throw err;
    // fetch only rejects when the server is unreachable (down, wrong URL, CORS, offline),
    // which the browser reports as a bare "Failed to fetch".
    throw new GraphQLError("Can't reach the server right now. Check your connection and try again.", 'NETWORK_ERROR');
  }

  const payload = await response.json().catch(() => null);

  if (payload?.errors?.length) {
    const first = payload.errors[0];
    const code = first.extensions?.code ?? String(first.statusCode ?? '');
    if (token && UNAUTHORIZED_CODES.has(code)) onUnauthorized?.();
    throw new GraphQLError(first.message ?? 'GraphQL error', code);
  }

  if (!response.ok) {
    if (token && response.status === 401) onUnauthorized?.();
    throw new GraphQLError(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  return payload.data as T;
}
