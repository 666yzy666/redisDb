import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import AdminLayout from '../layouts/AdminLayout.vue';

const routes = [
  { path: '/', redirect: '/home' },

  // 无布局(全屏认证页)
  { path: '/login', component: () => import('../views/auth/LoginView.vue') },
  { path: '/register', component: () => import('../views/auth/RegisterView.vue') },
  { path: '/forgot-password', component: () => import('../views/auth/ForgotPasswordView.vue') },

  // 前台(顶栏布局,需登录)
  {
    path: '/',
    component: DefaultLayout,
    meta: { requiresAuth: true },
    children: [
      { path: 'home', component: () => import('../views/HomeView.vue') },
      { path: 'profile', component: () => import('../views/user/ProfileView.vue') },
      { path: 'orders', component: () => import('../views/user/OrdersView.vue') },
      { path: 'announcements', component: () => import('../views/user/AnnouncementsView.vue') },
    ],
  },

  // 后台(侧边栏布局,需管理员)
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      { path: 'dashboard', component: () => import('../views/admin/DashboardView.vue') },
      { path: 'users', component: () => import('../views/admin/UsersView.vue') },
      { path: 'orders', component: () => import('../views/admin/OrdersView.vue') },
      { path: 'announcements', component: () => import('../views/admin/AnnouncementsView.vue') },
      { path: 'settings', component: () => import('../views/admin/SettingsView.vue') },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const auth = useAuthStore();
  const needsAuth = to.matched.some((r) => r.meta.requiresAuth);
  const needsAdmin = to.matched.some((r) => r.meta.requiresAdmin);
  if (needsAuth && !auth.isLoggedIn) return '/login';
  if (needsAdmin && !auth.isAdmin) return '/home';
  if (['/login', '/register', '/forgot-password'].includes(to.path) && auth.isLoggedIn) return '/home';
});

export default router;
