'use strict';

const SettingRepository = require('../repositories/setting.repository');

const ALLOWED_KEYS = ['site_name', 'registration_open'];
const DEFAULTS = { site_name: 'MiniApp 框架', registration_open: '1' };

async function loadMap() {
  const rows = await SettingRepository.getAll();
  const map = { ...DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  return map;
}

const SettingService = {
  async getPublic() {
    const map = await loadMap();
    return {
      site_name: map.site_name,
      registration_open: map.registration_open !== '0' && map.registration_open !== 'false',
    };
  },

  async getAllForAdmin() {
    const map = await loadMap();
    return { items: ALLOWED_KEYS.map((key) => ({ key, value: map[key] })) };
  },

  async updateMany(obj) {
    for (const key of ALLOWED_KEYS) {
      if (obj[key] !== undefined && obj[key] !== null) {
        await SettingRepository.upsert(key, String(obj[key]));
      }
    }
    return this.getAllForAdmin();
  },

  async isRegistrationOpen() {
    const row = await SettingRepository.get('registration_open');
    if (!row) return true;
    return row.value !== '0' && row.value !== 'false';
  },
};

module.exports = SettingService;
