<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useAppStore } from '../../stores/app';

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const error = ref('');
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();
const app = useAppStore();

onMounted(() => app.loadPublic && app.loadPublic());

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
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
    <!-- 渐变背景 -->
    <div class="absolute inset-0 bg-gradient-to-br from-gray-50 via-teal-50/40 to-gray-100"></div>
    <!-- 装饰光球 + 网格纹理 -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-teal-400/20 blur-3xl"></div>
      <div class="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl"></div>
      <div class="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-300/10 blur-3xl"></div>
      <div class="absolute inset-0 bg-[linear-gradient(rgba(20,184,166,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(20,184,166,0.04)_1px,transparent_1px)] bg-[size:64px_64px]"></div>
    </div>

    <!-- 内容 -->
    <div class="relative z-10 w-full max-w-md">
      <!-- 品牌 -->
      <div class="mb-8 text-center">
        <div class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 shadow-lg shadow-teal-500/30">
          <svg class="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 class="mb-1 bg-gradient-to-r from-teal-600 to-emerald-600 bg-clip-text text-3xl font-bold text-transparent">
          {{ app.siteName }}
        </h1>
        <p class="text-sm text-gray-500">登录到你的账户</p>
      </div>

      <!-- 毛玻璃卡片 -->
      <div class="rounded-2xl bg-white/80 p-8 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl">
        <div class="mb-6 text-center">
          <h2 class="text-2xl font-bold text-gray-900">欢迎回来</h2>
          <p class="mt-1 text-sm text-gray-500">请输入邮箱和密码登录</p>
        </div>

        <form class="space-y-5" @submit.prevent="onSubmit">
          <!-- 邮箱 -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700">邮箱</label>
            <div class="relative">
              <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <input v-model="email" type="email" required autofocus placeholder="you@example.com"
                class="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-11 pr-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" />
            </div>
          </div>

          <!-- 密码 -->
          <div>
            <label class="mb-1.5 block text-sm font-medium text-gray-700">密码</label>
            <div class="relative">
              <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input v-model="password" :type="showPassword ? 'text' : 'password'" required placeholder="••••••••"
                class="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-11 pr-11 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" />
              <button type="button" @click="showPassword = !showPassword"
                class="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 transition hover:text-gray-600">
                <svg v-if="showPassword" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
                <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            </div>
            <div class="mt-1.5 text-right">
              <router-link to="/forgot-password" class="text-sm font-medium text-teal-600 transition hover:text-teal-500">忘记密码?</router-link>
            </div>
          </div>

          <p v-if="error" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</p>

          <button type="submit" :disabled="loading"
            class="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 py-2.5 font-medium text-white shadow-lg shadow-teal-500/25 transition hover:from-teal-600 hover:to-emerald-600 disabled:opacity-50">
            <svg v-if="loading" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            {{ loading ? '登录中...' : '登录' }}
          </button>
        </form>
      </div>

      <!-- 页脚 -->
      <div class="mt-6 text-center text-sm text-gray-500">
        没有账号?<router-link to="/register" class="font-medium text-teal-600 hover:text-teal-500">去注册</router-link>
      </div>
    </div>
  </div>
</template>
