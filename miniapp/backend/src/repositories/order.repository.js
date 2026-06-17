'use strict';

const { getPool } = require('../loaders/mysql');

// 订单数据访问层（DAO）：只负责 SQL。
// 凡是参与事务的方法都接收一个 conn（事务连接），与调用方在同一事务里执行。
const OrderRepository = {
  // 创建订单主记录（在事务内）
  async createOrder(conn, { userId, totalAmount }) {
    const [result] = await conn.execute(
      'INSERT INTO orders (user_id, total_amount) VALUES (:userId, :totalAmount)',
      { userId, totalAmount }
    );
    return result.insertId;
  },

  // 批量插入订单明细（在事务内）
  async addItems(conn, orderId, items) {
    // 多值 INSERT：VALUES (...),(...) 一次写入，比逐条插入少往返
    const values = [];
    const placeholders = items
      .map((it) => {
        values.push(orderId, it.productId, it.productName, it.price, it.quantity);
        return '(?, ?, ?, ?, ?)';
      })
      .join(',');
    await conn.query(
      'INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES ' +
        placeholders,
      values
    );
  },

  async findById(id) {
    const [rows] = await getPool().execute(
      'SELECT id, user_id, status, total_amount, created_at, updated_at FROM orders WHERE id = :id LIMIT 1',
      { id }
    );
    return rows[0] || null;
  },

  async findItems(orderId) {
    const [rows] = await getPool().execute(
      'SELECT product_id, product_name, price, quantity FROM order_items WHERE order_id = :orderId',
      { orderId }
    );
    return rows;
  },

  async listByUser(userId) {
    const [rows] = await getPool().execute(
      'SELECT id, status, total_amount, created_at FROM orders WHERE user_id = :userId ORDER BY id DESC',
      { userId }
    );
    return rows;
  },

  // 守卫式状态流转：WHERE status = :from 保证只有处于「旧状态」时才更新成功。
  // 返回 affectedRows：1 = 流转成功，0 = 当前状态不匹配（已被并发改过/非法流转）。
  // 这一行就是订单状态机在 DB 层的并发保护，避免重复支付、越级流转。
  // conn 可选：取消订单时传入事务连接，与回滚库存同事务；普通流转用连接池即可。
  async updateStatus(id, fromStatus, toStatus, conn) {
    const executor = conn || getPool();
    const [result] = await executor.execute(
      'UPDATE orders SET status = :to WHERE id = :id AND status = :from',
      { id, from: fromStatus, to: toStatus }
    );
    return result.affectedRows;
  },
};

module.exports = OrderRepository;
