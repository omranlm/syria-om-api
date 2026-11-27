import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {FeatureCollection} from 'geojson';
import {useEffect} from 'react';
import {addDays, zonedDayStart} from '../i18n/time';
import {api} from './client';
import type {
  ActivityEvent,
  ActivityType,
  LivePosition,
  Order,
  Page,
  PasswordResult,
  Profile,
  Session,
  SessionDetail,
  Stats,
  SyncBatch,
  TrackPoint,
  User,
  UserDetail,
  UserStatus,
  Role,
} from './types';

export interface Paging {
  page: number; // 1-based
  pageSize: number;
}

const paging = ({page, pageSize}: Paging) => ({limit: pageSize, offset: (page - 1) * pageSize});

export interface UserFilters extends Paging {
  q: string;
  sort: string;
  order: Order;
}

export interface SessionFilters extends Paging {
  userId: string;
  status: string;
  from: string; // yyyy-mm-dd in the selected time zone
  to: string;
  tz: string;
  sort: string;
  order: Order;
}

export interface ActivityFilters extends Paging {
  userId: string;
  type: string;
  from: string;
  to: string;
  tz: string;
}

export interface SyncFilters extends Paging {
  userId: string;
}

/** A yyyy-mm-dd day as the instant it starts in the zone; `endOfDay` gives the start of the next day. */
function dayIso(day: string, tz: string, endOfDay = false): string | undefined {
  if (!day) return undefined;
  return zonedDayStart(endOfDay ? addDays(day, 1) : day, tz);
}

// Query factories: one place for each key and fetcher, reused by hooks, prefetching and invalidation.
export const q = {
  me: () => queryOptions({queryKey: ['me'], queryFn: () => api<Profile>('/admin/me'), staleTime: 5 * 60_000}),
  stats: (days: number) => queryOptions({queryKey: ['stats', days], queryFn: () => api<Stats>('/admin/stats', {query: {days}})}),
  users: (f: UserFilters) =>
    queryOptions({
      queryKey: ['users', f],
      queryFn: ({signal}) =>
        api<Page<User>>('/admin/users', {signal, query: {q: f.q, sort: f.sort, order: f.order, ...paging(f)}}),
    }),
  user: (id: string) =>
    queryOptions({queryKey: ['user', id], queryFn: ({signal}) => api<UserDetail>(`/admin/users/${id}`, {signal})}),
  sessions: (f: SessionFilters) =>
    queryOptions({
      queryKey: ['sessions', f],
      queryFn: ({signal}) =>
        api<Page<Session>>('/admin/sessions', {
          signal,
          query: {
            userId: f.userId,
            status: f.status,
            from: dayIso(f.from, f.tz),
            to: dayIso(f.to, f.tz, true),
            sort: f.sort,
            order: f.order,
            ...paging(f),
          },
        }),
    }),
  session: (id: string) =>
    queryOptions({
      queryKey: ['session', id],
      queryFn: ({signal}) => api<SessionDetail>(`/admin/sessions/${id}`, {signal}),
      staleTime: 60_000,
    }),
  sessionGeo: (id: string) =>
    queryOptions({
      queryKey: ['session', id, 'geojson'],
      queryFn: ({signal}) => api<FeatureCollection>(`/admin/sessions/${id}/geojson`, {signal}),
      staleTime: 60_000,
    }),
  sessionPoints: (id: string) =>
    queryOptions({
      queryKey: ['session', id, 'points'],
      queryFn: ({signal}) => api<TrackPoint[]>(`/admin/sessions/${id}/points`, {signal, query: {limit: 50_000}}),
      staleTime: 60_000,
    }),
  activity: (f: ActivityFilters) =>
    queryOptions({
      queryKey: ['activity', f],
      queryFn: ({signal}) =>
        api<Page<ActivityEvent>>('/admin/activity', {
          signal,
          query: {
            userId: f.userId,
            type: f.type,
            from: dayIso(f.from, f.tz),
            to: dayIso(f.to, f.tz, true),
            ...paging(f),
          },
        }),
    }),
  activityTypes: () =>
    queryOptions({
      queryKey: ['activity-types'],
      queryFn: () => api<ActivityType[]>('/admin/activity/types'),
      staleTime: 5 * 60_000,
    }),
  sync: (f: SyncFilters) =>
    queryOptions({
      queryKey: ['sync', f],
      queryFn: ({signal}) => api<Page<SyncBatch>>('/admin/sync-batches', {signal, query: {userId: f.userId, ...paging(f)}}),
    }),
  live: (minutes: number) =>
    queryOptions({
      queryKey: ['live', minutes],
      queryFn: ({signal}) => api<LivePosition[]>('/admin/live', {signal, query: {minutes}}),
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
    }),
};

/**
 * A paginated list: keeps the previous page on screen while the next one loads (no flicker) and prefetches
 * the following page, so "next" is usually instant.
 */
export function usePagedQuery<F extends Paging, T, K extends QueryKey>(
  factory: (f: F) => UseQueryOptions<Page<T>, Error, Page<T>, K>,
  filters: F,
) {
  const client = useQueryClient();
  const result = useQuery({...factory(filters), placeholderData: keepPreviousData});
  const total = result.data?.total ?? 0;
  useEffect(() => {
    if (filters.page * filters.pageSize < total) void client.prefetchQuery(factory({...filters, page: filters.page + 1}));
    // factory is a module-level function; filters are compared by value.
  }, [client, total, JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps
  return result;
}

/** Block / unblock or change the role, shown at once in every cached users page and rolled back on error. */
export function useUpdateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({id, ...body}: {id: string; status?: UserStatus; role?: Role}) =>
      api<User>(`/admin/users/${id}`, {method: 'PATCH', body: JSON.stringify(body)}),
    onMutate: async ({id, ...patch}) => {
      await client.cancelQueries({queryKey: ['users']});
      await client.cancelQueries({queryKey: ['user', id]});
      const pages = client.getQueriesData<Page<User>>({queryKey: ['users']});
      const detail = client.getQueryData<UserDetail>(['user', id]);
      client.setQueriesData<Page<User>>({queryKey: ['users']}, old =>
        old ? {...old, items: old.items.map(u => (u.id === id ? {...u, ...patch} : u))} : old,
      );
      if (detail) client.setQueryData<UserDetail>(['user', id], {...detail, ...patch});
      return {pages, detail};
    },
    onError: (_e, {id}, ctx) => {
      ctx?.pages.forEach(([key, data]) => client.setQueryData(key, data));
      if (ctx?.detail) client.setQueryData(['user', id], ctx.detail);
    },
    onSettled: (_d, _e, {id}) => {
      void client.invalidateQueries({queryKey: ['users']});
      void client.invalidateQueries({queryKey: ['user', id]});
    },
  });
}

/** The signed-in admin's own password, checked against the current one. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: {currentPassword: string; newPassword: string}) =>
      api<{ok: boolean}>('/admin/me/password', {method: 'PUT', body: JSON.stringify(body)}),
  });
}

/** Sets (value) or generates (no value) a user's app PIN or an admin's dashboard password. */
export function useSetUserPassword() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({id, ...body}: {id: string; value?: string; signOut?: boolean}) =>
      api<PasswordResult>(`/admin/users/${id}/password`, {method: 'POST', body: JSON.stringify(body)}),
    onSettled: (_d, _e, {id}) => {
      void client.invalidateQueries({queryKey: ['users']});
      void client.invalidateQueries({queryKey: ['user', id]});
    },
  });
}
