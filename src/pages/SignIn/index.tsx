import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Globe, LogIn, Mail } from 'lucide-react';
import { BrandLogo } from '../../components';
import { useI18n } from '../../i18n';
import { useAuth, type SignInState } from '../../layout/auth';
import { canSeePath, homeFor } from '../../layout/access';
import { ROLES, useScope } from '../../layout/filters';
import { ThemeToggle } from '../../layout/Shell';
import type { Role } from '../../data/types';
import './signin.css';

/** Prefilled address per role (BUILD-DECISIONS: email only, no password). */
const ROLE_EMAIL: Record<Role, string> = { coo: 'coo@gymdemo.sa', fm: 'fm@gymdemo.sa' };
const PREFILLED = new Set(Object.values(ROLE_EMAIL));

/**
 * After sign-in the user lands on the role's home (COO: Kingdom map, Facility Manager: his gym overview),
 * unless a deep link was requested that the role may open. Unsafe targets (external, protocol-relative,
 * the sign-in route itself) fall back to the home page.
 */
function safeTarget(from: unknown, role: Role): string {
  const home = homeFor(role);
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/signin') || from === '/') return home;
  if (/[\\\s]/.test(from) || /^\/[a-z]+:/i.test(from)) return home;
  return canSeePath(role, from) ? from : home;
}

function RolePicker({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  const { t } = useI18n();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const rtl = document.documentElement.dir === 'rtl';
    const fwd = e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const back = e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    if (!fwd && !back) return;
    e.preventDefault();
    const n = (i + (fwd ? 1 : -1) + ROLES.length) % ROLES.length;
    onChange(ROLES[n]);
    refs.current[n]?.focus();
  };
  return (
    <div className="signin__field">
      <span className="signin__label" id="signin-role-label">{t('signin.roleLabel')}</span>
      <div className="rolepick" role="radiogroup" aria-labelledby="signin-role-label">
        {ROLES.map((r, i) => {
          const on = r === value;
          return (
            <button key={r} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
              className={`rolepick__opt${on ? ' is-on' : ''}`} onClick={() => onChange(r)} onKeyDown={(e) => onKey(e, i)}>
              <span className="rolepick__head">
                <span className="rolepick__dot" aria-hidden />
                <span className="rolepick__name">{t(`signin.roles.${r}.name`)}</span>
              </span>
              <span className="rolepick__other">{t(`signin.roles.${r}.other`)}</span>
              <span className="rolepick__desc">{t(`signin.roles.${r}.desc`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SignInPage() {
  const { t, toggleLang } = useI18n();
  const { signedIn, signIn, user } = useAuth();
  const { setRole } = useScope();
  const [role, setRoleChoice] = useState<Role>('coo');
  const navigate = useNavigate();
  const loc = useLocation();
  const from = (loc.state as SignInState | null)?.from;
  const [email, setEmail] = useState(ROLE_EMAIL.coo);

  useEffect(() => {
    if (signedIn && user) navigate(safeTarget(from, user.role), { replace: true });
  }, [signedIn, user, from, navigate]);

  const pickRole = (r: Role) => {
    setRoleChoice(r);
    // swap the prefilled address; keep anything the user typed
    if (PREFILLED.has(email) || !email.trim()) setEmail(ROLE_EMAIL[r]);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setRole(role);
    signIn(email.trim() || ROLE_EMAIL[role], role);
    navigate(safeTarget(from, role), { replace: true });
  };

  return (
    <div className="signin">
      <div className="signin__tools">
        <button type="button" className="signin__lang" onClick={toggleLang} aria-label={t('signin.langLabel')}>
          <Globe aria-hidden />
          <span>{t('signin.langToggle')}</span>
        </button>
        <ThemeToggle />
      </div>
      <main className="signin__main">
        <section className="signin__hero">
          <div className="signin__brand">
            <BrandLogo height={48} badge={112} className="signin__logo" />
            <span className="signin__eyebrow">{t('signin.eyebrow')}</span>
          </div>
          <p className="signin__claim">
            <span>{t('signin.heroA')}</span>
            <span className="signin__claim-b">{t('signin.heroB')}</span>
          </p>
          <p className="signin__body">{t('signin.heroBody')}</p>
        </section>
        <form className="signin__card" onSubmit={submit} aria-labelledby="signin-title">
          <div className="signin__head">
            <h1 className="signin__title" id="signin-title">{t('signin.title')}</h1>
            <p className="signin__lead">{t('signin.lead')}</p>
          </div>
          <label className="signin__field">
            <span className="signin__label">{t('signin.email')}</span>
            <span className="signin__inputwrap">
              <Mail aria-hidden />
              <input className="signin__input" type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </span>
          </label>
          <RolePicker value={role} onChange={pickRole} />
          <button type="submit" className="btn btn--primary signin__submit">
            <LogIn aria-hidden />
            {t('signin.submit')}
          </button>
          <p className="signin__note">{t('signin.note')}</p>
        </form>
      </main>
      <footer className="signin__foot">{t('signin.powered')}</footer>
    </div>
  );
}
