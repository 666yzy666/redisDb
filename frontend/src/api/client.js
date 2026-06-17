import axios from 'axios';

const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '/api' });

// 请求拦截:自动带上 token
client.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// 响应拦截:统一解包 {code,message,data};后端业务错误转成 reject
client.interceptors.response.use(
  (resp) => {
    const body = resp.data;
    if (body && body.code !== 0) {
      return Promise.reject(new Error(body.message || '请求失败'));
    }
    return body.data;
  },
  (err) => {
    const msg = err.response?.data?.message || err.message || '网络错误';
    return Promise.reject(new Error(msg));
  }
);

export default client;
