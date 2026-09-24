import axios from 'axios';
import { postGraphQL } from '../lib/graphql-request';
import { uploadImageToFolder } from '../lib/upload-request';

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

function queryOrderService<T>(query: string, variables: Record<string, unknown> = {}) {
  return postGraphQL<T>(orderHttp, query, variables, 'Order service');
}

export type DriverCodSettlementStatus = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface DailyCodSettlement {
  totalCod: number;
  totalCodUsd: number;
  totalCodKhr: number;
  id?: string;
  requestedAmount?: number;
  settledAmount?: number;
  status?: DriverCodSettlementStatus;
  proofImage?: string;
  driverNote?: string;
}

export function getMyDailyCodSettlement(startAt?: string, endAt?: string) {
  return queryOrderService<{ myDailyCodSettlement: DailyCodSettlement }>(
    `query MyDailyCodSettlement($startAt: String, $endAt: String) {
      myDailyCodSettlement(startAt: $startAt, endAt: $endAt) {
        totalCod
        totalCodUsd
        totalCodKhr
        id
        requestedAmount
        settledAmount
        status
        proofImage
        driverNote
      }
    }`,
    { startAt, endAt },
  ).then((data) => data.myDailyCodSettlement);
}

export interface CodSettlementActivity {
  status: DriverCodSettlementStatus;
  requestedAmount?: number;
  settledAmount?: number;
  rejectReason?: string;
  actionByName?: string;
  createdAt: string;
}

export interface CodSettlementHistoryItem {
  id: string;
  refNo: string;
  driverId: string;
  driverName?: string;
  driverPhoneNumber?: string;
  startAt: string;
  endAt: string;
  totalCodUsd?: number;
  totalCodKhr?: number;
  requestedAmount: number;
  settledAmount?: number;
  status: DriverCodSettlementStatus;
  proofImage?: string;
  proofImages?: string[];
  driverNote?: string;
  rejectReason?: string;
  createdByName?: string;
  reviewedByName?: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  createdAt: string;
  updatedAt?: string;
  history?: CodSettlementActivity[];
}

export interface CodSettlementListResult {
  results: CodSettlementHistoryItem[];
  metadata: { total: number; limit: number; offset: number };
}

export function getMyDriverCodSettlements(startAt?: string, endAt?: string, limit = 20, offset = 0) {
  return queryOrderService<{ myDriverCodSettlements: CodSettlementListResult }>(
    `query MyDriverCodSettlements($filter: DriverCodSettlementListFilter, $limit: Int, $offset: Int) {
      myDriverCodSettlements(filter: $filter, limit: $limit, offset: $offset) {
        results {
          id
          refNo
          driverId
          driverName
          driverPhoneNumber
          startAt
          endAt
          totalCodUsd
          totalCodKhr
          requestedAmount
          settledAmount
          status
          proofImage
          proofImages
          driverNote
          rejectReason
          createdByName
          reviewedByName
          submittedAt
          approvedAt
          rejectedAt
          createdAt
          updatedAt
          history { status requestedAmount settledAmount rejectReason actionByName createdAt }
        }
        metadata { total limit offset }
      }
    }`,
    { filter: { startAt, endAt }, limit, offset },
  ).then((data) => data.myDriverCodSettlements);
}

export interface SettlementParcel {
  id: number;
  parcelId: string;
  parcelUID?: string;
  recipientNumber: string;
  location: string;
  codUsd?: number;
  codRiel?: number;
  fee?: number;
  status: string;
  reason?: string;
  noted?: string;
  deliveredAt?: string;
  updatedAt?: string;
}

// A settlement's period is stored as bare dates ("2026-09-24", Postgres `date`) meaning
// Cambodia days — the server reads them `AT TIME ZONE 'Asia/Phnom_Penh'` (UTC+7, no DST).
// The daily-history query compares timestamps, so widen them to the whole Phnom Penh day
// regardless of the phone's own timezone.
function toRangeBound(value: string, edge: 'start' | 'end'): string {
  if (value.length !== 10) return value;
  return new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}+07:00`).toISOString();
}

export function settlementPeriodRange(item: Pick<CodSettlementHistoryItem, 'startAt' | 'endAt'>) {
  return { startAt: toRangeBound(item.startAt, 'start'), endAt: toRangeBound(item.endAt, 'end') };
}

// The parcels behind a settlement — the same parcel_daily_history rows the server
// sums into the settlement's COD total ($getTotalCOD), for the settlement's period.
export function getSettlementParcels(driverId: string, startAt: string, endAt: string) {
  return queryOrderService<{ getParcelDeliveredByDriver: SettlementParcel[] }>(
    `query SettlementParcels($driverId: String!, $startAt: String!, $endAt: String!) {
      getParcelDeliveredByDriver(driverId: $driverId, startAt: $startAt, endAt: $endAt) {
        id
        parcelId
        parcelUID
        recipientNumber
        location
        codUsd
        codRiel
        fee
        status
        reason
        noted
        deliveredAt
        updatedAt
      }
    }`,
    { driverId, startAt: toRangeBound(startAt, 'start'), endAt: toRangeBound(endAt, 'end') },
  ).then((data) => {
    // One row per parcel per day, keeping the latest — the server's total dedupes the same way.
    const latest = new Map<string, SettlementParcel>();
    for (const row of data.getParcelDeliveredByDriver ?? []) {
      const key = `${row.parcelId}|${(row.deliveredAt ?? '').slice(0, 10)}`;
      const prev = latest.get(key);
      if (!prev || (row.updatedAt ?? '') > (prev.updatedAt ?? '')) latest.set(key, row);
    }
    return [...latest.values()].sort((a, b) => (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? ''));
  });
}

// The Jalat COD collection account drivers pay settlements into — set by Operation
// (updateCodABAQRCodeSetting), public query. qrCode is an OBS image key (resolve with
// resolveParcelImageUrl); payWayUrl is an ABA PayWay payment link.
export interface CodPaymentAccount {
  accountName?: string;
  accountNumber?: string;
  qrCode?: string;
  payWayUrl?: string;
}

export function getCodPaymentAccount() {
  return queryOrderService<{ getABAQRCodeSetting: CodPaymentAccount }>(
    `query GetABAQRCodeSetting {
      getABAQRCodeSetting { accountName accountNumber qrCode payWayUrl }
    }`,
  ).then((data) => data.getABAQRCodeSetting);
}

export function submitCodSettlement(input: { id: string; proofImage: string; driverNote?: string }) {
  return queryOrderService<{ driverSubmitCodSettlement: DailyCodSettlement }>(
    `mutation DriverSubmitCodSettlement($input: DriverSubmitCodSettlementInput!) {
      driverSubmitCodSettlement(input: $input) {
        id
        status
        proofImage
      }
    }`,
    { input },
  ).then((data) => data.driverSubmitCodSettlement);
}

// Bare OBS key (not a full URL) — matches the convention used for parcel/receipt
// images elsewhere, resolved against VITE_OBS_BASE_URL when displayed.
export function uploadSettlementProof(file: File): Promise<string> {
  return uploadImageToFolder(ORDER_REST_BASE_URL, file, 'other');
}
