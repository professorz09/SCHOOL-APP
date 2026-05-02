import React from 'react';
import { ActionItem } from '@/shared/types/index';

export const ActionGrid: React.FC<{ actions: ActionItem[] }> = ({ actions }) => {
  return (
    <div className="grid grid-cols-4 gap-y-6 gap-x-4 mt-6">
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={action.onClick}
          className="flex flex-col items-center gap-2 group active:scale-95 transition-transform"
        >
          <div
            className={`w-[60px] h-[60px] bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 ${
              action.color || 'text-blue-600'
            }`}
          >
            {action.icon}
          </div>
          <span className="text-[11px] font-bold text-slate-600 text-center leading-tight uppercase tracking-wider">
            {action.title}
          </span>
        </button>
      ))}
    </div>
  );
};

export const AppCard: React.FC<{ children: React.ReactNode; className?: string; noPadding?: boolean; onClick?: () => void }> = ({
  children,
  className = '',
  noPadding = false,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-[32px] shadow-sm border border-slate-100 ${
        noPadding ? '' : 'p-6'
      } ${className}`}
    >
      {children}
    </div>
  );
};

export const SectionTitle: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className="flex items-center justify-between mb-6">
    <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">{title}</h3>
    {action && <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{action}</div>}
  </div>
);
