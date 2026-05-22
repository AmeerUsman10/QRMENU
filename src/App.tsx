import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Lazy-load every page-level route. This produces one chunk per page instead
// of one ~720 KB chunk that ships every component to every visitor. A
// customer scanning a QR sticker and landing on /order no longer downloads
// AdminPage (LoginPage + MenuManager + QRGenerator + SettingsPanel) or
// KitchenPage (PIN entry + order cards + framer-motion animation state) just
// to see the menu.
const OrderPage = lazy(() => import('./pages/OrderPage'));
const OrderSuccessPage = lazy(() => import('./pages/OrderSuccessPage'));
const KitchenPage = lazy(() => import('./pages/KitchenPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

/**
 * Spinner shown while a route's chunk is downloading. Kept inline so the
 * fallback itself ships in the tiny root chunk — no flash of nothing.
 */
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div
        role="status"
        aria-label="Loading page"
        className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/order" element={<OrderPage />} />
          <Route path="/order/success" element={<OrderSuccessPage />} />
          <Route path="/kitchen" element={<KitchenPage />} />
          <Route path="/admin/*" element={<AdminPage />} />
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
