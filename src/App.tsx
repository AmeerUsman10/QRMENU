import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConnectionBanner } from './components/ConnectionBanner';

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
    <ErrorBoundary>
      <BrowserRouter>
        <ConnectionBanner />
        <Routes>
          <Route path="/order" element={
            <Suspense fallback={<RouteFallback />}><OrderPage /></Suspense>
          } />
          <Route path="/order/success" element={
            <Suspense fallback={<RouteFallback />}><OrderSuccessPage /></Suspense>
          } />
          {/* Kitchen gets a plain white fallback — no orange spinner — so the
              PWA opens to a clean blank screen that fades into the PIN page */}
          <Route path="/kitchen" element={
            <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
              <KitchenPage />
            </Suspense>
          } />
          <Route path="/admin/*" element={
            <Suspense fallback={<RouteFallback />}><AdminPage /></Suspense>
          } />
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
