import axios from 'axios';
import { postGraphQL } from '../lib/graphql-request';
import type { DriverDashboardSummary } from '../types/api';

const orderHttp = axios.create({
  baseURL: import.meta.env.VITE_ORDER_SERVICE_URL ?? 'http://localhost:8082/v1',
  headers: {
    'Content-Type': 'application/json',
    'x-platform': 'web',
    'x-udid': 'jalat-client',
  },
});

function queryOrderService<T>(query: string, variables: Record<string, unknown> = {}) {
  return postGraphQL<T>(orderHttp, query, variables, 'Order service');
}

export interface DateRange {
  startAt: string;
  endAt: string;
}

export function todayRange(): DateRange {
  const now = new Date();
  const startAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
}

export function thisWeekRange(): DateRange {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export function thisMonthRange(): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export const DATE_RANGE_OPTIONS = [
  { key: 'today', label: 'Today', range: todayRange },
  { key: 'week', label: 'This Week', range: thisWeekRange },
  { key: 'month', label: 'This Month', range: thisMonthRange },
] as const;

export type DateRangeKey = (typeof DATE_RANGE_OPTIONS)[number]['key'];

// "Thu, Sep 24" for a single day, "Sep 21 – 24" / "Aug 31 – Sep 3" for a span.
export function rangeDatesText(key: DateRangeKey): string {
  const option = DATE_RANGE_OPTIONS.find((o) => o.key === key);
  if (!option) return '';
  const { startAt, endAt } = option.range();
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (start.toDateString() === end.toDateString()) {
    return start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const startText = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endText =
    start.getMonth() === end.getMonth()
      ? String(end.getDate())
      : end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${startText} – ${endText}`;
}

export function getDriverDashboard(range: DateRange = todayRange()) {
  return queryOrderService<{ driverDashboard: DriverDashboardSummary }>(
    `query DriverDashboard($startAt: String!, $endAt: String!) {
      driverDashboard(startAt: $startAt, endAt: $endAt) {
        totalDeliveryParcel
        totalRemainingDelivery
        totalDeliverySuccess
        totalDeliveryFailed
        totalBeReturn
        totalReturn
        collectionTotalCodUSD
      }
    }`,
    { ...range },
  ).then((data) => data.driverDashboard);
}
