import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-civic-600 text-white hover:bg-civic-700',
    secondary: 'bg-white text-ink border border-slate-300 hover:bg-slate-50',
    ghost: 'text-ink hover:bg-white/70',
    danger: 'bg-red-700 text-white hover:bg-red-800',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
