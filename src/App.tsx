import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import OrderPage from './pages/OrderPage';
import KitchenPage from './pages/KitchenPage';
import AdminPage from './pages/AdminPage';
import OrderSuccessPage from './pages/OrderSuccessPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/order" element={<OrderPage />} />
        <Route path="/order/success" element={<OrderSuccessPage />} />
        <Route path="/kitchen" element={<KitchenPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
