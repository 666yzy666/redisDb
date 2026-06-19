import client from './client';

export const listAnnouncements = () => client.get('/announcements');
export const adminListAnnouncements = (params) => client.get('/admin/announcements', { params });
export const createAnnouncement = (data) => client.post('/admin/announcements', data);
export const updateAnnouncement = (id, data) => client.put(`/admin/announcements/${id}`, data);
export const setAnnouncementPublished = (id, published) =>
  client.patch(`/admin/announcements/${id}/publish`, { published });
export const deleteAnnouncement = (id) => client.delete(`/admin/announcements/${id}`);
