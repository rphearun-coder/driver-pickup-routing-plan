import { gqlRequest } from './graphql';
import { LOCATION_SERVICE_URL } from '../config';
import type { OnlineStatus } from '../types';

export interface OnlineStatusResult {
  status: OnlineStatus;
  updatedAt: string;
}

const GET_ONLINE_STATUS_QUERY = `
  query GetOnlineStatus {
    getOnlineStatus {
      status
      updatedAt
    }
  }
`;

const TOGGLE_ONLINE_STATUS_MUTATION = `
  mutation ToggleOnlineStatus {
    toggleOnlineStatus {
      status
      updatedAt
    }
  }
`;

export async function getOnlineStatus(driverToken: string): Promise<OnlineStatusResult> {
  const data = await gqlRequest<{ getOnlineStatus: OnlineStatusResult }>(
    LOCATION_SERVICE_URL,
    GET_ONLINE_STATUS_QUERY,
    undefined,
    driverToken
  );
  return data.getOnlineStatus;
}

export async function toggleOnlineStatus(driverToken: string): Promise<OnlineStatusResult> {
  const data = await gqlRequest<{ toggleOnlineStatus: OnlineStatusResult }>(
    LOCATION_SERVICE_URL,
    TOGGLE_ONLINE_STATUS_MUTATION,
    undefined,
    driverToken
  );
  return data.toggleOnlineStatus;
}
