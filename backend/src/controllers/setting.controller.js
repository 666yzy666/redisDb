'use strict';

const SettingService = require('../services/setting.service');
const { success } = require('../utils/response');

const SettingController = {
  async getPublic(req, res) {
    const data = await SettingService.getPublic();
    return success(res, data);
  },
};

module.exports = SettingController;
