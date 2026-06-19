<script setup>
import { ref, onMounted } from 'vue';
import { listOrders } from '../../api/admin';

const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const status = ref('');
const error = ref('');

async function load() {
  error.value = '';
  try {
    const res = await listOrders({ page: page.value, pageSize, status: status.value || undefined });
    items.value = res.items;
    total.value = res.total;
  } catch (e) {
    error.value = e.message;
  }
}

function onFilter() { page.value = 1; load(); }
function prevPage() { if (page.value > 1) { page.value -= 1; load(); } }
function nextPage() { if (page.value * pageSize < total.value) { page.value += 1; load(); } }

onMounted(load);
</script>

<template>
  <div class="bg-white rounded-lg shadow p-6 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-bold">订单管理</h1>
      <select v-model="status" @change="onFilter" class="border rounded px-3 py-1 text-sm">
        <option value="">全部状态</option>
        <option value="pending">pending</option>
        <option value="paid">paid</option>
        <option value="cancelled">cancelled</option>
      </select>
    </div>
    <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="text-left text-gray-500 border-b">
          <th class="py-2">ID</th><th>订单号</th><th>用户ID</th><th>标题</th><th>金额</th><th>状态</th><th>时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="o in items" :key="o.id" class="border-b">
          <td class="py-2">{{ o.id }}</td>
          <td class="text-xs">{{ o.order_no }}</td>
          <td>{{ o.user_id }}</td>
          <td>{{ o.subject }}</td>
          <td>¥{{ o.amount }}</td>
          <td>
            <span :class="{ 'text-yellow-600': o.status==='pending', 'text-green-600': o.status==='paid', 'text-gray-400': o.status==='cancelled' }">{{ o.status }}</span>
          </td>
          <td class="text-gray-400">{{ o.created_at }}</td>
        </tr>
        <tr v-if="!items.length"><td colspan="7" class="py-4 text-center text-gray-400">暂无订单</td></tr>
      </tbody>
    </table>
    <div class="flex items-center justify-between text-sm">
      <span class="text-gray-500">共 {{ total }} 单 · 第 {{ page }} 页</span>
      <div class="space-x-2">
        <button @click="prevPage" :disabled="page <= 1" class="border rounded px-3 py-1 disabled:opacity-40">上一页</button>
        <button @click="nextPage" :disabled="page * pageSize >= total" class="border rounded px-3 py-1 disabled:opacity-40">下一页</button>
      </div>
    </div>
  </div>
</template>
