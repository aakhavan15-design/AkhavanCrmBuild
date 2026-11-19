/** Button — token-based, focus-visible ring, loading state. Audit-hardened. */
import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success' | 'warning' | 'soft' | 'soft-success' | 'soft-danger' | 'soft-warning' | 'link' | 'link-danger';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'inline';
  icon?: React.ReactNode;
  loading?: boolean;
  block?: boolean;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  block = false,
  className = '',
  children,
  disabled,
  ...props
}) => {
  const base = "inline-flex items-center justify-center gap-2 font-bold rounded-lg transition-[transform,background-color,box-shadow,color] duration-300 ease-[cubic-bezier(0.22,1.35,0.36,1)] active:scale-(--scale-press-strong) hover:brightness-(--brightness-hover) select-none cursor-pointer disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 se-pressable";
  const variants: Record<string, string> = {
    primary: "bg-[var(--c-primary)] text-white hover:bg-[var(--c-primary-hover)] shadow-none hover:shadow-none",
    secondary: "bg-[var(--c-primary-soft)] text-[var(--c-primary)] hover:bg-[var(--c-sunken)] border border-[var(--c-border)]",
    outline: "border border-[var(--c-border)] text-[var(--c-text-primary)] bg-[var(--c-sunken)] hover:bg-[var(--c-surface)] shadow-xs font-bold",
    ghost: "text-[var(--c-text-primary)] hover:bg-[var(--c-sunken)]",
    danger: "bg-[var(--c-danger)] text-white hover:opacity-90 shadow-none",
    success: "bg-[var(--c-success)] text-white hover:opacity-90 shadow-none",
    warning: "bg-[var(--c-warning)] text-white hover:opacity-90 shadow-none",
    soft: "bg-primary/10 text-primary hover:bg-primary/20 shadow-none",
    'soft-success': "bg-success-soft text-success hover:bg-success/20 shadow-none",
    'soft-danger': "bg-danger-soft text-danger hover:bg-danger/20 shadow-none",
    'soft-warning': "bg-warning-soft text-warning hover:bg-warning/20 shadow-none",
    link: "text-primary hover:underline shadow-none rounded-sm",
    'link-danger': "text-danger hover:underline shadow-none rounded-sm"
  };
  const sizes: Record<string, string> = {
    xs: "h-7 min-h-7 px-2 text-caption",
    sm: "h-8 min-h-8 px-3 text-xs",
    md: "h-10 min-h-10 px-4 text-compact",
    lg: "h-11 min-h-11 px-5 text-sm",
    icon: "h-10 w-10 min-h-10 p-0",
    inline: "h-auto min-h-0 p-0 text-caption font-bold"
  };

  return (
    <button
      className={cn(base, variants[variant] || variants.primary, sizes[size] || sizes.md, block && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span aria-hidden className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : icon ? (
        <span className="inline-flex shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
};

export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string; active?: boolean }>(
  ({ className, active, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'relative grid h-10 w-10 min-h-10 shrink-0 cursor-pointer place-items-center rounded-lg transition-colors duration-150',
        'active:scale-95',
        active ? 'bg-primary text-white shadow-sm' : 'bg-surface text-ink hover:bg-canvas border border-border shadow-xs',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);
IconButton.displayName = 'IconButton';
