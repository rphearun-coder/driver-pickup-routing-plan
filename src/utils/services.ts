export type ServiceType = 'pickup' | 'delivery' | 'return';

export interface ServiceInfo {
  /** Plural, for navigation and lists. */
  label: string;
  /** Singular, for headers. */
  title: string;
  hint: string;
  /** Router route name. */
  route: string;
  /** Gradient of the brand pin — the warm Jalat ramp, one step apart per service. */
  from: string;
  to: string;
}

// Single source of truth for Pickup / Delivery / Return: labels, routes and brand colours live
// here so the nav, headers, home shortcuts and any future screen stay in step.
export const SERVICES: Record<ServiceType, ServiceInfo> = {
  pickup: { label: 'Pickups', title: 'Pickup', hint: 'Collect parcels', route: 'pickups', from: '#ffcf6b', to: '#f4a340' },
  delivery: { label: 'Deliveries', title: 'Delivery', hint: 'Deliver to customers', route: 'deliveries', from: '#ffbe5c', to: '#ec7a1c' },
  return: { label: 'Returns', title: 'Return', hint: 'Bring parcels back', route: 'returns', from: '#ffae8f', to: '#e5573c' },
};
