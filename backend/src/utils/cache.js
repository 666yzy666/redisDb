'use strict';

const { getRedis } = require('../loaders/redis');

// ─────────────────────────────────────────────────────────────────────────────
// Cache-Aside（旁路缓存）工具
//
// 这是本 demo 里 Redis 用法的核心。它把「读时缓存」的三件事收口在一处，
// 让 service 层只需关心业务，不必每次手写 get/parse/回填的样板代码：
//   · 防穿透：把「查不到」也缓存一小段时间，挡住对不存在数据的反复打库
//   · 防雪崩：给 TTL 加随机抖动，避免大批 key 在同一时刻集体过期
//   · 写后刷新：更新数据库后直接写回最新值，比「删缓存」少一次 miss
// ─────────────────────────────────────────────────────────────────────────────

// 给 TTL 加 ±10% 的随机抖动 —— 防「缓存雪崩」。
// 若所有资料都用固定 300s，高峰期写入的 key 会在 300s 后几乎同时失效，
// 瞬间把流量全部压到 MySQL。抖动让过期时间分散开。
function withJitter(ttlSeconds) {
  const delta = ttlSeconds * 0.1;
  return Math.round(ttlSeconds + (Math.random() * 2 - 1) * delta);
}

// 空值占位符 —— 防「缓存穿透」。
// 当某个 id 在库里根本不存在时，若不缓存这个「不存在」的事实，
// 每次请求都会穿过缓存直达 MySQL。这里用一个特殊标记缓存「确认不存在」，
// 并给它一个较短的 TTL（数据随时可能被创建，不宜缓存太久）。
const NULL_PLACEHOLDER = '__null__';
const NULL_TTL = 30;

/**
 * Cache-Aside 读模式：
 *   1) 先查 Redis；命中真实数据 / 命中「确认不存在」都直接返回
 *   2) 未命中则调用 loader 回源（通常是查 MySQL）
 *   3) 把结果写回 Redis（带 TTL 抖动）；loader 返回空则写空值占位
 *
 * @param {string}   key          缓存键
 * @param {number}   ttlSeconds   真实数据的缓存时长（秒）
 * @param {Function} loader       回源函数，返回数据或 null
 * @returns {Promise<any|null>}
 */
async function cacheAside(key, ttlSeconds, loader) {
  const redis = getRedis();

  const cached = await redis.get(key);
  if (cached === NULL_PLACEHOLDER) return null; // 命中「确认不存在」
  if (cached !== null) return JSON.parse(cached); // 命中真实数据

  const data = await loader(); // 未命中 → 回源查库
  if (data == null) {
    await redis.set(key, NULL_PLACEHOLDER, 'EX', NULL_TTL);
    return null;
  }
  await redis.set(key, JSON.stringify(data), 'EX', withJitter(ttlSeconds));
  return data;
}

/**
 * 写后刷新：更新数据库后，直接把最新值写回缓存。
 * 相比「写库后删缓存」：少一次后续读取的 miss，也避免了删除时机带来的
 * 「旧值回填」竞争（删除瞬间，一个正在回源的旧请求又把过期值写了回去）。
 */
async function setJSON(key, value, ttlSeconds) {
  await getRedis().set(key, JSON.stringify(value), 'EX', withJitter(ttlSeconds));
}

/** 主动失效一个缓存键。 */
async function del(key) {
  await getRedis().del(key);
}

module.exports = { cacheAside, setJSON, del };
