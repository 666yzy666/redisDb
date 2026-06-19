<script setup>
import { ref, onMounted } from 'vue';
import { createOrder, listMyOrders, payOrder, cancelOrder, mockComplete } from '../../api/payment';

const orders = ref([]);
const amount = ref('');
const subject = ref('');
const error = ref('');
const info = ref('');

async function load() {
  error.value = '';
  try {
    orders.value = await listMyOrders();
  } catch (e) {
    error.value = e.message;
  }
}

async function onCreate() {
  error.value = '';
  info.value = '';
  try {
    await createOrder({ amount: Number(amount.value), subject: subject.value });
    amount.value = '';
    subject.value = '';
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

// 发起支付 → mock 渠道:直接模拟完成支付(真实渠道会跳转 payUrl)
async function onPay(o) {
  error.value = '';
  info.value = '';
  try {
    await payOrder(o.id);
    await mockComplete(o.order_no);
    info.value = `订单 ${o.order_no} 支付成功`;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function onCancel(o) {
  error.value = '';
  try {
    await cancelOrder(o.id);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="bg-white rounded-lg shadow p-6 space-y-3">
      <h1 class="text-lg font-bold">下单</h1>
      <div class="flex gap-2">
        <input v-model="amount" type="number" step="0.01" placeholder="金额" class="border rounded px-3 py-2 w-32" />
        <input v-model="subject" placeholder="订单标题" class="border rounded px-3 py-2 flex-1" />
        <button @click="onCreate" class="bg-blue-600 text-white rounded px-4 py-2">创建</button>
      </div>
      <p v-if="info" class="text-green-600 text-sm">{{ info }}</p>
      <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
    </div>

    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-lg font-bold mb-3">我的订单</h2>
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="text-left text-gray-500 border-b">
            <th class="py-2">订单号</th><th>标题</th><th>金额</th><th>状态</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in orders" :key="o.id" class="border-b">
            <td class="py-2 text-xs">{{ o.order_no }}</td>
            <td>{{ o.subject }}</td>
            <td>¥{{ o.amount }}</td>
            <td>
              <span :class="{ 'text-yellow-600': o.status==='pending', 'text-green-600': o.status==='paid', 'text-gray-400': o.status==='cancelled' }">{{ o.status }}</span>
            </td>
            <td class="space-x-2">
              <template v-if="o.status === 'pending'">
                <button @click="onPay(o)" class="text-blue-600 hover:underline">去支付</button>
                <button @click="onCancel(o)" class="text-red-500 hover:underline">取消</button>
              </template>
              <span v-else class="text-gray-400 text-xs">—</span>
            </td>
          </tr>
          <tr v-if="!orders.length"><td colspan="5" class="py-4 text-center text-gray-400">暂无订单</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
