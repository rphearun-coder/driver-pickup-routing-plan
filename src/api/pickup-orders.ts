import axios from 'axios';
import { postGraphQL } from '../lib/graphql-request';
import type { PickupOrderListResult, PickupOrderStatus } from '../types/api';

// Jalat Location Service's order endpoint (see Jalat-Location-Service/app.test/driver-location.http,
// "@orderHost") — same GraphQL query as its "getOrderListByUser" request.
const orderHttp = axios.create({
  baseURL: import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:8082/v1',
  headers: {
    'Content-Type': 'application/json',
    'x-platform': 'web',
    'x-udid': 'jalat-client',
  },
});

function queryOrders<T>(query: string, variables: Record<string, unknown> = {}) {
  return postGraphQL<T>(orderHttp, query, variables, 'Order service');
}

export interface OrderListFilter {
  startAt?: string;
  endAt?: string;
  status?: PickupOrderStatus[];
}

const GET_ORDER_LIST_BY_USER_QUERY = `
  query GetOrderListByUser($limit: Int, $offset: Int, $filter: OrderListFilter) {
    getOrderListByUser(limit: $limit, offset: $offset, filter: $filter) {
      metadata { total limit offset }
      results {
        id
        driverId
        status
        onRoute
        estimatedTotalParcel
        pickupAddress
        pickupLatitude
        pickupLongitude
        estimatedDistanceMeters
        estimatedDurationSeconds
        estimatedDistanceMetersText
        estimatedDurationSecondsText
        pickupAt
        createdAt
        partner {
          id
          fullName
          phoneNumber
          shop { shopName shopImage address longitude latitude zone { id commune } }
        }
      }
      extraData {
        totalEstimatedDistanceMeters
        totalEstimatedDurationSeconds
        totalEstimatedDistanceMetersText
        totalEstimatedDurationSecondsText
      }
    }
  }
`;

export function getOrderListByUser(filter: OrderListFilter, limit = 20, offset = 0) {
  return queryOrders<{ getOrderListByUser: PickupOrderListResult }>(GET_ORDER_LIST_BY_USER_QUERY, {
    limit,
    offset,
    filter,
  }).then((data) => data.getOrderListByUser);
}

const UPDATE_ON_ROUTE_MUTATION = `
  mutation UpdateOnRoute($id: String!) {
    updateOnRoute(id: $id)
  }
`;

export function updateOnRoute(orderId: string) {
  return queryOrders<{ updateOnRoute: boolean }>(UPDATE_ON_ROUTE_MUTATION, { id: orderId }).then(
    (data) => data.updateOnRoute,
  );
}

export function todayOrderFilter(): OrderListFilter {
  const now = new Date();
  const startAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
}
