import React from 'react';
import { cn } from '../../lib/utils';

export interface FilterChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** متن ساده؛ برای محتوای ترکیبی از children استفاده شود */
  label?: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}

export const FilterChip: React.FC<FilterChipProps> = ({
  label,
  active,
  onClick,
  count,
  children,
  className,
  ...rest
}) => {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...rest}
      onClick={onClick}
      className={cn(
        'h-8 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        active
          ? 'bg-primary text-white shadow-none'
          : 'bg-surface border border-border-light text-text-secondary hover:bg-sunken hover:text-text-main',
        className
      )}
    >
      {children ?? <span>{label}</span>}
      {count !== undefined && (
        <span
          className={cn(
            'text-micro px-1.5 py-0.2 rounded-full font-mono',
            active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
};
