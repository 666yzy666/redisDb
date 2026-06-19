import client from './client';

export const createOrder = (data) => client.post('/payment/orders', data);
export const listMyOrders = () => client.get('/payment/orders');
export const payOrder = (id) => client.post(`/payment/orders/${id}/pay`);
export const cancelOrder = (id) => client.post(`/payment/orders/${id}/cancel`);
export const mockComplete = (orderNo) => client.post('/payment/mock/complete', { orderNo });
