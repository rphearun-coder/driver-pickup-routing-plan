import axios from 'axios';
import { postGraphQL } from '../lib/graphql-request';
import { useAuthStore } from '../stores/auth';

// Jalat Order Service — see Jalat-Order-Service/src/graphql/parcel/parcel.resolver.ts.
// Both return parcels ("driverListReturnParcel", @Auth('DRIVER')) and the driver's
// active deliveries ("getDeliveryList", @Auth()) live on this same Parcel model.
const ORDER_API_BASE_URL = import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:8082/v1';
// The upload REST controller lives at the service root, not under the /v1 GraphQL path.
const ORDER_REST_BASE_URL = ORDER_API_BASE_URL.replace(/\/v1\/?$/, '');

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

// Bare OBS key (not a full URL) — matches resolveParcelImageUrl's convention below.
export async function uploadParcelProof(file: File): Promise<string> {
  const auth = useAuthStore();
  const form = new FormData();
  form.append('file', file);

  const { data } = await axios.post<{ name: string }>(`${ORDER_REST_BASE_URL}/upload/v2/image`, form, {
    params: { folder: 'parcel' },
    headers: {
      Authorization: auth.accessToken ? `Bearer ${auth.accessToken}` : '',
    },
  });
  return data.name;
}

// parcelImage/receiptImage are bare object keys, not URLs (see Jalat-Order-Service's
// HuaweiConfig.getTempUrl — same bucket/host convention, used server-side wherever
// this key needs to become a viewable link, e.g. its Telegram-photo senders).
const OBS_BASE_URL = import.meta.env.VITE_OBS_BASE_URL ?? 'https://jalat.obs.ap-southeast-3.myhuaweicloud.com';

export function resolveParcelImageUrl(key?: string): string {
  if (!key) return '';
  if (/^https?:\/\//.test(key)) return key;
  return `${OBS_BASE_URL}/${key}`;
}

// Matches ParcelStatusEnum in Jalat-Order-Service/src/common/types/parcel.enum.ts
export type ParcelStatus =
  | 'PENDING'
  | 'PICKED_UP'
  | 'IN_CENTRAL_WAREHOUSE'
  | 'ON_DELIVERY'
  | 'SUCCESS'
  | 'FAILED'
  | 'RETURN'
  | 'BE_RETURN'
  | 'IN_TRANSIT'
  | 'DELETED'
  | 'RETURNING_FROM_DRIVER'
  | 'PROCESSING_RETURN';

export interface Parcel {
  id: string;
  orderId: string;
  status: ParcelStatus;
  onRoute?: boolean;
  recipientName?: string;
  recipientNumber?: string;
  partnerStoreName?: string;
  location?: string;
  deliveryAddress?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  parcelImage?: string;
  receiptImage?: string;
  codUsd?: number;
  price?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ParcelListResult {
  results: Parcel[];
  metadata: { total: number; limit: number; offset: number };
}

const PARCEL_FIELDS = `
  id
  orderId
  status
  onRoute
  recipientName
  recipientNumber
  partnerStoreName
  location
  deliveryAddress
  deliveryLatitude
  deliveryLongitude
  parcelImage
  receiptImage
  codUsd
  price
  createdAt
  updatedAt
`;

const DRIVER_LIST_RETURN_PARCEL_QUERY = `
  query DriverListReturnParcel($filter: DriverListReturnParcelFilter, $limit: Int, $offset: Int) {
    driverListReturnParcel(filter: $filter, limit: $limit, offset: $offset) {
      results { ${PARCEL_FIELDS} }
      metadata { total limit offset }
    }
  }
`;

// The driver is scoped server-side from the auth token — no driverId filter to pass.
export function driverListReturnParcel(
  statusIn: ParcelStatus[],
  recipientNumber?: string,
  limit = 20,
  offset = 0,
) {
  return queryOrders<{ driverListReturnParcel: ParcelListResult }>(DRIVER_LIST_RETURN_PARCEL_QUERY, {
    filter: { statusIn, recipientNumber: recipientNumber || undefined },
    limit,
    offset,
  }).then((data) => data.driverListReturnParcel);
}

export interface DeliveryListFilter {
  status?: ParcelStatus[];
  recipientNumber?: string;
  startAt?: string;
  endAt?: string;
}

const GET_DELIVERY_LIST_QUERY = `
  query GetDeliveryList($filter: ParcelFilter, $limit: Int, $offset: Int) {
    getDeliveryList(filter: $filter, limit: $limit, offset: $offset) {
      results { ${PARCEL_FIELDS} }
      metadata { total limit offset }
    }
  }
`;

// No status filter defaults server-side to ON_DELIVERY (see parcel.service.ts
// getDeliveryList) — exactly "the driver's current deliveries" regardless of date.
export function getDeliveryList(filter: DeliveryListFilter = {}, limit = 20, offset = 0) {
  return queryOrders<{ getDeliveryList: ParcelListResult }>(GET_DELIVERY_LIST_QUERY, {
    filter,
    limit,
    offset,
  }).then((data) => data.getDeliveryList);
}

const SCAN_QR_CODE_MUTATION = `
  mutation ScanQRCode($id: String!) {
    scanQRCode(id: $id) { ${PARCEL_FIELDS} }
  }
`;

// The scanned parcel id must already be PICKED_UP/IN_CENTRAL_WAREHOUSE/ON_DELIVERY/
// IN_TRANSIT server-side (see parcel.service.ts scanQRCode) — it assigns the parcel
// to this driver and moves it to ON_DELIVERY, ready to hand to the customer.
export function scanParcelQrCode(id: string) {
  return queryOrders<{ scanQRCode: Parcel }>(SCAN_QR_CODE_MUTATION, { id }).then((data) => data.scanQRCode);
}

const CONFIRM_RETURN_FROM_WAREHOUSE_MUTATION = `
  mutation DriverConfirmReturnParcelFromWarehouse($parcelId: String!) {
    driverConfirmReturnParcelFromWarehouse(parcelId: $parcelId) { ${PARCEL_FIELDS} }
  }
`;

// The scanned parcel id must already be PROCESSING_RETURN/BE_RETURN server-side
// (see parcel.service.ts driverConfirmReturnParcelFromWH) — it assigns the parcel
// to this driver as the returning driver and moves it to BE_RETURN, confirming
// they've picked it back up from the warehouse to carry it.
export function confirmReturnParcelFromWarehouse(parcelId: string) {
  return queryOrders<{ driverConfirmReturnParcelFromWarehouse: Parcel }>(
    CONFIRM_RETURN_FROM_WAREHOUSE_MUTATION,
    { parcelId },
  ).then((data) => data.driverConfirmReturnParcelFromWarehouse);
}

const FINISH_DELIVERY_MUTATION = `
  mutation FinishDelivery($input: FinishDeliveryInput!) {
    finishDelivery(input: $input) { ${PARCEL_FIELDS} }
  }
`;

// Requires the parcel to already be ON_DELIVERY and belong to this driver (see
// parcel.service.ts finishDelivery). receiverBy is fixed to DRIVER — that's the
// "handed straight to the customer" path and doesn't require a receiptImage
// (only receiverBy: SELLER does). amountUSD carries the parcel's own known COD
// total through rather than asking the driver to retype it.
export function finishParcelDelivery(id: string, proofImage: string, amountUSD?: number): Promise<Parcel> {
  return queryOrders<{ finishDelivery: Parcel }>(FINISH_DELIVERY_MUTATION, {
    input: { id, receiverBy: 'DRIVER', proofImage, amountUSD: amountUSD || 0 },
  }).then((data) => data.finishDelivery);
}

const CONFIRM_RETURN_PARCEL_MUTATION = `
  mutation ConfirmReturnParcel($id: String!, $proofImage: String!) {
    confirmReturnParcel(id: $id, proofImage: $proofImage)
  }
`;

// The parcel must already be BE_RETURN and assigned to this driver — confirms
// they've handed it back to the shop (see parcel.resolver.ts confirmReturnParcel).
export function confirmReturnParcel(id: string, proofImage: string): Promise<boolean> {
  return queryOrders<{ confirmReturnParcel: boolean }>(CONFIRM_RETURN_PARCEL_MUTATION, {
    id,
    proofImage,
  }).then((data) => data.confirmReturnParcel);
}

const CONFIRM_RETURN_TO_WAREHOUSE_MUTATION = `
  mutation DriverConfirmReturnParcelToWarehouse($parcelId: String!, $proofOfReturnFromDriver: String!) {
    driverConfirmReturnParcelToWarehouse(parcelId: $parcelId, proofOfReturnFromDriver: $proofOfReturnFromDriver)
  }
`;

// The parcel must be RETURNING_FROM_DRIVER/PROCESSING_RETURN and assigned to this
// driver — confirms they've dropped it off at the warehouse.
export function confirmReturnParcelToWarehouse(parcelId: string, proofOfReturnFromDriver: string): Promise<boolean> {
  return queryOrders<{ driverConfirmReturnParcelToWarehouse: boolean }>(CONFIRM_RETURN_TO_WAREHOUSE_MUTATION, {
    parcelId,
    proofOfReturnFromDriver,
  }).then((data) => data.driverConfirmReturnParcelToWarehouse);
}
