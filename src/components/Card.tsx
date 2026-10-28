import type { ReactNode } from 'react';
import { InfoTip } from './InfoTip';
import { LiveTag } from './LiveTag';

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** "i" explanation shown next to the title (what the box shows and how). */
  info?: string;
  /** Shows the green "Live" tag at the top inline-end (before the "i") for current-moment figures. */
  live?: boolean;
  pad?: 'none' | 'sm' | 'md' | 'lg';
  tone?: 'default' | 'sunken' | 'accent';
  className?: string;
  children?: ReactNode;
  as?: 'section' | 'div' | 'article';
}

/** Surface box: square corners, 1px hairline, no shadow. */
export function Card({ title, subtitle, actions, info, live, pad = 'md', tone = 'default', className = '', children, as: Tag = 'section' }: CardProps) {
  const hasHead = title || actions || info || live;
  return (
    <Tag className={`card card--pad-${pad} ${tone !== 'default' ? `card--${tone}` : ''} ${className}`.trim()}>
      {hasHead && (
        <div className="card__head">
          <div className="card__titles">
            {title && <h3 className="card__title">{title}</h3>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
          {live && <span className="card__end"><LiveTag /></span>}
          {info && <span className="card__info"><InfoTip text={info} /></span>}
        </div>
      )}
      <div className="card__body">{children}</div>
    </Tag>
  );
}

/** Page title block: one Bodoni title, optional actions on the inline end. No subtitle line (client rule). */
export function PageHeader({ title, actions, eyebrow }: { title: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head__text">
        {eyebrow && <span className="label page-head__eyebrow">{eyebrow}</span>}
        <h1 className="page-head__title">{title}</h1>
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  );
}

export function SectionHeader({ title, actions, info, live }: { title: ReactNode; actions?: ReactNode; info?: string; live?: boolean }) {
  return (
    <div className="section-head">
      <h2 className="section-head__title">{title}{live && <LiveTag />}{info && <InfoTip text={info} />}</h2>
      {actions && <div className="section-head__actions">{actions}</div>}
    </div>
  );
}
