import { createRouter, createWebHistory } from 'vue-router';
import Home from '@/pages/Home.vue';
import PublicTrackingPage from '@/pages/PublicTrackingPage.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: Home,
    },
    {
      path: '/track/:driverId',
      component: PublicTrackingPage,
      props: true,
    },
  ],
});

export default router;
