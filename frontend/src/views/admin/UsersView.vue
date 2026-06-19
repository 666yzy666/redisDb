<script setup>
import { ref, onMounted } from 'vue';
import { listUsers, setUserRole, setUserStatus } from '../../api/admin';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const searchEmail = ref('');
const error = ref('');
const loading = ref(false);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await listUsers({ page: page.value, pageSize, email: searchEmail.value || undefined });
    items.value = res.items;
    total.value = res.total;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  page.value = 1;
  load();
}

function prevPage() {
  if (page.value > 1) { page.value -= 1; load(); }
}
function nextPage() {
  if (page.value * pageSize < total.value) { page.value += 1; load(); }
}

const isSelf = (u) => u.id === auth.user?.id;

async function toggleRole(u) {
  error.value = '';
  try {
    await setUserRole(u.id, u.role === 'admin' ? 'user' : 'admin');
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function toggleStatus(u) {
  error.value = '';
  try {
    await setUserStatus(u.id, u.status === 'active' ? 'disabled' : 'active');
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <div class="bg-white rounded-lg shadow p-6 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-bold">用户管理</h1>
      <div class="flex gap-2">
        <input v-model="searchEmail" placeholder="按邮箱搜索" class="border rounded px-3 py-1 text-sm" @keyup.enter="onSearch" />
        <button @click="onSearch" class="bg-blue-600 text-white rounded px-3 py-1 text-sm">搜索</button>
      </div>
    </div>

    <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>

    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="text-left text-gray-500 border-b">
          <th class="py-2">ID</th><th>邮箱</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in items" :key="u.id" class="border-b">
          <td class="py-2">{{ u.id }}</td>
          <td>{{ u.email || '(无)' }}</td>
          <td>
            <span :class="u.role === 'admin' ? 'text-purple-600' : 'text-gray-700'">{{ u.role }}</span>
          </td>
          <td>
            <span :class="u.status === 'active' ? 'text-green-600' : 'text-red-500'">{{ u.status }}</span>
          </td>
          <td class="text-gray-400">{{ u.created_at }}</td>
          <td class="space-x-2">
            <template v-if="isSelf(u)">
              <span class="text-gray-400 text-xs">本人不可操作</span>
            </template>
            <template v-else>
              <button @click="toggleRole(u)" class="text-blue-600 hover:underline">
                {{ u.role === 'admin' ? '降为user' : '提为admin' }}
              </button>
              <button @click="toggleStatus(u)" :class="u.status === 'active' ? 'text-red-500' : 'text-green-600'" class="hover:underline">
                {{ u.status === 'active' ? '禁用' : '启用' }}
              </button>
            </template>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="flex items-center justify-between text-sm">
      <span class="text-gray-500">共 {{ total }} 人 · 第 {{ page }} 页</span>
      <div class="space-x-2">
        <button @click="prevPage" :disabled="page <= 1" class="border rounded px-3 py-1 disabled:opacity-40">上一页</button>
        <button @click="nextPage" :disabled="page * pageSize >= total" class="border rounded px-3 py-1 disabled:opacity-40">下一页</button>
      </div>
    </div>
  </div>
</template>
