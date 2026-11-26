import {lazy} from 'react';

// Each page is its own chunk, downloaded on first visit (or earlier, when its link is hovered).
const loaders = {
  overview: () => import('../pages/Overview'),
  live: () => import('../pages/Live'),
  users: () => import('../pages/Users'),
  sessions: () => import('../pages/Sessions'),
  activity: () => import('../pages/Activity'),
  sync: () => import('../pages/Sync'),
  settings: () => import('../pages/Settings'),
};

export type PageName = keyof typeof loaders;

export const Pages = {
  Overview: lazy(loaders.overview),
  Live: lazy(loaders.live),
  Users: lazy(loaders.users),
  Sessions: lazy(loaders.sessions),
  Activity: lazy(loaders.activity),
  Sync: lazy(loaders.sync),
  Settings: lazy(loaders.settings),
};

const started = new Set<PageName>();

export function preload(page: PageName) {
  if (started.has(page)) return;
  started.add(page);
  void loaders[page]();
}
