'use strict';

const AuthService = require('../services/auth.service');
const { success } = require('../utils/response');

// 控制器层：解析请求参数、调用 service、返回统一响应；不写业务逻辑
const AuthController = {
  async sendCode(req, res) {
    const { email } = req.body;
    const result = await AuthService.sendRegisterCode(email);
    return success(res, result, '验证码已发送');
  },

  async register(req, res) {
    const { email, password, code } = req.body;
    const result = await AuthService.register(email, password, code);
    return success(res, result, '注册成功');
  },

  async login(req, res) {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    return success(res, result, '登录成功');
  },
};

module.exports = AuthController;
