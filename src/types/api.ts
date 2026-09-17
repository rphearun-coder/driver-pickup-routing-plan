export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName?: string;
  phoneNumber?: string;
  avatar?: string;
  userType: string;
  status: string;
  roles: string[];
}

export interface DriverDashboardSummary {
  totalDeliveryParcel: number;
  totalRemainingDelivery: number;
  totalDeliverySuccess: number;
  totalDeliveryFailed: number;
  totalBeReturn: number;
  totalReturn: number;
  collectionTotalCodUSD: number;
}

export const OrderStatus = {
  PENDING: 'PENDING',
  SETTLED: 'SETTLED',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export interface OrderRecord {
  id: number;
  driverId: number;
  customerId: number;
  warehouseId: number;
  amount: number;
  description?: string;
  status: OrderStatus;
  createdAt: string;
  settledAt?: string;
  platformFee?: number;
  driverPayout?: number;
}

export interface WarehouseRecord {
  id: number;
  name: string;
  address: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface CreateOrderPayload {
  customerId: number;
  warehouseId: number;
  amount: number;
  description?: string;
}

export type PickupOrderStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'PICKED_UP'
  | 'ABORT_PICK_UP'
  | 'CANCELLED'
  | 'DELETED'
  | 'ON_ROUTE'
  | 'REGISTERED'
  | 'PRINTED';

export interface PickupOrderShop {
  shopName?: string;
  shopImage?: string;
  address?: string;
  longitude?: number;
  latitude?: number;
  zone?: { id: string; commune?: string };
}

export interface PickupOrderPartner {
  id?: string;
  fullName?: string;
  phoneNumber?: string;
  shop?: PickupOrderShop;
}

export interface PickupOrderItem {
  id: string;
  driverId?: string;
  status: PickupOrderStatus;
  onRoute?: boolean;
  estimatedTotalParcel?: number;
  pickupAddress?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  estimatedDistanceMeters?: number;
  estimatedDurationSeconds?: number;
  estimatedDistanceMetersText?: string;
  estimatedDurationSecondsText?: string;
  pickupAt?: string;
  createdAt?: string;
  partner?: PickupOrderPartner;
}

export interface PickupOrderListResult {
  metadata: { total: number; limit: number; offset: number };
  results: PickupOrderItem[];
  extraData?: {
    totalEstimatedDistanceMeters?: number;
    totalEstimatedDurationSeconds?: number;
    totalEstimatedDistanceMetersText?: string;
    totalEstimatedDurationSecondsText?: string;
  };
}
