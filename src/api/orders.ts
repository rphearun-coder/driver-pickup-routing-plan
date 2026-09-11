import { gqlRequest } from './graphql';
import { ORDER_SERVICE_URL } from '../config';
import type { LatLng, OrderStatus, PickupPoint, PickupTimeSlot } from '../types';

const GET_ORDER_LIST_QUERY = `
  query GetOrderListByUser($limit: Int, $offset: Int, $filter: OrderListFilter) {
    getOrderListByUser(limit: $limit, offset: $offset, filter: $filter) {
      metadata { total limit offset }
      results {
        id
        driverId
        estimatedTotalParcel
        status
        pickupAddress
        pickupLatitude
        pickupLongitude
        estimatedDistanceMeters
        estimatedDurationSeconds
        estimatedDistanceMetersText
        estimatedDurationSecondsText
        partner {
          fullName
          shop { shopName }
        }
      }
    }
  }
`;

interface OrderApiItem {
  id: string;
  status?: OrderStatus;
  pickupAddress?: string;
  pickupLatitude?: number | string;
  pickupLongitude?: number | string;
  estimatedTotalParcel?: number;
  estimatedDistanceMeters?: number;
  estimatedDurationSeconds?: number;
  estimatedDistanceMetersText?: string;
  estimatedDurationSecondsText?: string;
  partner?: {
    fullName?: string;
    shop?: { shopName?: string };
  };
}

interface OrderListResponse {
  getOrderListByUser: {
    results: OrderApiItem[];
  };
}

function toLatLng(item: OrderApiItem): LatLng | null {
  const lat = Number(item.pickupLatitude);
  const lng = Number(item.pickupLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null; // sentinel for "not yet geocoded"
  return { lat, lng };
}

function toPickupPoint(item: OrderApiItem, index: number): PickupPoint | null {
  const origin = toLatLng(item);
  if (!origin) return null;

  return {
    id: item.id,
    path: [origin],
    label: item.partner?.shop?.shopName ?? item.partner?.fullName ?? `Pickup ${index + 1}`,
    status: item.status,
    partnerName: item.partner?.fullName,
    address: item.pickupAddress,
    estimatedDistanceMeters: item.estimatedDistanceMeters,
    estimatedDurationSeconds: item.estimatedDurationSeconds,
    estimatedDistanceMetersText: item.estimatedDistanceMetersText,
    estimatedDurationSecondsText: item.estimatedDurationSecondsText,
    parcelCount: item.estimatedTotalParcel,
  };
}

// dateStr is a local calendar date ("YYYY-MM-DD"); the range covers that whole local day.
function dayRange(dateStr: string): { startAt: string; endAt: string } {
  return {
    startAt: new Date(`${dateStr}T00:00:00`).toISOString(),
    endAt: new Date(`${dateStr}T23:59:59.999`).toISOString(),
  };
}

export async function fetchDriverOrders(
  driverToken: string,
  dateStr: string,
  pickupTime?: PickupTimeSlot | '',
  signal?: AbortSignal
): Promise<PickupPoint[]> {
  if (!driverToken) return [];

  const filter = { ...dayRange(dateStr), ...(pickupTime ? { pickupTime } : {}) };

  const data = await gqlRequest<OrderListResponse>(
    ORDER_SERVICE_URL,
    GET_ORDER_LIST_QUERY,
    { limit: 20, offset: 0, filter },
    driverToken,
    signal
  );

  return data.getOrderListByUser.results
    .map(toPickupPoint)
    .filter((pickup): pickup is PickupPoint => pickup !== null);
}
