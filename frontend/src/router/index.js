import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  { path: '/', redirect: '/home' },
  { path: '/login', component: () => import('../views/auth/LoginView.vue') },
  { path: '/register', component: () => import('../views/auth/RegisterView.vue') },
  { path: '/home', component: () => import('../views/HomeView.vue'), meta: { requiresAuth: true } },
];

const router = createRouter({ history: createWebHistory(), routes });

// 全局前置守卫:未登录访问受保护页 → 跳登录;已登录访问登录/注册页 → 跳首页
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isLoggedIn) return '/login';
  if ((to.path === '/login' || to.path === '/register') && auth.isLoggedIn) return '/home';
});

export default router;
