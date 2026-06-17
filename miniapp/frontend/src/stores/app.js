import { defineStore } from 'pinia';
import { getPublicSettings } from '../api/settings';

export const useAppStore = defineStore('app', {
  state: () => ({ siteName: 'MiniApp 框架' }),
  actions: {
    async loadPublic() {
      try {
        const s = await getPublicSettings();
        if (s && s.site_name) this.siteName = s.site_name;
      } catch (e) {
        // 公开设置拉取失败时保留默认站名
      }
    },
  },
});
