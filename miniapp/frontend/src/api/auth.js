import client from './client';

export const sendCode = (email) => client.post('/auth/send-code', { email });
export const register = (email, password, code) =>
  client.post('/auth/register', { email, password, code });
export const login = (email, password) => client.post('/auth/login', { email, password });
export const forgotPassword = (email) => client.post('/auth/forgot-password', { email });
export const resetPassword = (email, code, password) =>
  client.post('/auth/reset-password', { email, code, password });
