import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  /** Async function that fetches fresh data. The spinner stays until
   *  the returned promise resolves (or rejects). */
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  /** Pixel distance the user must drag past before triggering refresh.
   *  Default 60 — comfortable for thumb gestures without accidental
   *  triggering when the user is just scrolling near the top. */
  threshold?: number;
  /** Disabled when the parent is in some other interactive flow. */
  disabled?: boolean;
}

/**
 * Touch-only pull-to-refresh wrapper. Mounts a transform-translate band
 * at the top of the child tree. Drag from the top, release past the
 * threshold, the parent's onRefresh runs. Does not interfere with
 * native scroll past the threshold (only the initial pull while
 * scrollTop=0 is captured).
 *
 * Desktop is a no-op — desktop users have a refresh icon in the header
 * or the browser's reload button.
 */
export const PullToRefresh: React.FC<Props> = ({ onRefresh, children, threshold = 60, disabled = false }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [pull, setPull] = useState(0);     // current pull distance in px
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (disabled) return;
    const el = wrapRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      // Only capture pulls starting at scrollTop === 0 — otherwise
      // any downward swipe inside the scrolled list would compete
      // with native scroll.
      if (el.scrollTop > 0) return;
      startY.current = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (dy <= 0) { setPull(0); return; }
      // Rubber-band: scale the visual pull so the user has to drag
      // further than the actual distance — feels natural without
      // letting the band shoot past the screen.
      setPull(Math.min(dy * 0.5, threshold * 1.5));
    };
    const onTouchEnd = async () => {
      if (startY.current === null) return;
      const shouldFire = pull >= threshold;
      startY.current = null;
      setPull(0);
      if (shouldFire && !refreshing) {
        setRefreshing(true);
        try { await onRefresh(); } finally { setRefreshing(false); }
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: true });
    el.addEventListener('touchend',   onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [pull, refreshing, onRefresh, threshold, disabled]);

  const showSpinner = refreshing || pull > 0;
  const armed = pull >= threshold;

  return (
    <div ref={wrapRef} className="relative overflow-y-auto h-full">
      {/* Hint band — appears at the top, animates with pull distance. */}
      {showSpinner && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none z-10"
          style={{
            height: refreshing ? 48 : Math.max(0, pull),
            opacity: refreshing ? 1 : Math.min(pull / threshold, 1),
          }}>
          <div className={`flex items-center gap-2 text-slate-500 ${armed || refreshing ? 'text-blue-600' : ''}`}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''}
              style={{ transform: refreshing ? undefined : `rotate(${pull * 4}deg)` }}/>
            <span className="text-[10px] font-black uppercase tracking-widest">
              {refreshing ? 'Refreshing' : armed ? 'Release to refresh' : 'Pull to refresh'}
            </span>
          </div>
        </div>
      )}
      <div style={{ transform: `translateY(${refreshing ? 48 : pull}px)`, transition: pull === 0 && !refreshing ? 'transform 200ms' : 'none' }}>
        {children}
      </div>
    </div>
  );
};
