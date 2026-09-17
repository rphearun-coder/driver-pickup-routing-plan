import axios from 'axios';
import { postGraphQL } from '../lib/graphql-request';

const paymentHttp = axios.create({
  baseURL: import.meta.env.VITE_PAYMENT_SERVICE_URL ?? 'http://localhost:8083/v1',
  headers: {
    'Content-Type': 'application/json',
    'x-platform': 'web',
    'x-udid': 'jalat-client',
  },
});

export interface PackageService {
  id: string;
  name: string;
  numberOfCredit: number;
  totalPrice: number;
  numberOfExpireDay: number;
  description?: string;
  status: string;
}

export interface PaginatedPackageServices {
  results: PackageService[];
  metadata: { total: number; limit: number; offset: number };
}

export interface PartnerPackageService {
  id: string;
  packageServiceId: string;
  totalCredit: number;
  totalCreditUsed: number;
  totalCreditRemaining: number;
  expiredDate: string;
}

function queryPayment<T>(query: string, variables: Record<string, unknown> = {}) {
  return postGraphQL<T>(paymentHttp, query, variables, 'Payment service');
}

export function checkPaymentService() {
  return queryPayment<{ __typename: string }>('query { __typename }');
}

export function listPackageServices(limit = 20, offset = 0) {
  return queryPayment<{ packageServices: PaginatedPackageServices }>(
    `query ListPackageServices($limit: Int!, $offset: Int!) {
      packageServices(limit: $limit, offset: $offset, filter: {}) {
        results {
          id
          name
          numberOfCredit
          totalPrice
          numberOfExpireDay
          description
          status
        }
        metadata {
          total
          limit
          offset
        }
      }
    }`,
    { limit, offset },
  ).then((data) => data.packageServices);
}

export function createPackageService(input: {
  name: string;
  numberOfCredit: number;
  totalPrice: number;
  numberOfExpireDay: number;
}) {
  return queryPayment<{ createPackageService: PackageService }>(
    `mutation CreatePackageService($input: CreatePackageServiceInput!) {
      createPackageService(input: $input) {
        id
        name
        numberOfCredit
        totalPrice
        numberOfExpireDay
        description
        status
      }
    }`,
    { input },
  ).then((data) => data.createPackageService);
}

export function getPartnerPackageServiceByUser(userId: string) {
  return queryPayment<{ getPartnerPackageServiceByUser: PartnerPackageService }>(
    `query GetPartnerPackageService($userId: String!) {
      getPartnerPackageServiceByUser(userId: $userId) {
        id
        packageServiceId
        totalCredit
        totalCreditUsed
        totalCreditRemaining
        expiredDate
      }
    }`,
    { userId },
  ).then((data) => data.getPartnerPackageServiceByUser);
}
