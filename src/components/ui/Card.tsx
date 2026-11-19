import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ className, padding = 'md', ...props }) => {
  const pads: Record<string, string> = { none: 'p-0', sm: 'p-2.5', md: 'p-3.5', lg: 'p-4' };
  return (
    <div
      className={cn(
        "bg-surface/90 backdrop-blur-sm border border-border/60 rounded-lg shadow-none transition-all duration-200 ease-out hover:border-border/90",
        pads[padding],
        className
      )}
      {...props}
    />
  );
};
