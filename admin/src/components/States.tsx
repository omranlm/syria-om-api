import {Component, type ErrorInfo, type ReactNode} from 'react';
import {usePrefs} from '../i18n/prefs';
import {Roundabout} from './Brand';

/** Empty result: a short dashed road ending in a roundabout. */
export function EmptyState({title, text, action}: {title: string; text?: string; action?: ReactNode}) {
  return (
    <div className="state">
      <svg className="state-art" viewBox="0 0 160 60" aria-hidden="true">
        <path d="M4 44C40 44 70 16 128 18" fill="none" stroke="var(--road)" strokeWidth="12" strokeLinecap="round" />
        <path d="M4 44C40 44 70 16 128 18" fill="none" stroke="#F2F2F2" strokeWidth="2" strokeDasharray="6 6" />
        <circle cx="136" cy="18" r="13" fill="var(--road)" />
        <circle cx="136" cy="18" r="9" fill="#fff" />
        <circle cx="136" cy="18" r="5" fill="var(--red)" />
      </svg>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({error, onRetry}: {error: Error; onRetry?: () => void}) {
  const {t} = usePrefs();
  return (
    <div className="state error" role="alert">
      <Roundabout size={28} />
      <b>{t('loadFailed')}</b>
      <p dir="auto">{error.message}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          {t('retry')}
        </button>
      )}
    </div>
  );
}

/** Placeholder while a lazy page's code downloads. */
export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true">
      <div className="skeleton" style={{width: 220, height: 30, marginBottom: 12}} />
      <div className="skeleton" style={{width: 360, height: 16, marginBottom: 28}} />
      <div className="skeleton" style={{height: 320, borderRadius: 16}} />
    </div>
  );
}

function CrashScreen({onReset}: {onReset: () => void}) {
  const {t} = usePrefs();
  return (
    <div className="state crash" role="alert">
      <Roundabout size={36} />
      <b>{t('somethingWrong')}</b>
      <button type="button" className="btn primary" onClick={onReset}>
        {t('reload')}
      </button>
    </div>
  );
}

/** Catches render errors (and failed lazy chunks after a redeploy) so one page cannot blank the dashboard. */
export class ErrorBoundary extends Component<{children: ReactNode; resetKey?: string}, {error: Error | null}> {
  state = {error: null as Error | null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(prev: {resetKey?: string}) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({error: null});
  }

  render() {
    if (this.state.error) return <CrashScreen onReset={() => location.reload()} />;
    return this.props.children;
  }
}
