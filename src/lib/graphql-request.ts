import type { AxiosInstance } from 'axios';
import router from '../router';
import { useAuthStore } from '../stores/auth';

// Expired/invalid tokens surface as a GraphQL error (HTTP 200, errors[].message
// like "jwt expired" or "Unauthorized"), not an HTTP 401 — so this can't be
// caught by checking response status alone.
const AUTH_ERROR_PATTERN = /unauthorized|unauthenticated|authorization|jwt|token/i;

function isAuthError(message: string): boolean {
  return AUTH_ERROR_PATTERN.test(message);
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

class GraphQLAuthError extends Error {}

async function sendOnce<T>(
  http: AxiosInstance,
  query: string,
  variables: Record<string, unknown>,
  serviceName: string,
  token: string | null,
): Promise<T> {
  let response;
  try {
    response = await http.post<GraphQLResponse<T>>(
      '',
      { query, variables },
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
    );
  } catch (err: any) {
    if (!err?.response) {
      throw new Error(`Can't reach ${serviceName.toLowerCase()} right now. Check your connection and try again.`);
    }
    throw err;
  }

  if (response.data.errors?.length) {
    const message = response.data.errors.map((error) => error.message).join('; ');
    throw isAuthError(message) ? new GraphQLAuthError(message) : new Error(message);
  }

  if (!response.data.data) {
    throw new Error(`${serviceName} returned no data.`);
  }

  return response.data.data;
}

// Shared by every api/*.ts GraphQL client (each still owns its own axios
// instance/baseURL, but the request/error handling was identical copy-pasted
// boilerplate in 7+ files). Every caller gets, for free:
// - A genuinely unreachable server (connection refused, DNS, timeout — axios
//   throws with no `response`) becomes a readable message instead of axios's
//   bare "Network Error".
// - A fresh token can transiently 401 right after login or a page refresh —
//   Jalat-Order-Service's Redis session cache races when several requests for
//   the same brand-new token land before the first one finishes populating it
//   (see Jalat-Order-Service/src/graphql/auth/auth.guard.ts). So an auth error
//   gets one retry (after a short pause) before it's treated as real — that
//   alone was logging users straight back out to /login on every refresh.
// - An auth error that persists through the retry logs the user out and sends
//   them back to /login, instead of leaving a raw "jwt expired" string on
//   screen forever.
export async function postGraphQL<T>(
  http: AxiosInstance,
  query: string,
  variables: Record<string, unknown> = {},
  serviceName = 'Service',
): Promise<T> {
  const token = useAuthStore().accessToken;

  try {
    return await sendOnce<T>(http, query, variables, serviceName, token);
  } catch (err) {
    if (!(err instanceof GraphQLAuthError)) throw err;

    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      return await sendOnce<T>(http, query, variables, serviceName, token);
    } catch (retryErr) {
      if (retryErr instanceof GraphQLAuthError) {
        useAuthStore().logout();
        if (router.currentRoute.value.name !== 'login') {
          router.push({ name: 'login' });
        }
      }
      throw retryErr;
    }
  }
}
