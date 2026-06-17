import client from './client';

export const sendCode = (email) => client.post('/auth/send-code', { email });
export const register = (email, password, code) =>
  client.post('/auth/register', { email, password, code });
export const login = (email, password) => client.post('/auth/login', { email, password });
