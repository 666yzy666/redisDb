'use strict';

const ApiError = require('../utils/ApiError');
const cache = require('../utils/cache');
const { withTransaction } = require('../loaders/mysql');
const OrderRepository = require('../repositories/order.repository');
const ProductRepository = require('../repositories/product.repository');

const ORDER_CACHE_TTL = 120; // 订单详情缓存 2 分钟

// ─── 订单状态机 ──────────────────────────────────────────────────────────────
//
//   pending ──pay──→ paid ──ship──→ shipped ──complete──→ completed
//      │                │
//      └────────────────┴──cancel──→ cancelled
//
// 合法流转集中定义在一处：动作 → { 允许的旧状态, 目标状态 }。
// 任何不在表里的流转一律拒绝（400），状态机的规则一目了然、易于扩展。
// ────────────────────────────────────────────────────────────────────────────
const STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const TRANSITIONS = {
  pay: { from: [STATUS.PENDING], to: STATUS.PAID },
  ship: { from: [STATUS.PAID], to: STATUS.SHIPPED },
  complete: { from: [STATUS.SHIPPED], to: STATUS.COMPLETED },
  cancel: { from: [STATUS.PENDING, STATUS.PAID], to: STATUS.CANCELLED },
};

const orderKey = (id) => `order:detail:${id}`;

// 校验「当前状态 + 动作」是否合法，返回目标状态，否则抛 400
function resolveTarget(currentStatus, action) {
  const rule = TRANSITIONS[action];
  if (!rule) {
    throw ApiError.badRequest(`未知操作: ${action}`);
  }
  if (!rule.from.includes(currentStatus)) {
    throw ApiError.badRequest(
      `订单当前状态为「${currentStatus}」，不能执行「${action}」`,
      40901
    );
  }
  return rule.to;
}

const OrderService = {
  // 商品列表（公开）
  async listProducts() {
    return ProductRepository.list();
  },

  // 下单：校验商品 → 事务内 [扣库存 + 建订单 + 写明细] → 返回订单详情。
  // 整个写入在一个事务里，任一步失败全部回滚，不会出现「扣了库存却没订单」。
  async createOrder(userId, items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest('items 不能为空');
    }
    // 归一化 + 基本校验
    const normalized = items.map((it) => {
      const productId = Number(it.productId);
      const quantity = Number(it.quantity);
      if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
        throw ApiError.badRequest('每个 item 需含合法的 productId 与正整数 quantity');
      }
      return { productId, quantity };
    });

    // 查出涉及的商品，做存在性校验，并对价格/名称做快照
    const products = await ProductRepository.findByIds(normalized.map((i) => i.productId));
    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalAmount = 0;
    const orderItems = normalized.map((it) => {
      const p = productMap.get(it.productId);
      if (!p) {
        throw ApiError.badRequest(`商品不存在: ${it.productId}`);
      }
      const price = Number(p.price);
      totalAmount += price * it.quantity;
      return {
        productId: p.id,
        productName: p.name,
        price,
        quantity: it.quantity,
      };
    });
    totalAmount = Number(totalAmount.toFixed(2));

    const orderId = await withTransaction(async (conn) => {
      // 逐项扣库存：affectedRows=0 说明库存不足，抛错触发整笔回滚
      for (const it of orderItems) {
        const ok = await ProductRepository.decreaseStock(conn, it.productId, it.quantity);
        if (!ok) {
          throw ApiError.badRequest(`库存不足: ${it.productName}`, 40902);
        }
      }
      const id = await OrderRepository.createOrder(conn, { userId, totalAmount });
      await OrderRepository.addItems(conn, id, orderItems);
      return id;
    });

    return this.getOrder(userId, orderId);
  },

  // 我的订单列表
  async listOrders(userId) {
    return OrderRepository.listByUser(userId);
  },

  // 订单详情：Cache-Aside 读（order:detail:{id}），并校验归属
  async getOrder(userId, orderId) {
    const detail = await cache.cacheAside(orderKey(orderId), ORDER_CACHE_TTL, async () => {
      const order = await OrderRepository.findById(orderId);
      if (!order) return null;
      const items = await OrderRepository.findItems(orderId);
      return { ...order, items };
    });

    // 不存在、或不属于当前用户，统一按「不存在」处理，避免越权探测
    if (!detail || String(detail.user_id) !== String(userId)) {
      throw ApiError.notFound('订单不存在');
    }
    return detail;
  },

  // 普通状态流转：pay / ship / complete。
  // 守卫式 UPDATE 保证并发安全；流转成功后失效缓存。
  async transition(userId, orderId, action) {
    const order = await this.getOrder(userId, orderId); // 含归属校验
    const target = resolveTarget(order.status, action);

    const affected = await OrderRepository.updateStatus(orderId, order.status, target);
    if (!affected) {
      // 读到现在这一刻状态被并发改过，守卫未命中
      throw ApiError.badRequest('订单状态已变化，请刷新后重试', 40903);
    }

    await cache.del(orderKey(orderId));
    return this.getOrder(userId, orderId);
  },

  // 取消订单：状态流转 + 回滚库存，放在同一事务里。
  async cancelOrder(userId, orderId) {
    const order = await this.getOrder(userId, orderId); // 含归属校验
    const target = resolveTarget(order.status, 'cancel');
    const items = await OrderRepository.findItems(orderId);

    await withTransaction(async (conn) => {
      const affected = await OrderRepository.updateStatus(
        orderId,
        order.status,
        target,
        conn
      );
      if (!affected) {
        throw ApiError.badRequest('订单状态已变化，请刷新后重试', 40903);
      }
      // 把库存加回去
      for (const it of items) {
        await ProductRepository.increaseStock(conn, it.product_id, it.quantity);
      }
    });

    await cache.del(orderKey(orderId));
    return this.getOrder(userId, orderId);
  },
};

module.exports = OrderService;
