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
  <div class="min-h-screen flex bg-gray-100">
    <aside class="w-48 bg-gray-800 text-gray-100 flex flex-col">
      <div class="h-14 flex items-center px-4 font-bold border-b border-gray-700">管理后台</div>
      <nav class="flex-1 p-2 space-y-1 text-sm">
        <router-link to="/admin/dashboard" class="block px-3 py-2 rounded hover:bg-gray-700">仪表盘</router-link>
        <router-link to="/admin/users" class="block px-3 py-2 rounded hover:bg-gray-700">用户管理</router-link>
        <!-- SP2 起在此加：用户管理 / 订单 等 -->
      </nav>
      <router-link to="/home" class="px-4 py-3 text-xs text-gray-400 hover:text-white border-t border-gray-700">← 返回前台</router-link>
    </aside>
    <div class="flex-1 flex flex-col">
      <header class="bg-white shadow flex items-center justify-end px-6 h-14 gap-4 text-sm">
        <span class="text-gray-400">{{ auth.user?.email }}（管理员）</span>
        <button @click="logout" class="text-red-500 hover:underline">退出</button>
      </header>
      <main class="p-6 flex-1"><router-view /></main>
    </div>
  </div>
</template>
