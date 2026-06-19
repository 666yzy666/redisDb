import client from './client';

export const getProfile = () => client.get('/users/profile');
export const updateProfile = (data) => client.put('/users/profile', data);
