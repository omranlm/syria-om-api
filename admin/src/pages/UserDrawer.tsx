import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router';
import {q, useUpdateUser} from '../api/queries';
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
