'use strict';

const { getPool } = require('../loaders/mysql');

// 商品数据访问层（DAO）：只负责 SQL
const ProductRepository = {
  async list() {
    const [rows] = await getPool().execute(
      'SELECT id, name, price, stock FROM products ORDER BY id'
    );
    return rows;
  },

  async findByIds(ids) {
    if (!ids.length) return [];
    // IN (...) 动态占位：用 mysql2 的 ? 数组展开，避免手拼字符串
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await getPool().query(
      `SELECT id, name, price, stock FROM products WHERE id IN (${placeholders})`,
      ids
    );
    return rows;
  },

  // 扣库存：WHERE stock >= :qty 是关键守卫——库存不足时 affectedRows=0，
  // 据此判断扣减失败（顺带防超卖）。必须传入事务连接 conn，与下单在同一事务里。
  async decreaseStock(conn, productId, qty) {
    const [result] = await conn.execute(
      'UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty',
      { id: productId, qty }
    );
    return result.affectedRows; // 1 = 扣减成功，0 = 库存不足
  },

  // 回滚库存（取消订单时用），同样要在事务连接上执行
  async increaseStock(conn, productId, qty) {
    await conn.execute(
      'UPDATE products SET stock = stock + :qty WHERE id = :id',
      { id: productId, qty }
    );
  },
};

module.exports = ProductRepository;
