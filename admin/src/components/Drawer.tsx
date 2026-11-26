import {useEffect, useRef, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {usePrefs} from '../i18n/prefs';
import {Icon} from './Icon';

/** Side panel over the page (inline-end side, so it opens from the left in Arabic). Esc or the backdrop closes it. */
export function Drawer({title, onClose, children}: {title: ReactNode; onClose: () => void; children: ReactNode}) {
  const {t} = usePrefs();
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="drawer-root">
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" ref={panel} tabIndex={-1}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')}>
            <Icon name="close" />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
