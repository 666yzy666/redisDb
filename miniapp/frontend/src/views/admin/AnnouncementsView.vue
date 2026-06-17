<script setup>
import { ref, onMounted } from 'vue';
import {
  adminListAnnouncements, createAnnouncement, updateAnnouncement,
  setAnnouncementPublished, deleteAnnouncement,
} from '../../api/announcement';

const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const error = ref('');

const editingId = ref(null);
const title = ref('');
const content = ref('');

async function load() {
  error.value = '';
  try {
    const res = await adminListAnnouncements({ page: page.value, pageSize });
    items.value = res.items;
    total.value = res.total;
  } catch (e) { error.value = e.message; }
}

function startNew() { editingId.value = null; title.value = ''; content.value = ''; }
function startEdit(a) { editingId.value = a.id; title.value = a.title; content.value = a.content; }

async function onSave() {
  error.value = '';
  try {
    if (editingId.value) await updateAnnouncement(editingId.value, { title: title.value, content: content.value });
    else await createAnnouncement({ title: title.value, content: content.value });
    startNew();
    await load();
  } catch (e) { error.value = e.message; }
}

async function onTogglePublish(a) {
  error.value = '';
  try { await setAnnouncementPublished(a.id, !a.published); await load(); }
  catch (e) { error.value = e.message; }
}

async function onDelete(a) {
  error.value = '';
  try { await deleteAnnouncement(a.id); await load(); }
  catch (e) { error.value = e.message; }
}

function prevPage() { if (page.value > 1) { page.value -= 1; load(); } }
function nextPage() { if (page.value * pageSize < total.value) { page.value += 1; load(); } }

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="bg-white rounded-lg shadow p-6 space-y-3">
      <h1 class="text-lg font-bold">{{ editingId ? '编辑公告' : '新建公告' }}</h1>
      <input v-model="title" placeholder="标题" class="w-full border rounded px-3 py-2" />
      <textarea v-model="content" placeholder="内容" rows="3" class="w-full border rounded px-3 py-2"></textarea>
      <div class="space-x-2">
        <button @click="onSave" class="bg-blue-600 text-white rounded px-4 py-2">{{ editingId ? '保存' : '创建' }}</button>
        <button v-if="editingId" @click="startNew" class="border rounded px-4 py-2">取消编辑</button>
      </div>
      <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
    </div>

    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-lg font-bold mb-3">公告列表</h2>
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="text-left text-gray-500 border-b"><th class="py-2">ID</th><th>标题</th><th>状态</th><th>时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="a in items" :key="a.id" class="border-b">
            <td class="py-2">{{ a.id }}</td>
            <td>{{ a.title }}</td>
            <td><span :class="a.published ? 'text-green-600' : 'text-gray-400'">{{ a.published ? '已发布' : '草稿' }}</span></td>
            <td class="text-gray-400">{{ a.created_at }}</td>
            <td class="space-x-2">
              <button @click="startEdit(a)" class="text-blue-600 hover:underline">编辑</button>
              <button @click="onTogglePublish(a)" class="text-yellow-600 hover:underline">{{ a.published ? '下架' : '发布' }}</button>
              <button @click="onDelete(a)" class="text-red-500 hover:underline">删除</button>
            </td>
          </tr>
          <tr v-if="!items.length"><td colspan="5" class="py-4 text-center text-gray-400">暂无公告</td></tr>
        </tbody>
      </table>
      <div class="flex items-center justify-between text-sm mt-3">
        <span class="text-gray-500">共 {{ total }} 条 · 第 {{ page }} 页</span>
        <div class="space-x-2">
          <button @click="prevPage" :disabled="page <= 1" class="border rounded px-3 py-1 disabled:opacity-40">上一页</button>
          <button @click="nextPage" :disabled="page * pageSize >= total" class="border rounded px-3 py-1 disabled:opacity-40">下一页</button>
        </div>
      </div>
    </div>
  </div>
</template>
