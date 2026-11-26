/**
 * Where the API is mounted. In development the Vite proxy forwards /api to the Docker API. In production
 * the dashboard is served by the API itself: at /admin/ locally ('' base) or /api/admin/ behind the VPS nginx.
 */
export const API_BASE = import.meta.env.DEV ? '/api' : location.pathname.replace(/\/admin(\/.*)?$/, '');

const TOKEN_KEY = 'adminToken';

export const tokenStore = {
  get(): string {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? '';
    } catch {
      return '';
    }
  },
  set(token: string) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage blocked: the session lasts until the page is reloaded.
    }
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Fired when the API rejects the token, so the auth context can return to the login screen. */
export const UNAUTHORIZED_EVENT = 'om-admin-unauthorized';

type Query = Record<string, string | number | undefined | null>;

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function api<T>(path: string, init: RequestInit & {query?: Query} = {}): Promise<T> {
  const {query, headers, ...rest} = init;
  const res = await fetch(API_BASE + withQuery(path, query), {
    ...rest,
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${tokenStore.get()}`, ...headers},
  });
  if (res.status === 401 || res.status === 403) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError('unauthorized', res.status);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body?.error?.message ?? res.statusText, res.status);
  }
  return res.json() as Promise<T>;
}

export async function login(phone: string, password: string): Promise<string> {
  const res = await fetch(API_BASE + '/auth/admin/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({phone, password}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body?.error?.message ?? res.statusText, res.status);
  return body.accessToken as string;
}
