/**
 * Tailwind skeleton placeholder. Renders a softly-pulsing gray block at
 * whatever size + radius the caller specifies via className. Use for
 * perceived-performance loading states instead of bare spinners — a spinner
 * tells the user "wait", a skeleton tells the user "content is coming, here's
 * the shape of it".
 *
 * Example:
 *   <Skeleton className="h-4 w-32 rounded-md" />   // text line
 *   <Skeleton className="h-20 w-20 rounded-xl" />  // image / thumbnail
 *   <Skeleton className="h-10 w-full rounded-full" /> // pill / button
 */
interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`bg-gray-200 animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton for a single menu-item row on /order — image thumbnail + two text
 * lines + price. Matches the real card's geometry so the page doesn't jump
 * when real data arrives.
 */
export function MenuItemSkeleton() {
  return (
    <div className="w-full bg-white rounded-2xl p-3 flex gap-3 shadow-sm">
      <Skeleton className="w-20 h-20 rounded-xl flex-shrink-0" />
      <div className="flex-1 py-1 space-y-2">
        <Skeleton className="h-4 w-2/3 rounded-md" />
        <Skeleton className="h-3 w-5/6 rounded-md" />
        <div className="flex items-center justify-between mt-2">
          <Skeleton className="h-4 w-14 rounded-md" />
          <Skeleton className="w-7 h-7 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for the full /order page — restaurant header + category pills
 * + three menu-item rows. Used while the Firebase snapshot is loading.
 */
export function OrderPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="bg-white px-4 pt-4 pb-3 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </div>
      <div className="px-4 pt-4 space-y-3">
        <MenuItemSkeleton />
        <MenuItemSkeleton />
        <MenuItemSkeleton />
      </div>
    </div>
  );
}

/**
 * Skeleton for the /order/success page — status header band + order-number
 * box + progress tracker placeholder. Matches the loaded layout closely so
 * the transition from loading to loaded is jank-free.
 */
export function OrderSuccessSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 flex items-center justify-center">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col items-center">
          <Skeleton className="w-16 h-16 rounded-2xl mb-4" />
          <Skeleton className="h-6 w-40 rounded-md mb-2" />
          <Skeleton className="h-3 w-60 rounded-md" />
        </div>
        <div className="p-6 space-y-6">
          <div className="bg-gray-50 rounded-2xl p-4 flex flex-col items-center space-y-2 border border-gray-100">
            <Skeleton className="h-3 w-32 rounded-md" />
            <Skeleton className="h-12 w-24 rounded-md" />
          </div>
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Skeleton className="w-8 h-8 rounded-full" />
                <Skeleton className="h-2 w-12 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
