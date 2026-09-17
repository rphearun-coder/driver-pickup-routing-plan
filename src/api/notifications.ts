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

const DELETE_NOTIFICATION_MUTATION = `
  mutation DeleteUserNotification($id: Int!) {
    deleteUserNotification(id: $id)
  }
`;

export function deleteUserNotification(id: number) {
  return queryUserService<{ deleteUserNotification: boolean }>(
    DELETE_NOTIFICATION_MUTATION,
    { id },
  ).then((data) => data.deleteUserNotification);
}
