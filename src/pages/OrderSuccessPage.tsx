import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ChefHat, Clock, BellRing, XCircle, Sparkles } from 'lucide-react';
import { refs, updateOrderStatus, submitOrderReview, onValue } from '../lib/firebase';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { OrderSuccessSkeleton } from '../components/Skeleton';
import type { Order, CartItem } from '../types';

// ─── Translations ─────────────────────────────────────────────────────────────

type Lang = 'sl' | 'en';

const T = {
  sl: {
    // Page / document
    titleNotFound: 'Naročilo ni najdeno',
    titleStatus: 'Status naročila',
    // Error screen
    errorLabel: 'Napaka',
    noOrderFound: 'Naročilo ni najdeno.',
    orderNotFound: 'Naročilo ne obstaja.',
    goHome: 'Na začetno stran',
    // Status headers
    statusNew:        { title: 'Naročilo sprejeto',       subtitle: 'Kuhinja je prejela vaše naročilo in bo kmalu začela s pripravo.' },
    statusPreparing:  { title: 'V pripravi',              subtitle: 'Kuhar pripravlja vašo jed iz svežih sestavin.' },
    statusReady:      { title: 'Pripravljeno! 🔔',        subtitle: 'Vaša hrana je pripravljena in bo kmalu prinesena na mizo.' },
    statusDone:       { title: 'Postreženo! Dober tek 🍽', subtitle: 'Upamo, da vam bo teknilo! Kadarkoli lahko naročite še več.' },
    statusCancelled:  { title: 'Preklicano',              subtitle: 'To naročilo je bilo preklicano. Prosimo, obrnite se na osebje.' },
    statusProcessing: { title: 'Obdelava…',               subtitle: 'Preverjam status…' },
    // Order number block
    yourOrderNumber: 'Vaša številka naročila',
    table: 'Miza',
    // Progress tracker
    stepReceived:  'Sprejeto',
    stepPreparing: 'Priprava',
    stepOrderUp:   'Pripravljeno!',
    stepServed:    'Postreženo',
    // Order details
    orderItems: 'Naročeni artikli',
    totalPrice: 'Skupaj',
    paymentLabel: 'Plačilo',
    statusLabel: 'Status',
    // Action
    orderMore: 'Naroči še kaj',
    keepOpen: 'Pustite to stran odprto za sledenje naročilu v živo!',
    // Review
    howWasIt: 'Kako je bilo?',
    reviewSubtitle: 'Vaše mnenje nam pomaga izboljšati storitev.',
    commentPlaceholder: 'Povejte nam kaj menite… (neobvezno)',
    reviewSubmit: 'Pošlji mnenje',
    reviewSubmitting: 'Pošiljam…',
    reviewThankYou: 'Hvala za vaše mnenje! 🙏',
    reviewThankYouSub: 'Vaše mnenje smo prejeli.',
    reviewError: 'Napaka pri pošiljanju. Poskusite znova.',
  },
  en: {
    titleNotFound: 'Order not found',
    titleStatus: 'Order status',
    errorLabel: 'Error',
    noOrderFound: 'No order found.',
    orderNotFound: 'Order not found.',
    goHome: 'Go to home page',
    statusNew:        { title: 'Order Received',      subtitle: 'The kitchen has received your order and will start cooking soon.' },
    statusPreparing:  { title: 'Getting Ready',       subtitle: 'The chef is preparing your meal with fresh ingredients right now.' },
    statusReady:      { title: 'Order Up! 🔔',        subtitle: 'Your food is freshly cooked and ready to be served!' },
    statusDone:       { title: 'Served! Enjoy 🍽',    subtitle: 'We hope you love it! Feel free to order more anytime.' },
    statusCancelled:  { title: 'Cancelled',           subtitle: 'This order has been cancelled. Please speak with staff for details.' },
    statusProcessing: { title: 'Processing…',         subtitle: 'Checking status…' },
    yourOrderNumber: 'Your Order Number',
    table: 'Table',
    stepReceived:  'Received',
    stepPreparing: 'Preparing',
    stepOrderUp:   'Order Up!',
    stepServed:    'Served',
    orderItems: 'Order Items',
    totalPrice: 'Total Price',
    paymentLabel: 'Payment',
    statusLabel: 'Status',
    orderMore: 'Order more delicious food',
    keepOpen: 'Keep this screen open to track your order in real-time!',
    howWasIt: 'How was your order?',
    reviewSubtitle: 'Your feedback helps us do better.',
    commentPlaceholder: 'Tell us what you think… (optional)',
    reviewSubmit: 'Submit review',
    reviewSubmitting: 'Submitting…',
    reviewThankYou: 'Thank you for your feedback! 🙏',
    reviewThankYouSub: 'We really appreciate it.',
    reviewError: 'Failed to submit. Please try again.',
  },
};

function getLang(): Lang {
  return (localStorage.getItem('menu.lang') as Lang) ?? 'sl';
}

// ─── Star Picker ──────────────────────────────────────────────────────────────

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1 justify-center">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(0)}
          className="text-4xl transition-all active:scale-90 select-none leading-none"
          style={{ filter: s <= (hovered || value) ? 'none' : 'grayscale(1) opacity(0.25)' }}
        >
          ⭐
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5 justify-center">
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          className="text-2xl leading-none"
          style={{ filter: s <= value ? 'none' : 'grayscale(1) opacity(0.2)' }}
        >
          ⭐
        </span>
      ))}
    </div>
  );
}

// ─── Review Card ──────────────────────────────────────────────────────────────

interface ReviewCardProps {
  orderId: string;
  t: typeof T['en'];
  initialRating?: number;
  initialComment?: string;
  initialSubmitted?: boolean;
}

function ReviewCard({ orderId, t, initialRating = 0, initialComment = '', initialSubmitted = false }: ReviewCardProps) {
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [submitError, setSubmitError] = useState('');

  async function handleSubmit() {
    if (rating === 0) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await submitOrderReview(orderId, {
        rating,
        comment: comment.trim(),
        timestamp: Date.now(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Review submit error:', err);
      setSubmitError(t.reviewError);
    }
    setSubmitting(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, type: 'spring', damping: 22, stiffness: 260 }}
      className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden"
    >
      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="thankyou"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 text-center"
          >
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, type: 'spring', damping: 16, stiffness: 300 }}
              className="text-5xl mb-3"
            >
              🙏
            </motion.div>
            <p className="font-black text-gray-900 text-lg mb-1">{t.reviewThankYou}</p>
            <p className="text-sm text-gray-400 mb-4">{t.reviewThankYouSub}</p>
            <StarDisplay value={rating} />
            {comment.trim() && (
              <p className="text-sm text-gray-500 italic mt-3 leading-relaxed">
                "{comment.trim()}"
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100 px-6 py-4 text-center">
              <p className="font-black text-gray-900 text-base">{t.howWasIt}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t.reviewSubtitle}</p>
            </div>

            <div className="p-6 space-y-4">
              <StarPicker value={rating} onChange={setRating} />

              <AnimatePresence>
                {rating > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <textarea
                      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-400 transition-colors resize-none font-medium"
                      placeholder={t.commentPlaceholder}
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {submitError && (
                <p className="text-red-500 text-sm text-center font-medium">{submitError}</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={rating === 0 || submitting}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl text-sm disabled:opacity-40 transition-all active:scale-[0.98] shadow-sm"
              >
                {submitting ? t.reviewSubmitting : t.reviewSubmit}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrderSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const orderId = searchParams.get('order_id');

  const [lang] = useState<Lang>(getLang);
  const t = T[lang];

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [existingReview, setExistingReview] = useState<{ rating: number; comment: string } | null>(null);
  const [showReview, setShowReview] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to review card only when it's a fresh prompt (no review yet).
  // If the order already has a review (page refresh / returning customer),
  // the card shows passively at the bottom — no scroll hijack.
  useEffect(() => {
    if (!showReview) return;
    if (existingReview) return;
    const timer = setTimeout(() => {
      reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
    return () => clearTimeout(timer);
  }, [showReview]);

  useDocumentTitle(
    error
      ? t.titleNotFound
      : order
        ? `#${String(order.orderNumber).padStart(3, '0')} · ${t.titleStatus}`
        : t.titleStatus,
  );

  useEffect(() => {
    if (!orderId) { setError(t.noOrderFound); return; }
    const unsub = onValue(refs.order(orderId), (snap) => {
      if (!snap.exists()) { setError(t.orderNotFound); return; }
      const o = { id: orderId, ...snap.val() } as Order;
      setOrder(o);
      if (o.status === 'new' && sessionId) updateOrderStatus(orderId, 'new');
      if (o.status === 'done') {
        setShowReview(true);
        if (o.review) setExistingReview({ rating: o.review.rating, comment: o.review.comment });
      }
    });
    return () => unsub();
  }, [orderId, sessionId]);

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-gray-50">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-sm w-full">
        <XCircle size={64} className="text-red-500 mx-auto mb-4" />
        <p className="text-gray-700 font-semibold mb-2">{t.errorLabel}</p>
        <p className="text-gray-500 text-sm mb-6">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="w-full bg-orange-500 text-white font-semibold py-3.5 rounded-2xl transition-all hover:bg-orange-600 active:scale-[0.98]"
        >
          {t.goHome}
        </button>
      </div>
    </div>
  );

  if (!order) return <OrderSuccessSkeleton />;

  // ── Status config ─────────────────────────────────────────────────────────
  const statusConfig = {
    new: {
      step: 1, color: 'text-orange-500 bg-orange-50 border-orange-100',
      ...t.statusNew,
      icon: <Clock className="w-10 h-10 text-orange-500 animate-pulse" />,
    },
    preparing: {
      step: 2, color: 'text-blue-500 bg-blue-50 border-blue-100',
      ...t.statusPreparing,
      icon: <ChefHat className="w-10 h-10 text-blue-500 animate-bounce" />,
    },
    ready: {
      step: 3, color: 'text-green-500 bg-green-50 border-green-100',
      ...t.statusReady,
      icon: <BellRing className="w-10 h-10 text-green-500 animate-bounce" />,
    },
    done: {
      step: 4, color: 'text-gray-600 bg-gray-50 border-gray-100',
      ...t.statusDone,
      icon: <CheckCircle className="w-10 h-10 text-green-600" />,
    },
    cancelled: {
      step: 0, color: 'text-red-500 bg-red-50 border-red-100',
      ...t.statusCancelled,
      icon: <XCircle className="w-10 h-10 text-red-500" />,
    },
  }[order.status] ?? {
    step: 1, color: 'text-gray-500 bg-gray-50 border-gray-100',
    ...t.statusProcessing,
    icon: <Clock className="w-10 h-10 text-gray-500 animate-spin" />,
  };

  const steps = [
    { num: 1, label: t.stepReceived },
    { num: 2, label: t.stepPreparing },
    { num: 3, label: t.stepOrderUp },
    { num: 4, label: t.stepServed },
  ];

  let parsedItems: CartItem[] = [];
  try { parsedItems = JSON.parse(order.items); } catch { /* fallback */ }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-4">

        {/* ── Main order card ── */}
        <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">

          {/* Status Header */}
          <div className={`p-6 border-b border-gray-100 flex flex-col items-center text-center ${statusConfig.color}`}>
            <div className="p-3 bg-white rounded-2xl shadow-sm mb-4 border border-inherit">
              {statusConfig.icon}
            </div>
            <h2 className="text-2xl font-black tracking-tight mb-2 text-gray-900">{statusConfig.title}</h2>
            <p className="text-gray-500 text-sm max-w-xs">{statusConfig.subtitle}</p>
          </div>

          <div className="p-6 space-y-6">

            {/* Order number */}
            <div className="bg-gray-50 rounded-2xl p-4 text-center border border-gray-100">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1">
                {t.yourOrderNumber}
              </span>
              <span className="text-5xl font-black text-orange-500">
                #{String(order.orderNumber).padStart(3, '0')}
              </span>
              {order.tableNumber != null && (
                <span className="mt-2 inline-block bg-orange-100 text-orange-700 text-xs font-bold px-3 py-1 rounded-full">
                  {t.table} {order.tableNumber}
                </span>
              )}
            </div>

            {/* Progress Tracker */}
            {order.status !== 'cancelled' && (
              <div className="py-2">
                <div className="flex items-center justify-between relative mb-2">
                  <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-gray-100 -z-0 rounded-full" />
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-orange-500 -z-0 rounded-full transition-all duration-500"
                    style={{ width: `${((statusConfig.step - 1) / 3) * 100}%` }}
                  />
                  {steps.map((s) => {
                    const isActive = s.num === statusConfig.step;
                    const isCompleted = s.num < statusConfig.step || order.status === 'done';
                    return (
                      <div key={s.num} className="flex flex-col items-center z-10">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 border-2 ${
                          isCompleted
                            ? 'bg-orange-500 border-orange-500 text-white'
                            : isActive
                            ? 'bg-white border-orange-500 text-orange-500 ring-4 ring-orange-50'
                            : 'bg-white border-gray-200 text-gray-400'
                        }`}>
                          {isCompleted ? '✓' : s.num}
                        </div>
                        <span className={`text-[10px] font-extrabold mt-2 tracking-wide uppercase ${
                          isActive ? 'text-orange-500' : isCompleted ? 'text-gray-700' : 'text-gray-400'
                        }`}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Order Details */}
            <div className="border-t border-gray-100 pt-5 space-y-4">
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">{t.orderItems}</h3>
              <div className="space-y-2.5 max-h-44 overflow-y-auto pr-1">
                {parsedItems.length > 0 ? (
                  parsedItems.map((item, i) => (
                    <div key={i} className="flex justify-between items-start gap-4">
                      <div className="flex gap-2">
                        <span className="font-extrabold text-orange-500 text-sm">{item.quantity}x</span>
                        <div>
                          <p className="text-gray-800 text-sm font-semibold leading-tight">{item.name}</p>
                          {item.modifiers && <p className="text-xs text-gray-400 mt-0.5">{item.modifiers}</p>}
                        </div>
                      </div>
                      <span className="text-gray-800 text-sm font-bold">
                        €{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-600 text-sm">{order.itemsReadable}</p>
                )}
              </div>

              <div className="border-t border-gray-100 pt-4 flex justify-between items-center">
                <span className="text-sm font-bold text-gray-700">{t.totalPrice}</span>
                <span className="text-lg font-black text-gray-900">€{order.totalPrice.toFixed(2)}</span>
              </div>

              <div className="bg-orange-50/50 rounded-2xl p-3 flex justify-between text-xs text-orange-800 border border-orange-100/50">
                <span>{t.paymentLabel}: <strong className="uppercase">{order.paymentType}</strong></span>
                <span>{t.statusLabel}: <strong className="uppercase">{order.status}</strong></span>
              </div>
            </div>

            {/* Action */}
            <div className="pt-2 space-y-3">
              <button
                onClick={() => navigate(`/order?r=${order.restaurantId}&t=${order.tableNumber ?? ''}`)}
                className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl text-base shadow-sm transition-all hover:bg-orange-600 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                {t.orderMore}
              </button>

              {order.status !== 'done' && (
                <div className="text-center">
                  <p className="text-xs text-gray-400">{t.keepOpen}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Review card — slides in when order is served ── */}
        <AnimatePresence>
          {showReview && orderId && (
            <div ref={reviewRef}>
              <ReviewCard
                key="review"
                orderId={orderId}
                t={t}
                initialRating={existingReview?.rating}
                initialComment={existingReview?.comment}
                initialSubmitted={!!existingReview}
              />
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
