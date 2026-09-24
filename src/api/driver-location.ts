import { gqlRequest } from './graphql';
import { LOCATION_SERVICE_URL } from '../config';
import type { DriverLocation } from '../types';

const GET_DRIVER_LASTED_LOCATION_QUERY = `
  query GetDriverLastedLocation($args: GetDriverLocation!) {
    getDriverLastedLocation(args: $args) {
      driverId
      lat
      lon
      lastUpdatedAt
    }
  }
`;

// Jalat-Location-Service's getDriverLastedLocation is unauthenticated and reads the
// same Tile38 store the MQTT pipeline writes to — it's the "last known position" a
// fresh subscriber (no retained MQTT message for this specific driver) can seed from.
export async function getDriverLastedLocation(
  driverId: string,
  driverShift: 'PICKUP' | 'DELIVERY' = 'PICKUP',
): Promise<DriverLocation | null> {
  const data = await gqlRequest<{ getDriverLastedLocation: DriverLocation | null }>(
    LOCATION_SERVICE_URL,
    GET_DRIVER_LASTED_LOCATION_QUERY,
    { args: { driverId, driverShift } },
  );
  return data.getDriverLastedLocation;
}

const GET_DRIVER_DISPLAY_NAME_QUERY = `
  query GetDriverDisplayName($args: GetDriverLocation!) {
    getDriverLastedLocation(args: $args) {
      driver { fullName }
    }
  }
`;

// For the public tracking page — shows who the customer is looking at instead of just a
// raw driver id. Deliberately only asks for fullName, never phoneNumber: this query is
// unauthenticated, reachable by anyone with a tracking link.
export async function getDriverDisplayName(
  driverId: string,
  driverShift: 'PICKUP' | 'DELIVERY' = 'PICKUP',
): Promise<string | null> {
  const data = await gqlRequest<{ getDriverLastedLocation: { driver?: { fullName?: string } } | null }>(
    LOCATION_SERVICE_URL,
    GET_DRIVER_DISPLAY_NAME_QUERY,
    { args: { driverId, driverShift } },
  );
  return data.getDriverLastedLocation?.driver?.fullName || null;
}
