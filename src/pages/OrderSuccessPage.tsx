import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { get } from 'firebase/database';
import { refs, updateOrderStatus } from '../lib/firebase';
import type { Order } from '../types';

export default function OrderSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const orderId = searchParams.get('order_id');

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) { setError('No order found.'); return; }
    get(refs.order(orderId)).then((snap) => {
      if (!snap.exists()) { setError('Order not found.'); return; }
      const o = { id: orderId, ...snap.val() } as Order;
      setOrder(o);
      if (o.status === 'new' && sessionId) {
        updateOrderStatus(orderId, 'new');
      }
    });
  }, [orderId, sessionId]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <p className="text-gray-500">{error}</p>
    </div>
  );

  if (!order) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
      <CheckCircle size={72} className="text-green-500 mb-4" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment confirmed!</h2>
      <p className="text-gray-500 mb-1">Your order number is</p>
      <div className="text-6xl font-black text-orange-500 mb-6">
        #{String(order.orderNumber).padStart(3, '0')}
      </div>
      <p className="text-gray-500 text-sm mb-8">We'll bring it to your table once it's ready.</p>
      <button
        onClick={() => navigate(`/order?r=${order.restaurantId}&t=${order.tableNumber ?? ''}`)}
        className="bg-orange-500 text-white font-semibold px-8 py-3 rounded-2xl"
      >
        Order more
      </button>
    </div>
  );
}
