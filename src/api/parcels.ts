import axios from 'axios';
import { postGraphQL } from '../lib/graphql-request';
import { uploadImageToFolder } from '../lib/upload-request';
import type { RouteSortParams } from '../utils/geo';

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
export function uploadParcelProof(file: File): Promise<string> {
  return uploadImageToFolder(ORDER_REST_BASE_URL, file, 'parcel');
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

// partnerStoreName is a denormalized scalar that's often blank on older/partner-
// integration parcels — the resolved partner relation (partner.fullName / shop.shopName)
// is the live source of truth and rarely empty, so it's tried first.
export function parcelSellerName(item: Parcel): string {
  return item.partner?.fullName || item.partner?.shop?.shopName || item.partnerStoreName || '';
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

export type ReceiverBy = 'DRIVER' | 'SELLER';

export interface Parcel {
  id: string;
  orderId: string;
  parcelUID?: string;
  status: ParcelStatus;
  onRoute?: boolean;
  recipientName?: string;
  recipientNumber?: string;
  partnerStoreName?: string;
  // The seller. Phone + shop address/coords are what a driver needs when
  // carrying a return back to the shop.
  partner?: {
    fullName?: string;
    phoneNumber?: string;
    shop?: { shopName?: string; shopImage?: string; address?: string; latitude?: number; longitude?: number };
  };
  location?: string;
  deliveryAddress?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  // Straight-line estimate from the driver's last location (getDeliveryList, ON_DELIVERY only).
  estimatedDistanceMeters?: number;
  estimatedDurationSeconds?: number;
  estimatedDistanceMetersText?: string;
  estimatedDurationSecondsText?: string;
  parcelImage?: string;
  receiptImage?: string;
  proofImage?: string;
  proofOfFailed?: string;
  codUsd?: number;
  codRiel?: number;
  totalCOD?: number;
  price?: number;
  receiverBy?: ReceiverBy;
  reason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ParcelListResult {
  results: Parcel[];
  metadata: { total: number; limit: number; offset: number };
  // Route totals (getDeliveryList for a driver's ON_DELIVERY list).
  extraData?: {
    totalEstimatedDistanceMeters?: number;
    totalEstimatedDurationSeconds?: number;
    totalEstimatedDistanceMetersText?: string;
    totalEstimatedDurationSecondsText?: string;
  };
}

const PARCEL_FIELDS = `
  id
  orderId
  parcelUID
  status
  onRoute
  recipientName
  recipientNumber
  partnerStoreName
  partner { fullName phoneNumber shop { shopName shopImage address latitude longitude } }
  location
  deliveryAddress
  deliveryLatitude
  deliveryLongitude
  estimatedDistanceMeters
  estimatedDurationSeconds
  estimatedDistanceMetersText
  estimatedDurationSecondsText
  parcelImage
  receiptImage
  proofImage
  proofOfFailed
  codUsd
  codRiel
  totalCOD
  price
  receiverBy
  reason
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

// routeSort / originLat / originLon: the Order Service sorts (see utils/geo.ts RouteSortParams).
export interface DeliveryListFilter extends RouteSortParams {
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
      extraData {
        totalEstimatedDistanceMeters
        totalEstimatedDurationSeconds
        totalEstimatedDistanceMetersText
        totalEstimatedDurationSecondsText
      }
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

const UPDATE_PARCEL_ON_ROUTE_MUTATION = `
  mutation UpdateParcelOnRoute($parcelId: String!, $onRoute: Boolean!) {
    updateParcelOnRoute(parcelId: $parcelId, onRoute: $onRoute)
  }
`;

// Marks one of this driver's ON_DELIVERY parcels as en route (heading to the
// customer) or not. Stored server-side and read back through the parcel's
// resolved onRoute field (see parcel.service.ts updateParcelOnRoute).
export function updateParcelOnRoute(parcelId: string, onRoute: boolean): Promise<boolean> {
  return queryOrders<{ updateParcelOnRoute: boolean }>(UPDATE_PARCEL_ON_ROUTE_MUTATION, { parcelId, onRoute }).then(
    (data) => data.updateParcelOnRoute,
  );
}

const UPDATE_PARCEL_IMAGE_MUTATION = `
  mutation UpdateParcelImage($id: String!, $parcelImage: String!) {
    updateParcelImage(id: $id, parcelImage: $parcelImage)
  }
`;

// Replaces the parcel photo — only for this driver's ON_DELIVERY parcels (see
// parcel.service.ts updateParcelImage). parcelImage is a bare OBS key.
export function updateParcelImage(id: string, parcelImage: string): Promise<boolean> {
  return queryOrders<{ updateParcelImage: boolean }>(UPDATE_PARCEL_IMAGE_MUTATION, { id, parcelImage }).then(
    (data) => data.updateParcelImage,
  );
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

export interface FinishDeliveryOptions {
  id: string;
  receiverBy: ReceiverBy;
  proofImage?: string;
  // Required by the backend when receiverBy is SELLER (see parcel.service.ts
  // finishDelivery — throws "ភស្តុតាងនៃប្រតិបត្តិការត្រូវបានទាមទារ" without it).
  receiptImage?: string;
  amountUSD?: number;
  amountKHR?: number;
  // The recipient handed a parcel back to return to the seller (exchange etc.) —
  // the backend flags the parcel hasReturn and notes "មានឥវ៉ាន់ត្រលប់".
  isReturn?: boolean;
  proofOfReturnFromReceiver?: string;
}

// Requires the parcel to already be ON_DELIVERY and belong to this driver (see
// parcel.service.ts finishDelivery).
export function finishParcelDelivery(options: FinishDeliveryOptions): Promise<Parcel> {
  const { id, receiverBy, proofImage, receiptImage, amountUSD, amountKHR, isReturn, proofOfReturnFromReceiver } = options;
  return queryOrders<{ finishDelivery: Parcel }>(FINISH_DELIVERY_MUTATION, {
    input: {
      id,
      receiverBy,
      proofImage,
      receiptImage,
      amountUSD: amountUSD || 0,
      amountKHR: amountKHR || 0,
      isReturn: !!isReturn,
      proofOfReturnFromReceiver,
    },
  }).then((data) => data.finishDelivery);
}

const SEND_DELIVERY_ASSISTANT_MESSAGE_MUTATION = `
  mutation SendAssistantMessage($input: SendMessageInput!) {
    sendAssistantMessage(input: $input)
  }
`;

// roomId is the parcel's own id (see Jalat-Order-Service's assistant-message
// module — deliveryFailed below reads this same room by parcel id). deliveryFailed
// requires one of these to exist for today before it'll let the driver mark a
// parcel failed, so this is step one of that flow, not an optional side-channel.
export function sendDeliveryAssistantMessage(parcelId: string, message: string): Promise<boolean> {
  return queryOrders<{ sendAssistantMessage: boolean }>(SEND_DELIVERY_ASSISTANT_MESSAGE_MUTATION, {
    input: { roomId: parcelId, message, messageType: 'TEXT' },
  }).then((data) => data.sendAssistantMessage);
}

const DELIVERY_FAILED_MUTATION = `
  mutation DeliveryFailed($input: DeliveryFailedInput!) {
    deliveryFailed(input: $input)
  }
`;

// The parcel must already be ON_DELIVERY, and a sendDeliveryAssistantMessage for it
// must have been sent today, at least Settings.driverMarkAsDeliveryFailedDuration
// minutes ago (see parcel.service.ts deliveryFailed) — otherwise this throws a
// (Khmer) BadRequestException explaining which of those isn't satisfied yet.
export function markDeliveryFailed(id: string, reason: string, proofOfFailed?: string): Promise<boolean> {
  return queryOrders<{ deliveryFailed: boolean }>(DELIVERY_FAILED_MUTATION, {
    input: { id, reason, proofOfFailed },
  }).then((data) => data.deliveryFailed);
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

// A Parcel plus the ownership/return fields the shop-returns flow needs.
export type ReturnParcel = Parcel & {
  userId?: string;
  proofOfReturnToSender?: string;
  // For a RETURN parcel, when it was handed back (confirmReturnParcel sets it).
  deliveredAt?: string;
};

const RETURN_PARCEL_FIELDS = `${PARCEL_FIELDS} userId proofOfReturnToSender deliveredAt`;

const GET_BE_RETURN_PARCELS_QUERY = `
  query GetBeReturnParcels($userId: String) {
    getBeReturnParcels(userId: $userId) { ${RETURN_PARCEL_FIELDS} }
  }
`;

// The driver's BE_RETURN parcels (returnByDriverId = this driver, scoped from the
// auth token — see parcel.service.ts getBeReturnParcels), optionally narrowed to
// one seller. Used at a pickup to hand that shop's returns back in the same visit.
export function getBeReturnParcels(userId?: string): Promise<ReturnParcel[]> {
  return queryOrders<{ getBeReturnParcels: ReturnParcel[] }>(GET_BE_RETURN_PARCELS_QUERY, {
    userId,
  }).then((data) => data.getBeReturnParcels ?? []);
}

const GET_PARCEL_QUERY = `
  query GetParcel($id: String!) {
    getParcel(id: $id) { ${RETURN_PARCEL_FIELDS} }
  }
`;

// Any parcel by id (parcel.resolver.ts getParcel, @Auth()) — used to check a scanned
// return parcel's shop and status before the driver takes it on.
export function getParcel(id: string): Promise<ReturnParcel> {
  return queryOrders<{ getParcel: ReturnParcel }>(GET_PARCEL_QUERY, { id }).then((data) => data.getParcel);
}

const DRIVER_RETURNED_PARCELS_QUERY = `
  query DriverReturnedParcels($filter: DriverListReturnParcelFilter, $limit: Int, $offset: Int) {
    driverListReturnParcel(filter: $filter, limit: $limit, offset: $offset) {
      results { ${RETURN_PARCEL_FIELDS} }
      metadata { total limit offset }
    }
  }
`;

// Parcels this driver already handed back (status RETURN, see confirmReturnParcel).
// The backend can't filter by shop, so callers narrow the page by userId themselves.
export function getDriverReturnedParcels(limit = 100, offset = 0): Promise<ReturnParcel[]> {
  return queryOrders<{ driverListReturnParcel: { results: ReturnParcel[] } }>(DRIVER_RETURNED_PARCELS_QUERY, {
    filter: { statusIn: ['RETURN'] },
    limit,
    offset,
  }).then((data) => data.driverListReturnParcel.results ?? []);
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
