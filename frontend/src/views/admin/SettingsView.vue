<script setup>
import { ref, onMounted } from 'vue';
import { getAdminSettings, updateSettings } from '../../api/settings';
import { useAppStore } from '../../stores/app';

const app = useAppStore();
const siteName = ref('');
const registrationOpen = ref(true);
const msg = ref('');
const error = ref('');

onMounted(async () => {
  try {
    const res = await getAdminSettings();
    const map = {};
    for (const it of res.items) map[it.key] = it.value;
    siteName.value = map.site_name || '';
    registrationOpen.value = map.registration_open !== '0' && map.registration_open !== 'false';
  } catch (e) { error.value = e.message; }
});

async function onSave() {
  msg.value = ''; error.value = '';
  try {
    await updateSettings({ site_name: siteName.value, registration_open: registrationOpen.value ? '1' : '0' });
    msg.value = '已保存';
    await app.loadPublic();
  } catch (e) { error.value = e.message; }
}
</script>

<template>
  <div class="max-w-md bg-white rounded-lg shadow p-6 space-y-4">
    <h1 class="text-lg font-bold">系统设置</h1>
    <div>
      <label class="text-gray-500 block mb-1 text-sm">站点名称</label>
      <input v-model="siteName" class="w-full border rounded px-3 py-2" />
    </div>
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" v-model="registrationOpen" /> 开放注册
    </label>
    <p v-if="msg" class="text-green-600 text-sm">{{ msg }}</p>
    <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
    <button @click="onSave" class="bg-blue-600 text-white rounded px-4 py-2">保存</button>
  </div>
</template>
