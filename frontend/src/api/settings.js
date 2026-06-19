import client from './client';

export const getPublicSettings = () => client.get('/settings/public');
export const getAdminSettings = () => client.get('/admin/settings');
export const updateSettings = (data) => client.put('/admin/settings', data);
