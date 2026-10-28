import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md';
  icon?: LucideIcon;
  iconEnd?: LucideIcon;
  /** Icon-only button: pass the accessible label as `aria-label`. */
  iconOnly?: boolean;
  children?: ReactNode;
}

/** Square button. `primary` is the single yellow call to action per view; `danger` is for destructive actions. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', icon: Icon, iconEnd: IconEnd, iconOnly, className = '', children, type = 'button', ...rest }, ref,
) {
  const cls = ['btn', variant !== 'default' && `btn--${variant}`, size === 'sm' && 'btn--sm', iconOnly && 'btn--icon', className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {Icon && <Icon aria-hidden />}
      {children}
      {IconEnd && <IconEnd aria-hidden className="flip-rtl" />}
    </button>
  );
});
