<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <header class="bg-white shadow flex items-center justify-between px-6 h-14">
      <div class="font-bold text-blue-600">MiniApp 框架</div>
      <nav class="flex items-center gap-4 text-sm">
        <router-link to="/home" class="text-gray-700 hover:text-blue-600">首页</router-link>
        <router-link to="/profile" class="text-gray-700 hover:text-blue-600">个人资料</router-link>
        <router-link to="/orders" class="text-gray-700 hover:text-blue-600">我的订单</router-link>
        <router-link v-if="auth.isAdmin" to="/admin/dashboard" class="text-gray-700 hover:text-blue-600">后台</router-link>
        <span class="text-gray-400">{{ auth.user?.email }}</span>
        <button @click="logout" class="text-red-500 hover:underline">退出</button>
      </nav>
    </header>
    <main class="p-6"><router-view /></main>
  </div>
</template>
