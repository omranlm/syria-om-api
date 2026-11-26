import {Link} from 'react-router';
import {EmptyState} from '../components/States';
import {usePrefs} from '../i18n/prefs';

export default function NotFound() {
  const {t} = usePrefs();
  return (
    <div className="page">
      <EmptyState
        title={t('notFound')}
        action={
          <Link className="btn primary" to="/">
            {t('backHome')}
          </Link>
        }
      />
    </div>
  );
}
