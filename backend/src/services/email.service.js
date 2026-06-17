'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger');

// 未配置 SMTP 时,把邮件内容打印到控制台(本地 demo 直接可用)
let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

async function sendMail(to, subject, text) {
  if (!transporter) {
    logger.warn(`未配置 SMTP,模拟发信 -> 收件人:${to} 主题:${subject} 内容:${text}`);
    return;
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, text });
  logger.info(`邮件已发送 -> ${to}`);
}

module.exports = { sendMail };
