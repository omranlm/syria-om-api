import {useQuery} from '@tanstack/react-query';
import {lazy, Suspense, useMemo} from 'react';
import {q, usePagedQuery} from '../api/queries';
import type {Session} from '../api/types';
import {PageHeader, Segmented, SessionStatusPill, ShortId, UserLabel} from '../components/Bits';
import {DataTable, type Column} from '../components/DataTable';
import {Icon} from '../components/Icon';
import {speedsKmh} from '../components/map/speed';
import {EmptyState, ErrorState} from '../components/States';
import {useUrlState} from '../hooks/useUrlState';
import {usePrefs} from '../i18n/prefs';

// Leaflet and its CSS (~150 kB) are only downloaded once a trip is opened.
const RouteMap = lazy(() => import('../components/map/RouteMap'));

const DEFAULTS = {
  page: 1,
  pageSize: 25,
  userId: '',
  status: '',
  from: '',
  to: '',
  sort: 'started',
  order: 'desc',
  selected: '',
};

export default function Sessions() {
  const {t, fmt, timeZone} = usePrefs();
  const [state, update] = useUrlState(DEFAULTS);
  const filters = {
    page: state.page,
    pageSize: state.pageSize,
    userId: state.userId,
    status: state.status,
    from: state.from,
    to: state.to,
    sort: state.sort,
    order: state.order === 'asc' ? ('asc' as const) : ('desc' as const),
    tz: timeZone,
  };
  const sessions = usePagedQuery(q.sessions, filters);
  const select = (id: string) => update({selected: id, page: state.page});
  const filtered = !!(state.userId || state.status || state.from || state.to);

  const columns = useMemo<Column<Session>[]>(
    () => [
      {
        key: 'started',
        header: t('colStarted'),
        sort: 'started',
        cell: s => (
          <span className="cell-when">
            <b>{fmt.dateTime(s.startedAt)}</b>
            <small>{fmt.relative(s.startedAt)}</small>
          </span>
        ),
      },
      {key: 'user', header: t('colUser'), cell: s => <UserLabel phone={s.userPhone} name={s.userDisplayName} />},
      {key: 'status', header: t('colStatus'), cell: s => <SessionStatusPill status={s.status} />},
      {key: 'distance', header: t('colDistance'), sort: 'distance', align: 'end', cell: s => <b>{fmt.km(s.distanceM, 2)}</b>},
      {
        key: 'client',
        header: t('colClient'),
        align: 'end',
        className: 'hide-md',
        cell: s => <span className="muted">{fmt.km(s.clientDistanceM, 2)}</span>,
      },
      {key: 'moving', header: t('colMoving'), sort: 'moving', align: 'end', cell: s => fmt.duration(s.movingTimeS)},
      {key: 'points', header: t('colPoints'), sort: 'points', align: 'end', className: 'hide-md', cell: s => fmt.num(s.pointCount)},
    ],
    [t, fmt],
  );

  return (
    <div className="page">
      <PageHeader title={t('sessionsTitle')} text={t('sessionsText')} />
      <div className="toolbar">
        <Segmented
          label={t('colStatus')}
          value={state.status}
          onChange={status => update({status})}
          options={[
            {value: '', label: t('anyStatus')},
            {value: 'active', label: t('stActive')},
            {value: 'paused', label: t('stPaused')},
            {value: 'stopped', label: t('stStopped')},
          ]}
        />
        <label className="date-field">
          <span>{t('from')}</span>
          <input type="date" value={state.from} max={state.to || undefined} onChange={e => update({from: e.target.value})} />
        </label>
        <label className="date-field">
          <span>{t('to')}</span>
          <input type="date" value={state.to} min={state.from || undefined} onChange={e => update({to: e.target.value})} />
        </label>
        {state.userId && (
          <span className="filter-chip">
            {t('userFilter')}: <ShortId id={state.userId} />
            <button type="button" onClick={() => update({userId: ''})} aria-label={t('clearFilters')}>
              <Icon name="close" size={14} />
            </button>
          </span>
        )}
        {filtered && (
          <button
            type="button"
            className="btn ghost small"
            onClick={() => update({userId: '', status: '', from: '', to: ''})}
          >
            {t('clearFilters')}
          </button>
        )}
        {sessions.isFetching && <span className="spinner" aria-hidden="true" />}
      </div>

      <div className="split">
        <DataTable
          caption={t('sessionsTitle')}
          columns={columns}
          rows={sessions.data?.items}
          rowKey={s => s.id}
          loading={sessions.isPending}
          refreshing={sessions.isPlaceholderData}
          error={sessions.error}
          onRetry={() => sessions.refetch()}
          sort={filters.sort}
          order={filters.order}
          onSort={(sort, order) => update({sort, order})}
          onRowClick={s => select(s.id)}
          selectedKey={state.selected || null}
          page={state.page}
          pageSize={state.pageSize}
          total={sessions.data?.total}
          onPage={page => update({page})}
          onPageSize={pageSize => update({pageSize})}
        />
        <aside className="card map-card">
          {state.selected ? (
            <SessionPanel id={state.selected} />
          ) : (
            <EmptyState title={t('pickSession')} text={t('pickSessionText')} />
          )}
        </aside>
      </div>
    </div>
  );
}

function SessionPanel({id}: {id: string}) {
  const {t, fmt} = usePrefs();
  const detail = useQuery(q.session(id));
  const geo = useQuery(q.sessionGeo(id));
  const points = useQuery(q.sessionPoints(id));
  const topKmh = useMemo(
    () => (points.data?.length ? speedsKmh(points.data).reduce((a, b) => Math.max(a, b), 0) : null),
    [points.data],
  );
  if (detail.error) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const s = detail.data;
  const duration = s?.endedAt ? (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000 : null;

  return (
    <div className="session-panel">
      <div className="map-box">
        <Suspense fallback={<div className="skeleton map-skeleton" />}>
          {geo.data ? <RouteMap data={geo.data} points={points.data} /> : <div className="skeleton map-skeleton" />}
        </Suspense>
        {geo.data && geo.data.features.length === 0 && <div className="map-empty">{t('noRoute')}</div>}
      </div>
      {s ? (
        <div className="session-facts">
          <div className="facts-head">
            <UserLabel phone={s.userPhone} name={s.userDisplayName} />
            <SessionStatusPill status={s.status} />
          </div>
          <dl className="facts">
            <div>
              <dt>{t('serverDistance')}</dt>
              <dd>{fmt.km(s.distanceM, 2)}</dd>
            </div>
            <div>
              <dt>{t('clientDistance')}</dt>
              <dd>{fmt.km(s.clientDistanceM, 2)}</dd>
            </div>
            <div>
              <dt>{t('colMoving')}</dt>
              <dd>{fmt.duration(s.movingTimeS)}</dd>
            </div>
            <div>
              <dt>{t('duration')}</dt>
              <dd>{fmt.duration(duration)}</dd>
            </div>
            <div>
              <dt>{t('avgSpeed')}</dt>
              <dd>
                {s.distanceM && s.movingTimeS
                  ? `${fmt.num(Math.round((s.distanceM / s.movingTimeS) * 3.6))} ${t('kmh')}`
                  : '–'}
              </dd>
            </div>
            <div>
              <dt>{t('maxSpeed')}</dt>
              <dd>{topKmh === null ? '–' : `${fmt.num(Math.round(topKmh))} ${t('kmh')}`}</dd>
            </div>
            <div>
              <dt>{t('colStarted')}</dt>
              <dd>{fmt.dateTime(s.startedAt)}</dd>
            </div>
            <div>
              <dt>{t('ended')}</dt>
              <dd>{fmt.dateTime(s.endedAt)}</dd>
            </div>
          </dl>
          {s.segments.length > 0 && (
            <>
              <h3 className="section-title">
                {t('segments')} · {s.segments.length}
              </h3>
              <ol className="segments">
                {s.segments.map(seg => (
                  <li key={seg.id}>
                    <span className="seg-no">{seg.seq + 1}</span>
                    <span>{fmt.dateTime(seg.startedAt)}</span>
                    <b>{fmt.km(seg.distanceM, 2)}</b>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      ) : (
        <div className="skeleton" style={{height: 160, margin: 16}} />
      )}
    </div>
  );
}
