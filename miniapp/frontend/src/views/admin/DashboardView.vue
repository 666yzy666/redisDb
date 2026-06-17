<script setup>
import { ref, onMounted } from 'vue';
import client from '../../api/client';

const status = ref('检测中...');
onMounted(async () => {
  try {
    const res = await client.get('/admin/ping');
    status.value = res.admin ? '后端已确认:你是管理员 ✅' : '未知';
  } catch (e) {
    status.value = '后端鉴权失败:' + e.message;
  }
});
</script>

<template>
  <div class="bg-white rounded-lg shadow p-6 space-y-3">
    <h1 class="text-lg font-bold">管理后台 · 仪表盘</h1>
    <p class="text-gray-600 text-sm">这是后台占位页,用于验证「侧边栏布局 + 管理员守卫」已生效。</p>
    <p class="text-sm">{{ status }}</p>
    <p class="text-gray-400 text-xs">用户管理、订单等功能将在 SP2 起加入左侧菜单。</p>
  </div>
</template>
