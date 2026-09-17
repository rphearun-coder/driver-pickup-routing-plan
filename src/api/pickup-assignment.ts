import axios from 'axios';
import { postGraphQL } from '../lib/graphql-request';

const driverPickupHttp = axios.create({
  baseURL: import.meta.env.VITE_DRIVER_API_BASE_URL ?? 'http://localhost:8084/v1',
  headers: {
    'Content-Type': 'application/json',
    'x-platform': 'web',
    'x-udid': 'jalat-client',
  },
});

export interface DriverPickupAssignment {
  id: string;
  driverId: string;
  zoneId: string;
  parcelId?: string;
  orderId?: string;
  partnerId?: string;
  latitude?: number;
  longitude?: number;
  status: string;
  sequence?: number | null;
}

export interface OptimizedRoute {
  distanceMeters: number;
  durationSeconds: number;
  pickups: DriverPickupAssignment[];
}

export interface AssignPickupInput {
  driverId: string;
  zoneId: string;
  parcelId?: string;
  orderId?: string;
  partnerId?: string;
  latitude: number;
  longitude: number;
}

function queryPickupAssignment<T>(query: string, variables: Record<string, unknown> = {}) {
  return postGraphQL<T>(driverPickupHttp, query, variables, 'Driver pickup service');
}

export function assignPickupToDriver(input: AssignPickupInput) {
  return queryPickupAssignment<{ assignPickupToDriver: DriverPickupAssignment }>(
    `mutation AssignPickupToDriver($input: AssignPickupInput!) {
      assignPickupToDriver(input: $input) {
        id
        driverId
        zoneId
        parcelId
        orderId
        partnerId
        latitude
        longitude
        status
        sequence
      }
    }`,
    { input },
  ).then((data) => data.assignPickupToDriver);
}

export function optimizeDriverRoute(driverId: string, latitude: number, longitude: number) {
  return queryPickupAssignment<{ optimizeDriverRoute: OptimizedRoute }>(
    `mutation OptimizeDriverRoute($driverId: String!, $latitude: Float!, $longitude: Float!) {
      optimizeDriverRoute(driverId: $driverId, latitude: $latitude, longitude: $longitude) {
        distanceMeters
        durationSeconds
        pickups {
          id
          driverId
          zoneId
          parcelId
          orderId
          partnerId
          latitude
          longitude
          status
          sequence
        }
      }
    }`,
    { driverId, latitude, longitude },
  ).then((data) => data.optimizeDriverRoute);
}
