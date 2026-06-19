<script setup>
import { ref, onMounted } from 'vue';
import { getProfile, updateProfile } from '../../api/user';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const profile = ref(null);
const nickname = ref('');
const msg = ref('');
const error = ref('');

onMounted(async () => {
  try {
    profile.value = await getProfile();
    nickname.value = profile.value.nickname || '';
  } catch (e) {
    error.value = e.message;
  }
});

async function onSave() {
  msg.value = '';
  error.value = '';
  try {
    const updated = await updateProfile({ nickname: nickname.value });
    profile.value = updated;
    msg.value = '保存成功';
  } catch (e) {
    error.value = e.message;
  }
}
</script>

<template>
  <div class="max-w-md mx-auto bg-white rounded-lg shadow p-6 space-y-4">
    <h1 class="text-lg font-bold">个人资料</h1>
    <div v-if="profile" class="space-y-3 text-sm">
      <div><span class="text-gray-500">邮箱:</span> {{ profile.email }}</div>
      <div><span class="text-gray-500">角色:</span> {{ profile.role }}</div>
      <div>
        <label class="text-gray-500 block mb-1">昵称</label>
        <input v-model="nickname" class="w-full border rounded px-3 py-2" placeholder="设置昵称" />
      </div>
      <p v-if="msg" class="text-green-600">{{ msg }}</p>
      <p v-if="error" class="text-red-500">{{ error }}</p>
      <button @click="onSave" class="bg-blue-600 text-white rounded px-4 py-2">保存</button>
    </div>
    <p v-else-if="error" class="text-red-500 text-sm">{{ error }}</p>
    <p v-else class="text-gray-400 text-sm">加载中...</p>
  </div>
</template>
