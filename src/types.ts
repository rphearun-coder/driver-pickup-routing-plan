export interface DriverLocation {
  driverId: string;
  lat: number | string;
  lon: number | string;
  driverShift?: number;
  shiftType?: number;
  [key: string]: unknown;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type OrderStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'PICKED_UP'
  | 'ABORT_PICK_UP'
  | 'CANCELLED'
  | 'DELETED'
  | 'ON_ROUTE'
  | 'REGISTERED'
  | 'PRINTED';

export type PickupTimeSlot = 'MORNING' | 'AFTERNOON' | 'EVENING';

export interface PickupPoint {
  id?: string;
  path: LatLng[];
  label: string;
  status?: OrderStatus;
  partnerName?: string;
  address?: string;
  estimatedDistanceMeters?: number;
  estimatedDurationSeconds?: number;
  estimatedDistanceMetersText?: string;
  estimatedDurationSecondsText?: string;
  parcelCount?: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export type OnlineStatus = 'ONLINE' | 'OFFLINE';

export interface AuthUser {
  id: string;
  username?: string;
  fullName?: string;
}

export interface BankAccount {
  id: string;
  userId: string;
  accountType: string;
  accountNumber: string;
  accountName: string;
}

export interface DriverSubProfile {
  zoneId?: string;
  nationalIdentity?: string;
  vehicleIdentity?: string;
}

export interface UserProfile {
  id: string;
  fullName?: string;
  avatar?: string;
  phoneNumber?: string;
  roleId?: string;
  gender?: string;
  bankAccounts?: BankAccount[];
  driverProfile?: DriverSubProfile;
}
