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

export interface CodSettlementHistoryItem {
  id: string;
  refNo: string;
  startAt: string;
  endAt: string;
  totalCodUsd?: number;
  totalCodKhr?: number;
  requestedAmount: number;
  settledAmount?: number;
  status: DriverCodSettlementStatus;
  proofImage?: string;
  rejectReason?: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  createdAt: string;
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
          startAt
          endAt
          totalCodUsd
          totalCodKhr
          requestedAmount
          settledAmount
          status
          proofImage
          rejectReason
          submittedAt
          approvedAt
          rejectedAt
          createdAt
        }
        metadata { total limit offset }
      }
    }`,
    { filter: { startAt, endAt }, limit, offset },
  ).then((data) => data.myDriverCodSettlements);
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
