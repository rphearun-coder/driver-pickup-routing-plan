import axios from 'axios';
import { postGraphQL } from '../lib/graphql-request';
import { uploadImageToFolder } from '../lib/upload-request';
import type { PickupOrderListResult, PickupOrderStatus } from '../types/api';

const ORDER_API_BASE_URL = import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:8082/v1';
// The upload REST controller lives at the service root, not under the /v1 GraphQL path.
const ORDER_REST_BASE_URL = ORDER_API_BASE_URL.replace(/\/v1\/?$/, '');

// Jalat Location Service's order endpoint (see Jalat-Location-Service/app.test/driver-location.http,
// "@orderHost") — same GraphQL query as its "getOrderListByUser" request.
const orderHttp = axios.create({
  baseURL: ORDER_API_BASE_URL,
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
        parcels {
          id
          parcelUID
          status
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

export interface ShopInfoInput {
  shopImage?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

const CONFIRM_PICKUP_MUTATION = `
  mutation ConfirmPickup($input: ConfirmPickupInput!) {
    confirmPickup(input: $input)
  }
`;

export function confirmPickup(orderId: string, shopInfo?: ShopInfoInput) {
  return queryOrders<{ confirmPickup: boolean }>(CONFIRM_PICKUP_MUTATION, {
    input: { id: orderId, shopInfo },
  }).then((data) => data.confirmPickup);
}

// Bare OBS key (not a full URL) — matches resolveParcelImageUrl's convention in api/parcels.ts.
// Note: Jalat-Order-Service's confirmPickup currently no-ops the shopImage it's sent (see
// order.service.ts#confirmPickup — the updateShopInfo call is commented out, "disabled and to
// be discussed") — the upload itself succeeds and the key is sent, but nothing displays it yet.
export function uploadPickupProof(file: File): Promise<string> {
  return uploadImageToFolder(ORDER_REST_BASE_URL, file, 'parcel');
}

export function todayOrderFilter(): OrderListFilter {
  const now = new Date();
  const startAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
}
