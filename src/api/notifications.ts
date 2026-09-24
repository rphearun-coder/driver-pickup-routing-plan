import axios from 'axios';
import { postGraphQL } from '../lib/graphql-request';

const userHttp = axios.create({
  baseURL: import.meta.env.VITE_USER_SERVICE_URL ?? 'http://localhost:8081/v1',
  headers: {
    'Content-Type': 'application/json',
    'x-platform': 'web',
    'x-udid': 'jalat-client',
  },
});

function queryUserService<T>(query: string, variables: Record<string, unknown> = {}) {
  return postGraphQL<T>(userHttp, query, variables, 'User service');
}

export interface UserNotification {
  id: number;
  notificationId: number;
  title: string;
  body: string;
  isRead?: boolean;
  status: string;
  createdAt?: string;
}

const GET_NOTIFICATIONS_QUERY = `
  query UserNotifications($limit: Int, $offset: Int) {
    userNotifications(limit: $limit, offset: $offset) {
      results {
        id
        notificationId
        title
        body
        isRead
        status
        createdAt
      }
      metadata {
        total
        limit
        offset
      }
    }
  }
`;

export function getUserNotifications(limit = 20, offset = 0) {
  return queryUserService<{
    userNotifications: { results: UserNotification[]; metadata: { total: number; limit: number; offset: number } };
  }>(GET_NOTIFICATIONS_QUERY, { limit, offset }).then((data) => data.userNotifications);
}

// Fetching one notification marks it read server-side (user-notification.service.ts
// getUserNotification) — there is no separate "mark read" mutation.
export function markNotificationRead(id: number) {
  return queryUserService<{ userNotification: { id: number; isRead?: boolean } }>(
    `query UserNotification($id: Int!) { userNotification(id: $id) { id isRead } }`,
    { id },
  ).then((data) => data.userNotification);
}

// ---- Operation (the driver's operators) ---------------------------------------------

export interface DriverOperator {
  id: string;
  fullName?: string;
  username: string;
  phoneNumber?: string;
}

// The Operation users this driver is assigned to (Jalat-User-Service getOperationByDriver).
export function getOperationByDriver(driverId: string) {
  return queryUserService<{ getOperationByDriver: DriverOperator[] | null }>(
    `query GetOperationByDriver($driverId: String!) {
      getOperationByDriver(driverId: $driverId) { id fullName username phoneNumber }
    }`,
    { driverId },
  ).then((data) => data.getOperationByDriver ?? []);
}

export interface OperationNotification {
  type: string;
  title: string;
  body: string;
  refId?: string;
}

// Push notification (Firebase) to every active Operation user — the server's
// sendNotificationToOperation has no per-operator targeting and can't carry a file.
export function sendNotificationToOperation(input: OperationNotification) {
  return queryUserService<{ sendNotificationToOperation: boolean }>(
    `mutation SendNotificationToOperation($input: MessageInput!) {
      sendNotificationToOperation(input: $input)
    }`,
    { input },
  ).then((data) => data.sendNotificationToOperation);
}
