import { defineStore } from 'pinia';
import type { PickupOrderItem } from '../types/api';
import type { Parcel } from '../api/parcels';

// Neither getOrderListByUser nor getDeliveryList/driverListReturnParcel has a
// "get one by id" counterpart on the backend, so detail pages can't refetch by
// route param alone. List pages already hold the full item in memory — they
// stash it here right before navigating, and the detail view reads it back.
export const useOrderDetailStore = defineStore('orderDetail', {
  state: () => ({
    order: null as PickupOrderItem | null,
    parcel: null as Parcel | null,
  }),
  actions: {
    setOrder(order: PickupOrderItem) {
      this.order = order;
    },
    setParcel(parcel: Parcel) {
      this.parcel = parcel;
    },
  },
});
