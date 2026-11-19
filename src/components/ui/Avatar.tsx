import React from 'react';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,var(--c-primary),var(--c-avatar-deep))', 'linear-gradient(135deg,var(--c-forest-light),var(--c-forest-dark))',
  'linear-gradient(135deg,var(--c-navy-light),var(--c-primary))', 'linear-gradient(135deg,var(--c-accent),var(--c-copper))',
  'linear-gradient(135deg,var(--c-ink-muted),var(--c-avatar-deep))', 'linear-gradient(135deg,var(--c-forest),var(--c-avatar-deep))',
];

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'md', className = '' }) => {
  const initial = name ? name.trim().charAt(0) : 'ک';
  const hue = AVATAR_GRADIENTS[[...(name || 'ک')].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_GRADIENTS.length];
  
  const sizeClasses = {
    xs: 'w-6 h-6 text-micro',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  }[size];

  if (src) {
    return <img src={src} alt={name} loading="lazy" draggable={false} className={`rounded-full object-cover select-none shadow-xs ${sizeClasses} ${className}`} />;
  }

  return (
    <div 
      style={{ background: hue }}
      className={`rounded-full text-white flex items-center justify-center font-extrabold select-none shadow-xs ${sizeClasses} ${className}`}
    >
      {initial}
    </div>
  );
};

export const AvatarGroup: React.FC<{ users?: { name: string }[]; size?: 'xs' | 'sm' | 'md'; max?: number }> = ({
  users = [],
  size = 'xs',
  max = 3,
}) => {
  const visible = users.slice(0, max);
  const remaining = users.length - max;

  return (
    <div className="flex items-center -space-x-1.5 space-x-reverse" dir="rtl">
      {visible.map((u, i) => (
        <Avatar key={i} name={u.name} size={size} className="border-2 border-white" />
      ))}
      {remaining > 0 && (
        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-nano font-bold flex items-center justify-center border-2 border-white">
          +{remaining}
        </div>
      )}
    </div>
  );
};
