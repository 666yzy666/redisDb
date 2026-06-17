import client from './client';

export const listUsers = (params) => client.get('/admin/users', { params });
export const setUserRole = (id, role) => client.patch(`/admin/users/${id}/role`, { role });
export const setUserStatus = (id, status) => client.patch(`/admin/users/${id}/status`, { status });
export const listOrders = (params) => client.get('/admin/orders', { params });
