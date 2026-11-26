import {useQuery} from '@tanstack/react-query';
import {lazy, Suspense, useState} from 'react';
import {q} from '../api/queries';
import {PageHeader, Segmented, UserLabel} from '../components/Bits';
import {Roundabout} from '../components/Brand';
import {Icon} from '../components/Icon';
import {EmptyState, ErrorState} from '../components/States';
import {useNow} from '../hooks/useDebounced';
import {usePrefs} from '../i18n/prefs';

const LiveMap = lazy(() => import('../components/map/LiveMap'));

export default function Live() {
  const {t, fmt} = usePrefs();
  const [minutes, setMinutes] = useState(15);
  const [focus, setFocus] = useState<string | null>(null);
  const live = useQuery(q.live(minutes));
  const now = useNow(1000);
  const ago = live.dataUpdatedAt ? Math.max(0, Math.round((now - live.dataUpdatedAt) / 1000)) : null;
  const people = live.data ?? [];

  return (
    <div className="page page-live">
      <PageHeader
        title={t('liveTitle')}
        text={t('liveText')}
        actions={
          <>
            <Segmented
              label={t('lastMinutes')}
              value={minutes}
              onChange={setMinutes}
              options={[
                {value: 15, label: `15 ${t('minutes')}`},
                {value: 60, label: `60 ${t('minutes')}`},
                {value: 240, label: `4 ${t('hours')}`},
              ]}
            />
            <button type="button" className="icon-btn" onClick={() => live.refetch()} aria-label={t('retry')}>
              <Icon name="refresh" className={live.isFetching ? 'spin' : ''} />
            </button>
          </>
        }
      />
      {live.error && <ErrorState error={live.error} onRetry={() => live.refetch()} />}
      <div className="live-layout">
        <div className="card live-map">
          <Suspense fallback={<div className="skeleton map-skeleton" />}>
            <LiveMap people={people} focus={focus} />
          </Suspense>
          <div className="live-status">
            <Roundabout size={12} pulse={people.length > 0} />
            <b>{fmt.num(people.length)}</b>
            <span>
              {t('updated')} {ago === null ? '–' : `${ago} ${t('secondsAgo')}`}
            </span>
          </div>
        </div>
        <aside className="card live-list">
          {people.length === 0 && !live.isPending ? (
            <EmptyState title={t('nobodyLive')} text={t('nobodyLiveText')} />
          ) : (
            <ul>
              {people.map(p => (
                <li key={p.userId}>
                  <button
                    type="button"
                    className={focus === p.userId ? 'on' : ''}
                    onClick={() => setFocus(f => (f === p.userId ? null : p.userId))}
                  >
                    <Roundabout size={12} />
                    <span className="ll-main">
                      <UserLabel phone={p.userPhone} name={p.userDisplayName} />
                      <small>{fmt.relative(p.recordedAt)}</small>
                    </span>
                    <span className="ll-side">
                      {p.speedMps !== null && (
                        <b>
                          {fmt.num(Math.round(p.speedMps * 3.6))} <small>{t('kmh')}</small>
                        </b>
                      )}
                      {p.batteryPct !== null && (
                        <small>
                          <Icon name="battery" size={14} /> {p.batteryPct}%
                        </small>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
