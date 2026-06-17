<script setup>
import { ref, onMounted } from 'vue';
import { listAnnouncements } from '../../api/announcement';

const items = ref([]);
const error = ref('');

onMounted(async () => {
  try { items.value = await listAnnouncements(); }
  catch (e) { error.value = e.message; }
});
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-4">
    <h1 class="text-lg font-bold">公告</h1>
    <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
    <div v-for="a in items" :key="a.id" class="bg-white rounded-lg shadow p-4">
      <div class="font-bold">{{ a.title }}</div>
      <div class="text-gray-600 text-sm mt-1 whitespace-pre-wrap">{{ a.content }}</div>
      <div class="text-gray-400 text-xs mt-2">{{ a.created_at }}</div>
    </div>
    <p v-if="!items.length && !error" class="text-gray-400 text-sm">暂无公告</p>
  </div>
</template>
