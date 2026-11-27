import {useQuery} from '@tanstack/react-query';
import {useState, type FormEvent} from 'react';
import {Link} from 'react-router';
import {q, useSetUserPassword, useUpdateUser} from '../api/queries';
import type {PasswordResult, UserDetail} from '../api/types';
import {CopyButton, Pill, UserBadges, UserLabel} from '../components/Bits';
import {Drawer} from '../components/Drawer';
import {Icon} from '../components/Icon';
import {ErrorState} from '../components/States';
import {usePrefs} from '../i18n/prefs';

export default function UserDrawer({id, onClose}: {id: string; onClose: () => void}) {
  const {t, fmt} = usePrefs();
  const user = useQuery(q.user(id));
  const updateUser = useUpdateUser();
  const u = user.data;

  return (
    <Drawer title={u ? <UserLabel phone={u.phone} /> : t('colUser')} onClose={onClose}>
      {user.error && <ErrorState error={user.error} onRetry={() => user.refetch()} />}
      {!u && !user.error && <div className="skeleton" style={{height: 280}} />}
      {u && (
        <>
          <div className="profile">
            <div className="badges">
              <UserBadges user={u} />
              <Pill tone={u.role === 'admin' ? 'blue' : 'neutral'}>{u.role === 'admin' ? t('roleAdmin') : t('roleUser')}</Pill>
              <Pill tone={u.status === 'active' ? 'green' : 'red'}>
                {u.status === 'active' ? t('statusActive') : t('statusBlocked')}
              </Pill>
            </div>
            {u.displayName && <p className="profile-name">{u.displayName}</p>}
            <p className="muted">
              {t('userSince')} {fmt.date(u.createdAt)} · {t('colLastSeen')} {fmt.relative(u.lastSeenAt)}
            </p>
            <CopyButton text={u.id} />
          </div>

          <div className="mini-stats">
            <div>
              <span>{t('colSessions')}</span>
              <b>{fmt.num(u.stats.sessions)}</b>
            </div>
            <div>
              <span>{t('colDistance')}</span>
              <b>{fmt.km(u.stats.distanceM)}</b>
            </div>
            <div>
              <span>{t('colMoving')}</span>
              <b>{fmt.duration(u.stats.movingTimeS)}</b>
            </div>
          </div>

          <div className="drawer-actions">
            <Link className="btn" to={`/sessions?userId=${u.id}`}>
              <Icon name="route" size={16} />
              {t('viewSessions')}
            </Link>
            <Link className="btn" to={`/activity?userId=${u.id}`}>
              <Icon name="activity" size={16} />
              {t('viewActivity')}
            </Link>
          </div>

          <h3 className="section-title">{t('devicesTitle')}</h3>
          {u.devices.length === 0 && <p className="muted">{t('noDevices')}</p>}
          <ul className="devices">
            {u.devices.map(d => (
              <li key={d.id}>
                <Icon name="phone" />
                <div>
                  <b dir="ltr">{d.model ?? '–'}</b>
                  <small dir="ltr">
                    Android {d.osVersion ?? '?'} · {d.flavor ?? ''} {d.appVersion ?? ''}
                  </small>
                  <small>
                    {t('lastSync')}: {fmt.relative(d.lastSyncAt)}
                  </small>
                </div>
              </li>
            ))}
          </ul>

          {!u.anonymous && u.phone && <Credentials key={`${u.id}-${u.role}`} user={u} />}

          <div className="danger-zone">
            <button
              type="button"
              className={`btn ${u.status === 'active' ? 'danger' : 'primary'}`}
              disabled={updateUser.isPending}
              onClick={() => {
                if (u.status === 'active' && !confirm(t('confirmBlock'))) return;
                updateUser.mutate({id: u.id, status: u.status === 'active' ? 'blocked' : 'active'});
              }}
            >
              {u.status === 'active' ? t('block') : t('unblock')}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={updateUser.isPending}
              onClick={() => {
                if (!confirm(t('confirmRole'))) return;
                updateUser.mutate({id: u.id, role: u.role === 'admin' ? 'user' : 'admin'});
              }}
            >
              {u.role === 'admin' ? t('makeUser') : t('makeAdmin')}
            </button>
          </div>
          {updateUser.error && (
            <p className="form-error" role="alert" dir="auto">
              {updateUser.error.message}
            </p>
          )}
        </>
      )}
    </Drawer>
  );
}

const PIN_RE = /^\d{6}$/;
const PASSWORD_MIN = 8;

/**
 * The secret this account signs in with: the app PIN of a user, the dashboard password of an admin.
 * The admin types one or generates one; a generated one is shown here once, to copy and send.
 */
function Credentials({user}: {user: UserDetail}) {
  const {t} = usePrefs();
  const me = useQuery(q.me());
  const setPassword = useSetUserPassword();
  const [value, setValue] = useState('');
  const [signOut, setSignOut] = useState(false);
  const [result, setResult] = useState<PasswordResult | null>(null);
  const pin = user.role !== 'admin';
  const valid = pin ? PIN_RE.test(value) : value.length >= PASSWORD_MIN;

  if (me.data?.id === user.id)
    return (
      <section className="credentials">
        <h3 className="section-title">{t('adminPwTitle')}</h3>
        <p className="muted">
          <Link to="/profile">{t('ownPasswordHint')}</Link>
        </p>
      </section>
    );

  const save = (typed: string | undefined) => {
    if (!confirm(pin ? t('confirmSetPin') : t('confirmSetPassword'))) return;
    setResult(null);
    setPassword.mutate(
      {id: user.id, value: typed, signOut},
      {
        onSuccess: r => {
          setResult(r);
          setValue('');
        },
      },
    );
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) save(value);
  };

  return (
    <section className="credentials">
      <h3 className="section-title">
        <Icon name="key" size={16} /> {pin ? t('pinTitle') : t('adminPwTitle')}
      </h3>
      <p className="muted">{pin ? t('pinText') : t('adminPwText')}</p>
      <form className="credential-form" onSubmit={submit}>
        <input
          type={pin ? 'text' : 'password'}
          inputMode={pin ? 'numeric' : undefined}
          dir="ltr"
          autoComplete="off"
          maxLength={pin ? 6 : 128}
          placeholder={pin ? t('pinRule') : t('passwordRule')}
          aria-label={pin ? t('pinTitle') : t('adminPwTitle')}
          value={value}
          onChange={e => setValue(pin ? e.target.value.replace(/\D/g, '') : e.target.value)}
        />
        <button type="submit" className="btn" disabled={!valid || setPassword.isPending}>
          {t('setValue')}
        </button>
        <button type="button" className="btn primary" disabled={setPassword.isPending} onClick={() => save(undefined)}>
          <Icon name="refresh" size={16} />
          {t('generate')}
        </button>
      </form>
      <label className="check-row">
        <input type="checkbox" checked={signOut} onChange={e => setSignOut(e.target.checked)} />
        <span>{t('signOutEverywhere')}</span>
      </label>
      {result?.generated && (
        <div className="secret" role="status">
          <span>{result.kind === 'pin' ? t('newPin') : t('newPassword')}</span>
          <code dir="ltr">{result.generated}</code>
          <CopyButton text={result.generated} label={t('copy')} />
          <small>{t('shownOnce')}</small>
        </div>
      )}
      {result && !result.generated && (
        <p className="saved-note on" role="status">
          <Icon name="leaf" size={16} /> {result.kind === 'pin' ? t('pinSaved') : t('passwordSaved')}
        </p>
      )}
      {setPassword.error && (
        <p className="form-error" role="alert" dir="auto">
          {setPassword.error.message}
        </p>
      )}
    </section>
  );
}
