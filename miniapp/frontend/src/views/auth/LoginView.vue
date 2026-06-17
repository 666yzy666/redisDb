<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();

async function onSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    router.push('/home');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <form class="bg-white p-8 rounded-lg shadow w-80 space-y-4" @submit.prevent="onSubmit">
      <h1 class="text-xl font-bold text-center">登录</h1>
      <input v-model="email" type="email" placeholder="邮箱" class="w-full border rounded px-3 py-2" />
      <input v-model="password" type="password" placeholder="密码" class="w-full border rounded px-3 py-2" />
      <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
      <button :disabled="loading" class="w-full bg-blue-600 text-white rounded py-2 disabled:opacity-50">
        {{ loading ? '登录中...' : '登录' }}
      </button>
      <p class="text-sm text-center">没有账号?<router-link to="/register" class="text-blue-600">去注册</router-link></p>
    </form>
  </div>
</template>
