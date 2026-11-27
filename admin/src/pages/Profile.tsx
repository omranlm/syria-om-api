import {useQuery} from '@tanstack/react-query';
import {useState, type FormEvent} from 'react';
import {q, useChangePassword} from '../api/queries';
import {PageHeader, Pill, UserLabel} from '../components/Bits';
import {Icon} from '../components/Icon';
import {ErrorState} from '../components/States';
import {usePrefs} from '../i18n/prefs';

const PASSWORD_MIN = 8;

export default function Profile() {
  const {t, fmt} = usePrefs();
  const me = useQuery(q.me());
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [done, setDone] = useState(false);
  const mismatch = repeat !== '' && next !== repeat;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (next.length < PASSWORD_MIN || next !== repeat) return;
    setDone(false);
    change.mutate(
      {currentPassword: current, newPassword: next},
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setRepeat('');
          setDone(true);
        },
      },
    );
  };

  return (
    <div className="page">
      <PageHeader title={t('profileTitle')} text={t('profileText')} />

      <div className="settings profile-layout">
        <section className="card setting">
          {me.error && <ErrorState error={me.error} onRetry={() => me.refetch()} />}
          {!me.data && !me.error && <div className="skeleton" style={{height: 140}} />}
          {me.data && (
            <div className="account">
              <span className="account-avatar" aria-hidden="true">
                <Icon name="user" size={30} />
              </span>
              <div>
                {me.data.displayName && <h2>{me.data.displayName}</h2>}
                <p className="account-phone">
                  <UserLabel phone={me.data.phone} />
                </p>
                <div className="badges">
                  <Pill tone="blue">{t('roleAdmin')}</Pill>
                </div>
                <p className="muted">
                  {t('adminSince')} {fmt.date(me.data.createdAt)}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="card setting">
          <header className="setting-head">
            <span className="kpi-icon">
              <Icon name="key" />
            </span>
            <div>
              <h2>{t('pwTitle')}</h2>
              <p className="muted">{t('pwText')}</p>
            </div>
          </header>

          <form className="password-form" onSubmit={submit}>
            {/* Lets password managers file the new password under this account. */}
            <input type="text" name="username" autoComplete="username" value={me.data?.phone ?? ''} readOnly hidden />
            <label className="field">
              <span>{t('currentPassword')}</span>
              <input
                type="password"
                dir="ltr"
                autoComplete="current-password"
                value={current}
                onChange={e => setCurrent(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>{t('newPassword')}</span>
              <input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                minLength={PASSWORD_MIN}
                maxLength={128}
                value={next}
                onChange={e => setNext(e.target.value)}
                required
              />
              <small className="muted">{t('passwordRule')}</small>
            </label>
            <label className="field">
              <span>{t('repeatPassword')}</span>
              <input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={repeat}
                onChange={e => setRepeat(e.target.value)}
                aria-invalid={mismatch}
                required
              />
            </label>
            <p className="form-error" role="alert" dir="auto">
              {mismatch ? t('passwordMismatch') : change.error?.message}
            </p>
            <div className="password-actions">
              <button
                type="submit"
                className="btn primary"
                disabled={change.isPending || next.length < PASSWORD_MIN || next !== repeat || !current}
              >
                {change.isPending ? t('saving') : t('changePassword')}
              </button>
              <p className={`saved-note${done ? ' on' : ''}`} role="status">
                <Icon name="leaf" size={16} /> {t('passwordChanged')}
              </p>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
