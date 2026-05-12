// Minimal sticky tool header. Replaces the earlier Toolsedu-style
// giant "text-8xl" hero with a clean back-arrow + title line. Same
// component works as a section opener for every tool — keeps the
// hierarchy consistent without dominating the page.

import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface Props {
  category?: string;        // kept for prop-compat; unused in render
  categoryColor?: string;   // ditto
  title: string;
  subtitle: string;
  onBack?: () => void;
}

export const ToolHeader: React.FC<Props> = ({ title, subtitle, onBack }) => (
  <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 -mx-3 md:-mx-10 px-3 md:px-10 py-3 mb-5 md:mb-6">
    <div className="flex items-center gap-3 max-w-7xl mx-auto">
      {onBack && (
        <button onClick={onBack}
          className="p-2 -ml-1 rounded-full hover:bg-gray-100 active:scale-95 transition-all shrink-0">
          <ArrowLeft size={18} className="text-gray-700" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg md:text-2xl font-bold text-gray-900 leading-tight truncate">{title}</h1>
        <p className="text-[11px] md:text-xs font-medium text-gray-500 mt-0.5 truncate">{subtitle}</p>
      </div>
    </div>
  </div>
);
