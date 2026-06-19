'use strict';

const { getPool } = require('../loaders/mysql');

// 付款订单数据访问层
const PaymentOrderRepository = {
  async create({ orderNo, userId, amount, subject }) {
    const [result] = await getPool().execute(
      'INSERT INTO payment_orders (order_no, user_id, amount, subject) VALUES (:orderNo, :userId, :amount, :subject)',
      { orderNo, userId, amount, subject }
    );
    return result.insertId;
  },

  async findById(id) {
    const [rows] = await getPool().execute(
      'SELECT id, order_no, user_id, amount, subject, status, channel, paid_at, created_at FROM payment_orders WHERE id = :id LIMIT 1',
      { id }
    );
    return rows[0] || null;
  },

  async findByNo(orderNo) {
    const [rows] = await getPool().execute(
      'SELECT id, order_no, user_id, amount, subject, status, channel, paid_at, created_at FROM payment_orders WHERE order_no = :orderNo LIMIT 1',
      { orderNo }
    );
    return rows[0] || null;
  },

  async listByUser(userId) {
    const [rows] = await getPool().execute(
      'SELECT id, order_no, amount, subject, status, channel, paid_at, created_at FROM payment_orders WHERE user_id = :userId ORDER BY id DESC',
      { userId }
    );
    return rows;
  },

  async listAll({ status, limit, offset }) {
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status, limit, offset] : [limit, offset];
    const [rows] = await getPool().query(
      `SELECT id, order_no, user_id, amount, subject, status, channel, paid_at, created_at FROM payment_orders ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      params
    );
    return rows;
  },

  async countAll({ status }) {
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];
    const [rows] = await getPool().query(
      `SELECT COUNT(*) AS total FROM payment_orders ${where}`,
      params
    );
    return rows[0].total;
  },

  async stats() {
    const [rows] = await getPool().query(
      "SELECT COUNT(*) AS total, SUM(status='paid') AS paid, COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) AS paidAmount FROM payment_orders"
    );
    const r = rows[0] || {};
    return { total: Number(r.total) || 0, paid: Number(r.paid) || 0, paidAmount: Number(r.paidAmount) || 0 };
  },

  // 守卫式:仅 pending 才能转 paid;返回 affectedRows(幂等关键)
  async markPaid(id, channel) {
    const [result] = await getPool().execute(
      "UPDATE payment_orders SET status='paid', channel=:channel, paid_at=NOW() WHERE id=:id AND status='pending'",
      { id, channel }
    );
    return result.affectedRows;
  },

  // 守卫式:仅 pending 才能取消;返回 affectedRows
  async markCancelled(id) {
    const [result] = await getPool().execute(
      "UPDATE payment_orders SET status='cancelled' WHERE id=:id AND status='pending'",
      { id }
    );
    return result.affectedRows;
  },
};

module.exports = PaymentOrderRepository;
