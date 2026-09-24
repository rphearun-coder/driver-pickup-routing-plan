import axios from 'axios';
import { postGraphQL } from '../lib/graphql-request';
import { uploadImageToFolder } from '../lib/upload-request';
import type { PickupOrderItem, PickupOrderListResult, PickupOrderParcel, PickupOrderStatus } from '../types/api';
import type { RouteSortParams } from '../utils/geo';

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

// routeSort / originLat / originLon: the Order Service sorts (see utils/geo.ts RouteSortParams).
export interface OrderListFilter extends RouteSortParams {
  startAt?: string;
  endAt?: string;
  status?: PickupOrderStatus[];
}

const ORDER_FIELDS = `
  id
  driverId
  status
  onRoute
  estimatedTotalParcel
  estimatedTotalPrice
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
    parcelImage
  }
`;

const GET_ORDER_LIST_BY_USER_QUERY = `
  query GetOrderListByUser($limit: Int, $offset: Int, $filter: OrderListFilter) {
    getOrderListByUser(limit: $limit, offset: $offset, filter: $filter) {
      metadata { total limit offset }
      results { ${ORDER_FIELDS} }
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

const GET_ORDER_QUERY = `
  query GetOrder($id: String!) {
    order(id: $id) { ${ORDER_FIELDS} }
  }
`;

// Jalat-Order-Service's order(id) query — used when the detail page is opened
// directly (reload / shared link) and no list page stashed the order first.
export function getOrderById(id: string) {
  return queryOrders<{ order: PickupOrderItem }>(GET_ORDER_QUERY, { id }).then((data) => data.order);
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

const CONFIRM_UPLOAD_PARCEL_MUTATION = `
  mutation ConfirmUploadParcel($input: ConfirmUploadParcelInput!) {
    confirmUploadParcel(input: $input)
  }
`;

// Records the driver-counted total parcels/price on the order (see order.service.ts
// confirmUploadParcel) — the order must be assigned to this driver and still active.
export function confirmUploadParcel(orderId: string, totalParcel: number, totalPrice: number) {
  return queryOrders<{ confirmUploadParcel: boolean }>(CONFIRM_UPLOAD_PARCEL_MUTATION, {
    input: { orderId, totalParcel, totalPrice },
  }).then((data) => data.confirmUploadParcel);
}

export interface ParcelImageInput {
  // The scanned sticker's parcel id — left out for parcels without a sticker, in
  // which case the backend creates the parcel and generates its UID itself.
  id?: string;
  parcelImage: string;
}

const REGISTER_PARCEL_IMAGES_MUTATION = `
  mutation RegisterParcelImages($input: RegisterParcelImagesInput!) {
    registerParcelImages(input: $input) { id parcelUID status parcelImage }
  }
`;

// Order must be IN_PROGRESS/ON_ROUTE and assigned to this driver (see order.service.ts
// driverRegisterParcelImages). Runs before confirmPickup, which counts the order's parcels.
export function registerParcelImages(orderId: string, parcelImages: ParcelImageInput[]) {
  return queryOrders<{ registerParcelImages: PickupOrderParcel[] }>(REGISTER_PARCEL_IMAGES_MUTATION, {
    input: { orderId, parcelImages },
  }).then((data) => data.registerParcelImages);
}

// Bare OBS key (not a full URL) — matches resolveParcelImageUrl's convention in api/parcels.ts.
// Note: Jalat-Order-Service's confirmPickup currently no-ops the shopImage it's sent (see
// order.service.ts#confirmPickup — the updateShopInfo call is commented out, "disabled and to
// be discussed") — the upload itself succeeds and the key is sent, but nothing displays it yet.
export function uploadPickupProof(file: File): Promise<string> {
  return uploadImageToFolder(ORDER_REST_BASE_URL, file, 'parcel');
}

