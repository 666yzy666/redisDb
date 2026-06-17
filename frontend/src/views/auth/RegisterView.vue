<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { sendCode } from '../../api/auth';

const email = ref('');
const password = ref('');
const code = ref('');
const error = ref('');
const info = ref('');
const loading = ref(false);
const countdown = ref(0);
const router = useRouter();
const auth = useAuthStore();

async function onSendCode() {
  error.value = '';
  info.value = '';
  try {
    const res = await sendCode(email.value);
    info.value = res.code ? `验证码(dev):${res.code}` : '验证码已发送,请查收邮箱';
    countdown.value = 60;
    const timer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0) clearInterval(timer);
    }, 1000);
  } catch (e) {
    error.value = e.message;
  }
}

async function onSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.register(email.value, password.value, code.value);
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
      <h1 class="text-xl font-bold text-center">注册</h1>
      <input v-model="email" type="email" placeholder="邮箱" class="w-full border rounded px-3 py-2" />
      <div class="flex gap-2">
        <input v-model="code" placeholder="验证码" class="flex-1 border rounded px-3 py-2" />
        <button type="button" :disabled="countdown > 0" @click="onSendCode"
          class="whitespace-nowrap border rounded px-3 text-sm disabled:opacity-50">
          {{ countdown > 0 ? `${countdown}s` : '发送验证码' }}
        </button>
      </div>
      <input v-model="password" type="password" placeholder="密码(至少6位)" class="w-full border rounded px-3 py-2" />
      <p v-if="info" class="text-green-600 text-sm">{{ info }}</p>
      <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
      <button :disabled="loading" class="w-full bg-blue-600 text-white rounded py-2 disabled:opacity-50">
        {{ loading ? '注册中...' : '注册' }}
      </button>
      <p class="text-sm text-center">已有账号?<router-link to="/login" class="text-blue-600">去登录</router-link></p>
    </form>
  </div>
</template>
