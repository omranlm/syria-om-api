import {usePrefs} from '../i18n/prefs';
import {Icon} from './Icon';

export const PAGE_SIZES = [10, 25, 50, 100];

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
export function pageList(page: number, pages: number): (number | null)[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter(p => p >= 1 && p <= pages));
  if (page <= 3) [2, 3, 4].forEach(p => p <= pages && wanted.add(p));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach(p => p >= 1 && wanted.add(p));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
}) {
  const {t, fmt} = usePrefs();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label="pagination">
      <span className="range">
        <b>
          {fmt.num(first)}–{fmt.num(last)}
        </b>{' '}
        {t('of')} {fmt.num(total)}
      </span>
      {onPageSize && (
        <label className="page-size">
          {t('rowsPerPage')}
          <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="pages">
        <button
          type="button"
          className="page-btn flip"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label={t('previous')}
        >
          <Icon name="chevron" size={16} />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === null ? (
            <span key={`gap${i}`} className="gap">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`page-btn${p === page ? ' current' : ''}`}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPage(p)}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className="page-btn"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          aria-label={t('next')}
        >
          <Icon name="chevron" size={16} />
        </button>
      </div>
    </nav>
  );
}
