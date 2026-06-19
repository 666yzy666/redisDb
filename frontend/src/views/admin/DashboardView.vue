<script setup>
import { ref, onMounted } from 'vue';
import { getStats } from '../../api/admin';

const stats = ref(null);
const error = ref('');
const cards = [
  { key: 'users', label: '用户数' },
  { key: 'orders', label: '订单总数' },
  { key: 'paidOrders', label: '已付订单' },
  { key: 'paidAmount', label: '已付金额(¥)' },
  { key: 'announcements', label: '公告数' },
];

onMounted(async () => {
  try {
    stats.value = await getStats();
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-lg font-bold">仪表盘</h1>
    <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
    <div v-if="stats" class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div v-for="c in cards" :key="c.key" class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-2xl font-bold text-blue-600">{{ stats[c.key] }}</div>
        <div class="text-gray-500 text-sm mt-1">{{ c.label }}</div>
      </div>
    </div>
    <p v-else-if="!error" class="text-gray-400 text-sm">加载中...</p>
  </div>
</template>
