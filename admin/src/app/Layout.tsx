import {useQuery} from '@tanstack/react-query';
import {Suspense, useEffect, useState} from 'react';
import {Navigate, NavLink, Outlet, useLocation} from 'react-router';
import {API_BASE} from '../api/client';
import {q} from '../api/queries';
import {Mark, Roundabout, Wordmark} from '../components/Brand';
import {Icon, type IconName} from '../components/Icon';
import {ErrorBoundary, PageSkeleton} from '../components/States';
import {usePrefs} from '../i18n/prefs';
import type {StringKey} from '../i18n/strings';
import {useAuth} from './auth';
import {preload, type PageName} from './pages';

const NAV: {to: string; page: PageName; icon: IconName; label: StringKey}[] = [
  {to: '/', page: 'overview', icon: 'overview', label: 'navOverview'},
  {to: '/live', page: 'live', icon: 'live', label: 'navLive'},
  {to: '/users', page: 'users', icon: 'users', label: 'navUsers'},
  {to: '/sessions', page: 'sessions', icon: 'route', label: 'navSessions'},
  {to: '/activity', page: 'activity', icon: 'activity', label: 'navActivity'},
  {to: '/sync', page: 'sync', icon: 'sync', label: 'navSync'},
  {to: '/settings', page: 'settings', icon: 'settings', label: 'navSettings'},
];

export function Layout() {
  const {signedIn, signOut} = useAuth();
  const {t, toggleLang, theme, toggleTheme} = usePrefs();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  // How many people share their location now, for the badge on "On the road now" (shared cache with the Live page).
  const live = useQuery({...q.live(15), enabled: signedIn});

  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (!signedIn) return <Navigate to="/login" replace state={{from: location.pathname + location.search}} />;

  return (
    <div className={`shell${menuOpen ? ' menu-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <Mark size={44} outlined />
          <div>
            <Wordmark />
            <small>{t('console')}</small>
          </div>
        </div>
        <nav className="nav">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}
              // Start downloading the page's code as soon as the pointer or keyboard focus reaches the link.
              onMouseEnter={() => preload(item.page)}
              onFocus={() => preload(item.page)}
            >
              <span className="nav-stop" aria-hidden="true" />
              <Icon name={item.icon} />
              <span>{t(item.label)}</span>
              {item.page === 'live' && !!live.data?.length && <span className="nav-badge">{live.data.length}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <a className="nav-item small" href={`${API_BASE}/explorer`} target="_blank" rel="noreferrer">
            <Icon name="code" />
            <span>{t('apiExplorer')}</span>
          </a>
          <div className="foot-buttons">
            <button type="button" className="icon-btn on-dark" onClick={toggleLang} title={t('language')}>
              <Icon name="globe" />
              <span className="lang-label">{t('language')}</span>
            </button>
            <button
              type="button"
              className="icon-btn on-dark"
              onClick={toggleTheme}
              title={theme === 'dark' ? t('light') : t('dark')}
              aria-label={t('theme')}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <button type="button" className="icon-btn on-dark" onClick={signOut} title={t('signOut')} aria-label={t('signOut')}>
              <Icon name="logout" className="flip-rtl" />
            </button>
          </div>
        </div>
      </aside>

      <div className="topbar">
        <button type="button" className="icon-btn" onClick={() => setMenuOpen(o => !o)} aria-label="menu">
          <Icon name="menu" />
        </button>
        <Mark size={30} />
        <Wordmark />
        <Roundabout size={10} />
      </div>
      <div className="scrim" onClick={() => setMenuOpen(false)} />

      <main className="main">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
