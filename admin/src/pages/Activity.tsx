import {useQuery} from '@tanstack/react-query';
import {Fragment, useMemo, useState} from 'react';
import {Link} from 'react-router';
import {q, usePagedQuery} from '../api/queries';
import type {ActivityEvent} from '../api/types';
import {PageHeader, Pill, ShortId, UserLabel} from '../components/Bits';
import {DataTable, type Column} from '../components/DataTable';
import {Icon} from '../components/Icon';
import {useUrlState} from '../hooks/useUrlState';
import {usePrefs} from '../i18n/prefs';

const DEFAULTS = {page: 1, pageSize: 25, userId: '', type: '', from: '', to: ''};

/** One line of the payload for the table; the full JSON opens below the row. */
function summary(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  return Object.entries(payload as Record<string, unknown>)
    .filter(([, v]) => v !== null && typeof v !== 'object')
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ');
}

const TONES: Record<string, 'teal' | 'green' | 'amber' | 'red' | 'blue'> = {
  search: 'blue',
  tracking_start: 'teal',
  tracking_stop: 'teal',
  tracking_restored: 'amber',
  map_download: 'green',
  map_update: 'green',
  map_download_failed: 'red',
  admin_user_update: 'amber',
};

export default function Activity() {
  const {t, fmt, timeZone} = usePrefs();
  const [state, update] = useUrlState(DEFAULTS);
  const [open, setOpen] = useState<string | null>(null);
  const events = usePagedQuery(q.activity, {...state, tz: timeZone});
  const types = useQuery(q.activityTypes());

  const columns = useMemo<Column<ActivityEvent>[]>(
    () => [
      {
        key: 'when',
        header: t('colWhen'),
        cell: e => (
          <span className="cell-when">
            <b>{fmt.dateTime(e.occurredAt)}</b>
            <small>{fmt.relative(e.occurredAt)}</small>
          </span>
        ),
      },
      {key: 'user', header: t('colUser'), cell: e => <UserLabel phone={e.userPhone} />},
      {
        key: 'type',
        header: t('colType'),
        cell: e => (
          <Pill tone={TONES[e.type]}>
            <code>{e.type}</code>
          </Pill>
        ),
      },
      {
        key: 'session',
        header: t('colSession'),
        className: 'hide-md',
        cell: e =>
          e.sessionId ? (
            <Link to={`/sessions?selected=${e.sessionId}`} onClick={ev => ev.stopPropagation()}>
              <ShortId id={e.sessionId} />
            </Link>
          ) : (
            <span className="muted">–</span>
          ),
      },
      {
        key: 'payload',
        header: t('colDetails'),
        className: 'cell-payload',
        cell: e => (
          <Fragment>
            <span className="payload-line" dir="ltr">
              {summary(e.payload)}
            </span>
            {open === e.id && (
              <pre className="payload" dir="ltr">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            )}
          </Fragment>
        ),
      },
    ],
    [t, fmt, open],
  );

  return (
    <div className="page">
      <PageHeader title={t('activityTitle')} text={t('activityText')} />
      <div className="toolbar">
        <label className="select-field">
          <span>{t('colType')}</span>
          <select value={state.type} onChange={e => update({type: e.target.value})}>
            <option value="">{t('anyType')}</option>
            {types.data?.map(ty => (
              <option key={ty.type} value={ty.type}>
                {ty.type} ({fmt.num(ty.count)})
              </option>
            ))}
          </select>
        </label>
        <label className="date-field">
          <span>{t('from')}</span>
          <input type="date" value={state.from} onChange={e => update({from: e.target.value})} />
        </label>
        <label className="date-field">
          <span>{t('to')}</span>
          <input type="date" value={state.to} onChange={e => update({to: e.target.value})} />
        </label>
        {state.userId && (
          <span className="filter-chip">
            {t('userFilter')}: <ShortId id={state.userId} />
            <button type="button" onClick={() => update({userId: ''})} aria-label={t('clearFilters')}>
              <Icon name="close" size={14} />
            </button>
          </span>
        )}
        {events.isFetching && <span className="spinner" aria-hidden="true" />}
      </div>
      <DataTable
        caption={t('activityTitle')}
        columns={columns}
        rows={events.data?.items}
        rowKey={e => e.id}
        loading={events.isPending}
        refreshing={events.isPlaceholderData}
        error={events.error}
        onRetry={() => events.refetch()}
        onRowClick={e => setOpen(o => (o === e.id ? null : e.id))}
        selectedKey={open}
        page={state.page}
        pageSize={state.pageSize}
        total={events.data?.total}
        onPage={page => update({page})}
        onPageSize={pageSize => update({pageSize})}
      />
    </div>
  );
}
