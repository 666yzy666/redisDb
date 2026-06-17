<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

function onLogout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-gray-100 gap-4">
    <h1 class="text-2xl font-bold">登录成功 🎉</h1>
    <p class="text-gray-700">当前用户:{{ auth.user?.email }}</p>
    <button @click="onLogout" class="bg-red-500 text-white rounded px-4 py-2">退出登录</button>
  </div>
</template>
