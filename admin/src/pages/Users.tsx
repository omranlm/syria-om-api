import {lazy, Suspense, useDeferredValue, useEffect, useMemo, useState} from 'react';
import {q, usePagedQuery} from '../api/queries';
import type {User} from '../api/types';
import {PageHeader, Pill, UserBadges, UserLabel} from '../components/Bits';
import {DataTable, type Column} from '../components/DataTable';
import {Icon} from '../components/Icon';
import {useDebounced} from '../hooks/useDebounced';
import {useUrlState} from '../hooks/useUrlState';
import {usePrefs} from '../i18n/prefs';

// The details panel is only downloaded when an admin opens a user.
const UserDrawer = lazy(() => import('./UserDrawer'));

const DEFAULTS = {q: '', page: 1, pageSize: 25, sort: 'created', order: 'desc', user: ''};

export default function Users() {
  const {t, fmt} = usePrefs();
  const [state, update, pending] = useUrlState(DEFAULTS);
  // The box updates on every key; the request waits for a pause in typing.
  const [search, setSearch] = useState(state.q);
  const debounced = useDebounced(search, 350);
  useEffect(() => {
    if (debounced !== state.q) update({q: debounced});
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters = {
    q: state.q,
    page: state.page,
    pageSize: state.pageSize,
    sort: state.sort,
    order: state.order === 'asc' ? ('asc' as const) : ('desc' as const),
  };
  const users = usePagedQuery(q.users, filters);
  // While React renders a new page, the table keeps showing the previous rows (dimmed).
  const rows = useDeferredValue(users.data?.items);

  const columns = useMemo<Column<User>[]>(
    () => [
      {
        key: 'user',
        header: t('colUser'),
        cell: u => (
          <div className="cell-user">
            <UserLabel phone={u.phone} name={u.displayName} />
            <span className="badges">
              <UserBadges user={u} />
              {u.role === 'admin' && <Pill tone="blue">{t('roleAdmin')}</Pill>}
            </span>
          </div>
        ),
      },
      {
        key: 'status',
        header: t('colStatus'),
        cell: u =>
          u.status === 'active' ? (
            <Pill tone="green">{t('statusActive')}</Pill>
          ) : (
            <Pill tone="red">{t('statusBlocked')}</Pill>
          ),
      },
      {key: 'sessions', header: t('colSessions'), sort: 'sessions', align: 'end', cell: u => fmt.num(u.stats.sessions)},
      {key: 'distance', header: t('colDistance'), sort: 'distance', align: 'end', cell: u => fmt.km(u.stats.distanceM)},
      {key: 'moving', header: t('colMoving'), sort: 'moving', align: 'end', cell: u => fmt.duration(u.stats.movingTimeS)},
      {key: 'devices', header: t('colDevices'), align: 'end', cell: u => fmt.num(u.stats.devices)},
      {key: 'lastSeen', header: t('colLastSeen'), sort: 'lastSeen', cell: u => fmt.relative(u.lastSeenAt)},
      {key: 'joined', header: t('colJoined'), sort: 'created', cell: u => fmt.date(u.createdAt)},
    ],
    [t, fmt],
  );

  return (
    <div className="page">
      <PageHeader title={t('usersTitle')} text={t('usersText')} />
      <div className="toolbar">
        <label className="search">
          <Icon name="search" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('searchUsers')}
            aria-label={t('search')}
          />
        </label>
        {(users.isFetching || pending) && <span className="spinner" aria-hidden="true" />}
      </div>
      <DataTable
        caption={t('usersTitle')}
        columns={columns}
        rows={rows}
        rowKey={u => u.id}
        loading={users.isPending}
        refreshing={users.isPlaceholderData || rows !== users.data?.items}
        error={users.error}
        onRetry={() => users.refetch()}
        sort={filters.sort}
        order={filters.order}
        onSort={(sort, order) => update({sort, order})}
        onRowClick={u => update({user: u.id, page: state.page})}
        selectedKey={state.user || null}
        page={state.page}
        pageSize={state.pageSize}
        total={users.data?.total}
        onPage={page => update({page})}
        onPageSize={pageSize => update({pageSize})}
      />
      {state.user && (
        <Suspense fallback={null}>
          <UserDrawer id={state.user} onClose={() => update({user: '', page: state.page})} />
        </Suspense>
      )}
    </div>
  );
}
