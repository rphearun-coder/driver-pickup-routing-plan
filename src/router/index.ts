import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import AuthLayout from '../layouts/auth/AuthLayout.vue';
import GuestLayout from '../layouts/guest/GuestLayout.vue';
import MapLayout from '../layouts/map/MapLayout.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: AuthLayout,
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('../pages/HomePage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'profile',
          name: 'profile',
          component: () => import('../pages/ProfilePage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'notifications',
          name: 'notifications',
          component: () => import('../pages/NotificationsPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'device-gps',
          name: 'device-gps',
          component: () => import('../pages/DeviceGpsPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'pickups',
          name: 'pickups',
          component: () => import('../pages/PickupPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'deliveries',
          name: 'deliveries',
          component: () => import('../pages/DeliveriesPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'returns',
          name: 'returns',
          component: () => import('../pages/ReturnedPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'delivery-history',
          name: 'delivery-history',
          component: () => import('../pages/DeliveryHistoryPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'pickup-history',
          name: 'pickup-history',
          component: () => import('../pages/PickupHistoryPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'settlement-history',
          name: 'settlement-history',
          component: () => import('../pages/SettlementHistoryPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'orders/:id',
          name: 'order-detail',
          component: () => import('../pages/OrderDetailPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'parcels/:id',
          name: 'parcel-detail',
          component: () => import('../pages/ParcelDetailPage.vue'),
          meta: { requiresAuth: true },
        },
      ],
    },
    {
        path: '/',
      component: MapLayout,
      children: [
        {
          path: 'pickup-map',
          name: 'pickup-map',
          component: () => import('../pages/map/PickUpmapPage.vue'),
          meta: { requiresAuth: true },
        }, {
          // Public — this is the link shared via DriverPanel's "Copy link" (see
          // PickUpmapPage.vue's handleInvite), meant to be opened by a customer
          // who isn't logged in as a driver at all.
          path: 'pickup-map/:driverId',
          name: 'pickup-map-tracking',
          component: () => import('../pages/map/PublicTrackingPage.vue'),
        },
      ]
    },
    {
      path: '/',
      component: GuestLayout,
      children: [
        { path: 'splash', name: 'splash', component: () => import('../pages/guest/SplashPage.vue') },
        { path: 'login', name: 'login', component: () => import('../pages/guest/LoginPage.vue') },
      ],
    },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' };
  }
  return true;
});

export default router;
