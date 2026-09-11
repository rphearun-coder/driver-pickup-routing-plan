import { gqlRequest } from './graphql';
import { LOCATION_SERVICE_URL } from '../config';
import type { OnlineStatus } from '../types';

const GET_ONLINE_STATUS_QUERY = `
  query GetOnlineStatus {
    getOnlineStatus
  }
`;

const TOGGLE_ONLINE_STATUS_MUTATION = `
  mutation ToggleOnlineStatus {
    toggleOnlineStatus
  }
`;

export async function getOnlineStatus(driverToken: string): Promise<OnlineStatus> {
  const data = await gqlRequest<{ getOnlineStatus: OnlineStatus }>(
    LOCATION_SERVICE_URL,
    GET_ONLINE_STATUS_QUERY,
    undefined,
    driverToken
  );
  return data.getOnlineStatus;
}

export async function toggleOnlineStatus(driverToken: string): Promise<OnlineStatus> {
  const data = await gqlRequest<{ toggleOnlineStatus: OnlineStatus }>(
    LOCATION_SERVICE_URL,
    TOGGLE_ONLINE_STATUS_MUTATION,
    undefined,
    driverToken
  );
  return data.toggleOnlineStatus;
}
