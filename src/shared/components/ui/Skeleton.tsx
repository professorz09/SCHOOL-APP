import React from 'react';

/**
 * Shimmer skeleton primitives. Use these instead of "Loading..." text
 * for list-style screens so the loading state visually matches the
 * loaded layout — feels ~2x faster than a centered spinner because
 * the user's eye already sees the shape of the data coming.
 *
 * Tailwind's built-in `animate-pulse` drives the shimmer. The slate
 * tone matches the app's default surface; callers can pass extra
 * className overrides for tinted contexts (white cards on slate-50
 * pages should keep the default slate-200 / 100 shimmer).
 */

interface SkeletonProps {
  /** Tailwind width class (e.g. "w-full", "w-1/2", "w-24"). */
  w?: string;
  /** Tailwind height class (e.g. "h-3", "h-4", "h-10"). */
  h?: string;
  /** Tailwind rounding override. Default is `rounded-md`. */
  rounded?: string;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  w = 'w-full', h = 'h-3', rounded = 'rounded-md', className = '',
}) => (
  <div className={`bg-slate-200/70 animate-pulse ${rounded} ${w} ${h} ${className}`} />
);

/** Pre-composed "list row" skeleton — avatar + 2 lines of text. Use
 *  inside a parent card so the divider lines line up with the real rows.
 *  `count` controls how many placeholders to render. */
export const SkeletonRow: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="divide-y divide-slate-50">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-3.5">
        <div className="w-10 h-10 rounded-xl bg-slate-200/70 animate-pulse shrink-0"/>
        <div className="flex-1 space-y-2">
          <Skeleton w="w-3/5" h="h-3.5"/>
          <Skeleton w="w-2/5" h="h-2.5"/>
        </div>
        <Skeleton w="w-12" h="h-5" rounded="rounded-full"/>
      </div>
    ))}
  </div>
);

/** Pre-composed "stat card" skeleton — label + big number. */
export const SkeletonStat: React.FC = () => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
    <Skeleton w="w-1/3" h="h-2.5"/>
    <Skeleton w="w-1/2" h="h-7"/>
  </div>
);
