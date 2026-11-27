import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {Link, useNavigate} from 'react-router';
import {q} from '../api/queries';
import {Kpi, PageHeader, Segmented, SessionStatusPill, UserLabel} from '../components/Bits';
import {Road, Roundabout} from '../components/Brand';
import {DailyChart} from '../components/DailyChart';
import {Icon} from '../components/Icon';
import {ErrorState} from '../components/States';
import {usePrefs} from '../i18n/prefs';

const RECENT = {page: 1, pageSize: 6, userId: '', status: '', from: '', to: '', sort: 'started', order: 'desc' as const, tz: ''};

export default function Overview() {
  const {t, fmt} = usePrefs();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<'sessions' | 'km'>('sessions');
  const stats = useQuery(q.stats(days));
  const recent = useQuery(q.sessions(RECENT));
  const live = useQuery(q.live(15));
  const totals = stats.data?.totals;
  const links = stats.data?.shareLinks;

  const dash = <span className="skeleton" style={{width: 64, height: 26}} />;
  const val = (v: React.ReactNode) => (totals ? v : dash);

  return (
    <div className="page">
      <PageHeader title={t('overviewTitle')} text={t('overviewText')} />

      <section className="hero-band">
        <div className="hero-stat">
          <span>{t('kDistance')}</span>
          <b>{val(fmt.km(totals?.distance_m ?? 0, 0))}</b>
        </div>
        <div className="hero-stat">
          <span>{t('kSessions')}</span>
          <b>{val(fmt.num(totals?.sessions))}</b>
        </div>
        <div className="hero-stat">
          <span>{t('kMoving')}</span>
          <b>{val(fmt.duration(totals?.moving_time_s))}</b>
        </div>
        <div className="hero-stat small">
          <span>{t('kLastSync')}</span>
          <b>{val(fmt.relative(totals?.last_sync_at))}</b>
        </div>
        <Link to="/live" className="hero-live">
          <Roundabout size={18} pulse={!!live.data?.length} />
          <span>
            <b>{live.data ? fmt.num(live.data.length) : '–'}</b> {t('liveNow')}
          </span>
          <Icon name="chevron" size={16} className="flip-rtl" />
        </Link>
        <Road className="hero-road" />
      </section>

      {stats.error && <ErrorState error={stats.error} onRetry={() => stats.refetch()} />}

      <section className="kpis">
        <Kpi icon="users" label={t('kUsers')} value={val(fmt.num(totals?.users))} />
        <Kpi icon="activity" label={t('kActive7d')} value={val(fmt.num(totals?.active_users_7d))} />
        <Kpi icon="phone" label={t('kDevices')} value={val(fmt.num(totals?.devices))} />
        <Kpi icon="route" label={t('kOpen')} value={val(fmt.num(totals?.open_sessions))} accent />
        <Kpi icon="live" label={t('kPoints')} value={val(fmt.num(totals?.points))} />
        <Kpi icon="leaf" label={t('kMapUpdates')} value={val(fmt.num(totals?.map_updates))} />
      </section>

      <section className="card">
        <header className="card-head">
          <h2>{t('shareLinks')}</h2>
          <small>
            {fmt.num(days)} {t('days')}
          </small>
        </header>
        <div className="kpis">
          <Kpi icon="link" label={t('slViews')} value={val(fmt.num(links?.views))} />
          <Kpi icon="download" label={t('slDownloads')} value={val(fmt.num(links?.downloads))} />
          <Kpi icon="phone" label={t('slAppOpens')} value={val(fmt.num(links?.app_opens))} />
          <Kpi icon="users" label={t('slInstalls')} value={val(fmt.num(links?.installs))} hint={t('slInstallsHint')} accent />
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <h2>{metric === 'km' ? t('distancePerDay') : t('perDay')}</h2>
            <div className="card-tools">
              <Segmented
                label={t('perDay')}
                value={metric}
                onChange={setMetric}
                options={[
                  {value: 'sessions', label: t('kSessions')},
                  {value: 'km', label: t('km')},
                ]}
              />
              <Segmented
                label={t('days')}
                value={days}
                onChange={setDays}
                options={[7, 30, 90].map(d => ({value: d, label: `${d}`}))}
              />
            </div>
          </header>
          {stats.data ? (
            <DailyChart daily={stats.data.daily} days={days} metric={metric} />
          ) : (
            <div className="skeleton" style={{height: 220}} />
          )}
        </section>

        <section className="card">
          <header className="card-head">
            <h2>{t('recentSessions')}</h2>
            <Link to="/sessions" className="link">
              {t('seeAll')}
            </Link>
          </header>
          <ol className="timeline">
            {recent.data?.items.map(s => (
              <li key={s.id}>
                <button type="button" onClick={() => navigate(`/sessions?selected=${s.id}`)}>
                  <span className="tl-stop" aria-hidden="true" />
                  <span className="tl-main">
                    <UserLabel phone={s.userPhone} name={s.userDisplayName} />
                    <small>{fmt.relative(s.startedAt)}</small>
                  </span>
                  <span className="tl-side">
                    <b>{fmt.km(s.distanceM)}</b>
                    <SessionStatusPill status={s.status} stopReason={s.stopReason} />
                  </span>
                </button>
              </li>
            )) ??
              Array.from({length: 5}, (_, i) => (
                <li key={i}>
                  <span className="skeleton" style={{height: 40}} />
                </li>
              ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
