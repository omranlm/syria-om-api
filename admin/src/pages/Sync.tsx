import {useMemo} from 'react';
import {q, usePagedQuery} from '../api/queries';
import type {SyncBatch} from '../api/types';
import {PageHeader, ShortId, UserLabel} from '../components/Bits';
import {DataTable, type Column} from '../components/DataTable';
import {Icon} from '../components/Icon';
import {useUrlState} from '../hooks/useUrlState';
import {usePrefs} from '../i18n/prefs';

const DEFAULTS = {page: 1, pageSize: 25, userId: ''};

export default function Sync() {
  const {t, fmt} = usePrefs();
  const [state, update] = useUrlState(DEFAULTS);
  const batches = usePagedQuery(q.sync, state);

  const columns = useMemo<Column<SyncBatch>[]>(
    () => [
      {
        key: 'received',
        header: t('colReceived'),
        cell: b => (
          <span className="cell-when">
            <b>{fmt.dateTime(b.receivedAt)}</b>
            <small>{fmt.relative(b.receivedAt)}</small>
          </span>
        ),
      },
      {key: 'user', header: t('colUser'), cell: b => <UserLabel phone={b.userPhone} />},
      {key: 'sessions', header: t('colSessions'), align: 'end', cell: b => fmt.num(b.sessions)},
      {key: 'segments', header: t('segments'), align: 'end', className: 'hide-md', cell: b => fmt.num(b.segments)},
      {key: 'points', header: t('colPoints'), align: 'end', cell: b => fmt.num(b.points)},
      {key: 'events', header: t('colEvents'), align: 'end', cell: b => fmt.num(b.events)},
      {
        key: 'took',
        header: t('colTook'),
        align: 'end',
        cell: b => (b.durationMs === null ? '–' : `${fmt.num(b.durationMs)} ms`),
      },
      {
        key: 'app',
        header: t('colApp'),
        className: 'hide-md',
        cell: b => (
          <code className="muted" dir="ltr">
            {b.appVersion ?? '–'}
          </code>
        ),
      },
    ],
    [t, fmt],
  );

  return (
    <div className="page">
      <PageHeader title={t('syncTitle')} text={t('syncText')} />
      {state.userId && (
        <div className="toolbar">
          <span className="filter-chip">
            {t('userFilter')}: <ShortId id={state.userId} />
            <button type="button" onClick={() => update({userId: ''})} aria-label={t('clearFilters')}>
              <Icon name="close" size={14} />
            </button>
          </span>
        </div>
      )}
      <DataTable
        caption={t('syncTitle')}
        columns={columns}
        rows={batches.data?.items}
        rowKey={b => b.id}
        loading={batches.isPending}
        refreshing={batches.isPlaceholderData}
        error={batches.error}
        onRetry={() => batches.refetch()}
        page={state.page}
        pageSize={state.pageSize}
        total={batches.data?.total}
        onPage={page => update({page})}
        onPageSize={pageSize => update({pageSize})}
      />
    </div>
  );
}
