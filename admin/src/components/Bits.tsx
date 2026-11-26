import {useState, type ReactNode} from 'react';
import type {SessionStatus, User} from '../api/types';
import {usePrefs} from '../i18n/prefs';
import {Icon, type IconName} from './Icon';

export function PageHeader({title, text, actions}: {title: string; text?: string; actions?: ReactNode}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

type Tone = 'neutral' | 'teal' | 'green' | 'amber' | 'red' | 'blue';

export function Pill({tone = 'neutral', children, title}: {tone?: Tone; children: ReactNode; title?: string}) {
  return (
    <span className={`pill ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function SessionStatusPill({status}: {status: SessionStatus}) {
  const {t} = usePrefs();
  const map: Record<SessionStatus, [Tone, string]> = {
    active: ['amber', t('stActive')],
    paused: ['blue', t('stPaused')],
    stopped: ['green', t('stStopped')],
  };
  const [tone, label] = map[status] ?? ['neutral', status];
  return (
    <Pill tone={tone}>
      {status === 'active' && <span className="live-dot" />}
      {label}
    </Pill>
  );
}

/** Phone in Latin digits and left-to-right, or a "no number" pill for anonymous recording accounts. */
export function UserLabel({phone, name}: {phone: string | null | undefined; name?: string | null}) {
  const {t} = usePrefs();
  return (
    <span className="user-label">
      {phone ? (
        <bdi className="phone" dir="ltr">
          {phone}
        </bdi>
      ) : (
        <Pill title={t('anonymousHint')}>{t('anonymous')}</Pill>
      )}
      {name && <small>{name}</small>}
    </span>
  );
}

export function UserBadges({user}: {user: User}) {
  const {t} = usePrefs();
  if (!user.phone) return null;
  return (
    <>
      {user.phoneVerified ? (
        <Pill tone="teal" title={t('verifiedHint')}>
          {t('verified')}
        </Pill>
      ) : (
        <Pill tone="amber" title={t('unverifiedHint')}>
          {t('unverified')}
        </Pill>
      )}
      {user.hasPin && <Pill>{t('pin')}</Pill>}
    </>
  );
}

export function Kpi({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`kpi${accent ? ' accent' : ''}`}>
      <span className="kpi-icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}

/** A segmented choice (status, time window). */
export function Segmented<V extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: V;
  options: {value: V; label: ReactNode}[];
  onChange: (v: V) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({text}: {text: string}) {
  const {t} = usePrefs();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost small"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      <Icon name="copy" size={14} />
      {done ? t('copied') : t('copyId')}
    </button>
  );
}

/** Short id for tables; the full one is in the title. */
export function ShortId({id}: {id: string | null | undefined}) {
  if (!id) return <span className="muted">–</span>;
  return (
    <code className="short-id" title={id}>
      {id.slice(0, 8)}
    </code>
  );
}
