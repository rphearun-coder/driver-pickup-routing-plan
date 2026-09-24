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

function queryPayment<T>(query: string, variables: Record<string, unknown> = {}) {
  return postGraphQL<T>(paymentHttp, query, variables, 'Payment service');
}

// Reachability check used by the Profile page's service-status list.
export function checkPaymentService() {
  return queryPayment<{ __typename: string }>('query { __typename }');
}
