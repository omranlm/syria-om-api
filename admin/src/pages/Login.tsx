import {useActionState} from 'react';
import {Navigate, useLocation, useNavigate} from 'react-router';
import {useAuth} from '../app/auth';
import {preload} from '../app/pages';
import {Mark, Road, Wordmark} from '../components/Brand';
import {Icon} from '../components/Icon';
import {usePrefs} from '../i18n/prefs';

export default function Login() {
  const {signedIn, signIn, expired} = useAuth();
  const {t, toggleLang, theme, toggleTheme} = usePrefs();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as {from?: string} | null)?.from ?? '/';

  // React 19 form action: the pending flag and the error come from the action. React resets the form after
  // the action, so the phone is kept in the state and comes back as the field's default value.
  const [{error, phone}, submit, pending] = useActionState(
    async (_prev: {error: string | null; phone: string}, form: FormData) => {
      const phone = String(form.get('phone') ?? '');
      try {
        await signIn(phone, String(form.get('password') ?? ''));
        navigate(from, {replace: true});
        return {error: null, phone};
      } catch (e) {
        return {error: e instanceof Error ? e.message : String(e), phone};
      }
    },
    {error: null, phone: ''},
  );

  if (signedIn) return <Navigate to={from} replace />;

  return (
    <div className="login">
      <section className="login-art">
        <div className="login-art-top">
          <Wordmark />
        </div>
        <div className="login-hero">
          <Mark size={170} outlined title={t('tagline')} />
          <h1>
            {t('tagline').split(' ').slice(0, 2).join(' ')}
            <br />
            <em>{t('tagline').split(' ').slice(2).join(' ')}</em>
          </h1>
        </div>
        <Road className="login-road" />
      </section>

      <section className="login-panel">
        <div className="login-tools">
          <button type="button" className="icon-btn" onClick={toggleLang}>
            <Icon name="globe" />
            <span className="lang-label">{t('language')}</span>
          </button>
          <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={t('theme')}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
        <form className="login-form" action={submit} onFocus={() => preload('overview')}>
          <span className="eyebrow">{t('console')}</span>
          <h2>{t('loginTitle')}</h2>
          <p className="muted">{t('loginText')}</p>
          {expired && !error && <p className="notice">{t('sessionExpired')}</p>}
          <label className="field">
            <span>{t('phone')}</span>
            <input
              name="phone"
              type="tel"
              dir="ltr"
              autoComplete="username"
              placeholder="+963…"
              defaultValue={phone}
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>{t('password')}</span>
            <input name="password" type="password" dir="ltr" autoComplete="current-password" required />
          </label>
          <p className="form-error" role="alert" dir="auto">
            {error}
          </p>
          <button type="submit" className="btn primary block" disabled={pending}>
            {pending ? t('signingIn') : t('signIn')}
          </button>
        </form>
        <p className="login-foot">
          OpenStreetMap · <bdi>Organic Maps</bdi>
        </p>
      </section>
    </div>
  );
}
