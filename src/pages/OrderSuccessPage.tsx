import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ChefHat, Clock, BellRing, XCircle, Sparkles } from 'lucide-react';
import { refs, updateOrderStatus, submitOrderReview, onValue } from '../lib/firebase';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { OrderSuccessSkeleton } from '../components/Skeleton';
import type { Order, CartItem } from '../types';

// ─── Review translations ──────────────────────────────────────────────────────

const RT = {
  sl: {
    howWasIt: 'Kako je bilo?',
    reviewSubtitle: 'Vaše mnenje nam pomaga izboljšati storitev.',
    tapStar: 'Izberite oceno',
    commentPlaceholder: 'Povejte nam kaj menite… (neobvezno)',
    submit: 'Pošlji mnenje',
    submitting: 'Pošiljam…',
    thankYou: 'Hvala za vaše mnenje! 🙏',
    thankYouSub: 'Vaše mnenje smo prejeli.',
    errorSubmit: 'Napaka pri pošiljanju. Poskusite znova.',
  },
  en: {
    howWasIt: 'How was your order?',
    reviewSubtitle: 'Your feedback helps us do better.',
    tapStar: 'Select a rating',
    commentPlaceholder: 'Tell us what you think… (optional)',
    submit: 'Submit review',
    submitting: 'Submitting…',
    thankYou: 'Thank you for your feedback! 🙏',
    thankYouSub: 'We really appreciate it.',
    errorSubmit: 'Failed to submit. Please try again.',
  },
};

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
  initialRating?: number;
  initialComment?: string;
  initialSubmitted?: boolean;
}

function ReviewCard({ orderId, initialRating = 0, initialComment = '', initialSubmitted = false }: ReviewCardProps) {
  const lang = (localStorage.getItem('menu.lang') as 'sl' | 'en') ?? 'sl';
  const rt = RT[lang];

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
      setSubmitError(rt.errorSubmit);
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
            <p className="font-black text-gray-900 text-lg mb-1">{rt.thankYou}</p>
            <p className="text-sm text-gray-400 mb-4">{rt.thankYouSub}</p>
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
              <p className="font-black text-gray-900 text-base">{rt.howWasIt}</p>
              <p className="text-xs text-gray-400 mt-0.5">{rt.reviewSubtitle}</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Stars */}
              <StarPicker value={rating} onChange={setRating} />

              {/* Comment (only after star selected) */}
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
                      placeholder={rt.commentPlaceholder}
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
                {submitting ? rt.submitting : rt.submit}
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

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  // Track whether we've already pre-filled the review card from existing data
  const [existingReview, setExistingReview] = useState<{ rating: number; comment: string } | null>(null);
  // Show review card whenever order reaches 'done' status (real-time or on load)
  const [showReview, setShowReview] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to review card as soon as it appears
  useEffect(() => {
    if (!showReview) return;
    // Wait for the motion entrance animation to begin (300 ms),
    // then smoothly scroll the card into view
    const t = setTimeout(() => {
      reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
    return () => clearTimeout(t);
  }, [showReview]);

  useDocumentTitle(
    error
      ? 'Order not found'
      : order
        ? `Order #${String(order.orderNumber).padStart(3, '0')} · ${order.status}`
        : 'Order status',
  );

  useEffect(() => {
    if (!orderId) { setError('No order found.'); return; }
    const unsub = onValue(refs.order(orderId), (snap) => {
      if (!snap.exists()) { setError('Order not found.'); return; }
      const o = { id: orderId, ...snap.val() } as Order;
      setOrder(o);

      if (o.status === 'new' && sessionId) {
        updateOrderStatus(orderId, 'new');
      }

      // Show review card when order is served
      if (o.status === 'done') {
        setShowReview(true);
        // If review already exists (page refresh after submitting), capture it
        if (o.review) {
          setExistingReview({ rating: o.review.rating, comment: o.review.comment });
        }
      }
    });
    return () => unsub();
  }, [orderId, sessionId]);

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-gray-50">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-sm w-full">
        <XCircle size={64} className="text-red-500 mx-auto mb-4" />
        <p className="text-gray-700 font-semibold mb-2">Error</p>
        <p className="text-gray-500 text-sm mb-6">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="w-full bg-orange-500 text-white font-semibold py-3.5 rounded-2xl transition-all hover:bg-orange-600 active:scale-[0.98]"
        >
          Go to home page
        </button>
      </div>
    </div>
  );

  if (!order) return <OrderSuccessSkeleton />;

  const statusConfig = {
    new: {
      step: 1,
      title: 'Order Received',
      subtitle: 'The kitchen has received your order and will start cooking soon.',
      color: 'text-orange-500 bg-orange-50 border-orange-100',
      icon: <Clock className="w-10 h-10 text-orange-500 animate-pulse" />,
    },
    preparing: {
      step: 2,
      title: 'Getting Ready',
      subtitle: 'The chef is preparing your meal with fresh ingredients right now.',
      color: 'text-blue-500 bg-blue-50 border-blue-100',
      icon: <ChefHat className="w-10 h-10 text-blue-500 animate-bounce" />,
    },
    ready: {
      step: 3,
      title: 'Order Up! 🔔',
      subtitle: 'Your food is freshly cooked and ready to be served or collected!',
      color: 'text-green-500 bg-green-50 border-green-100',
      icon: <BellRing className="w-10 h-10 text-green-500 animate-bounce" />,
    },
    done: {
      step: 4,
      title: 'Served! Enjoy 🍽',
      subtitle: 'We hope you love it! Feel free to order more anytime.',
      color: 'text-gray-600 bg-gray-50 border-gray-100',
      icon: <CheckCircle className="w-10 h-10 text-green-600" />,
    },
    cancelled: {
      step: 0,
      title: 'Cancelled',
      subtitle: 'This order has been cancelled. Please speak with staff for details.',
      color: 'text-red-500 bg-red-50 border-red-100',
      icon: <XCircle className="w-10 h-10 text-red-500" />,
    },
  }[order.status] || {
    step: 1,
    title: 'Processing',
    subtitle: 'Checking status...',
    color: 'text-gray-500 bg-gray-50 border-gray-100',
    icon: <Clock className="w-10 h-10 text-gray-500 animate-spin" />,
  };

  const steps = [
    { num: 1, label: 'Received', status: 'new' },
    { num: 2, label: 'Preparing', status: 'preparing' },
    { num: 3, label: 'Order Up!', status: 'ready' },
    { num: 4, label: 'Served', status: 'done' },
  ];

  let parsedItems: CartItem[] = [];
  try {
    parsedItems = JSON.parse(order.items);
  } catch {
    // fallback if string parsed items fail
  }

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
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1">Your Order Number</span>
              <span className="text-5xl font-black text-orange-500">
                #{String(order.orderNumber).padStart(3, '0')}
              </span>
              {order.tableNumber != null && (
                <span className="mt-2 inline-block bg-orange-100 text-orange-700 text-xs font-bold px-3 py-1 rounded-full">
                  Table {order.tableNumber}
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
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Order Items</h3>
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
                      <span className="text-gray-800 text-sm font-bold">€{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-600 text-sm">{order.itemsReadable}</p>
                )}
              </div>

              <div className="border-t border-gray-100 pt-4 flex justify-between items-center">
                <span className="text-sm font-bold text-gray-700">Total Price</span>
                <span className="text-lg font-black text-gray-900">€{order.totalPrice.toFixed(2)}</span>
              </div>

              <div className="bg-orange-50/50 rounded-2xl p-3 flex justify-between text-xs text-orange-800 border border-orange-100/50">
                <span>Payment: <strong className="uppercase">{order.paymentType}</strong></span>
                <span>Status: <strong className="uppercase">{order.status}</strong></span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-3">
              <button
                onClick={() => navigate(`/order?r=${order.restaurantId}&t=${order.tableNumber ?? ''}`)}
                className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl text-base shadow-sm transition-all hover:bg-orange-600 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                Order more delicious food
              </button>

              {order.status !== 'done' && (
                <div className="text-center">
                  <p className="text-xs text-gray-400">Keep this screen open to track your order in real-time!</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Review card — animates in when order is served ── */}
        <AnimatePresence>
          {showReview && orderId && (
            <div ref={reviewRef}>
              <ReviewCard
                key="review"
                orderId={orderId}
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
