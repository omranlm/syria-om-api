import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {createHashRouter, RouterProvider} from 'react-router';
import {ApiError} from './api/client';
import {AuthProvider} from './app/auth';
import {Layout} from './app/Layout';
import {Pages} from './app/pages';
import {PrefsProvider} from './i18n/prefs';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import './styles/app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Don't retry what the server refused on purpose (bad filter, signed out, not found).
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

// Hash routes (/admin/#/users): the API serves the dashboard as static files, with no fallback for deep links.
const router = createHashRouter([
  {path: '/login', element: <Login />},
  {
    element: <Layout />,
    children: [
      {index: true, element: <Pages.Overview />},
      {path: 'live', element: <Pages.Live />},
      {path: 'users', element: <Pages.Users />},
      {path: 'sessions', element: <Pages.Sessions />},
      {path: 'activity', element: <Pages.Activity />},
      {path: 'sync', element: <Pages.Sync />},
      {path: 'settings', element: <Pages.Settings />},
      {path: 'profile', element: <Pages.Profile />},
      {path: '*', element: <NotFound />},
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PrefsProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </PrefsProvider>
    </QueryClientProvider>
  </StrictMode>,
);
