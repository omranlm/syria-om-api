import {memo, type ReactNode} from 'react';
import type {Order} from '../api/types';
import {usePrefs} from '../i18n/prefs';
import {Icon} from './Icon';
import {Pagination} from './Pagination';
import {EmptyState, ErrorState} from './States';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Server sort key; the header becomes a sort button. */
  sort?: string;
  align?: 'start' | 'end' | 'center';
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading: boolean;
  /** True while a new page or filter loads with the previous rows still shown. */
  refreshing?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  sort?: string;
  order?: Order;
  onSort?: (sort: string, order: Order) => void;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  page?: number;
  pageSize?: number;
  total?: number;
  onPage?: (page: number) => void;
  onPageSize?: (size: number) => void;
  empty?: ReactNode;
  caption?: string;
}

/**
 * Server-paginated, server-sorted table. Rows stay on screen while the next page loads (dimmed), the first
 * load shows skeleton rows, and rows are keyboard-selectable when they open details.
 */
export function DataTable<T>(props: Props<T>) {
  const {columns, rows, rowKey, loading, refreshing, error, onRetry, sort, order, onSort, onRowClick, selectedKey} =
    props;
  const {t} = usePrefs();

  if (error && !rows) return <ErrorState error={error} onRetry={onRetry} />;

  const toggle = (key: string) => onSort?.(key, sort === key && order === 'desc' ? 'asc' : 'desc');

  return (
    <div className="table-card">
      <div className={`table-scroll${refreshing ? ' refreshing' : ''}`}>
        <table className="table">
          {props.caption && <caption className="sr-only">{props.caption}</caption>}
          <thead>
            <tr>
              {columns.map(c => (
                <th
                  key={c.key}
                  className={`${c.align ? `al-${c.align}` : ''} ${c.className ?? ''}`}
                  aria-sort={c.sort && sort === c.sort ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.sort && onSort ? (
                    <button type="button" className="th-sort" onClick={() => toggle(c.sort!)}>
                      {c.header}
                      <Icon
                        name={sort === c.sort ? (order === 'asc' ? 'up' : 'down') : 'sort'}
                        size={14}
                        className={sort === c.sort ? 'on' : ''}
                      />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !rows
              ? Array.from({length: Math.min(props.pageSize ?? 8, 10)}, (_, i) => <SkeletonRow key={i} cols={columns.length} />)
              : rows?.map(row => (
                  <Row
                    key={rowKey(row)}
                    row={row}
                    columns={columns}
                    selected={selectedKey === rowKey(row)}
                    onClick={onRowClick}
                  />
                ))}
          </tbody>
        </table>
        {!loading && rows?.length === 0 && (props.empty ?? <EmptyState title={t('noResults')} text={t('noResultsText')} />)}
      </div>
      {props.onPage && props.page && props.pageSize && (
        <Pagination
          page={props.page}
          pageSize={props.pageSize}
          total={props.total ?? 0}
          onPage={props.onPage}
          onPageSize={props.onPageSize}
        />
      )}
    </div>
  );
}

function RowImpl<T>({
  row,
  columns,
  selected,
  onClick,
}: {
  row: T;
  columns: Column<T>[];
  selected: boolean;
  onClick?: (row: T) => void;
}) {
  return (
    <tr
      className={`${onClick ? 'clickable' : ''}${selected ? ' selected' : ''}`}
      onClick={onClick ? () => onClick(row) : undefined}
      onKeyDown={
        onClick
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(row);
              }
            }
          : undefined
      }
      tabIndex={onClick ? 0 : undefined}
      aria-selected={onClick ? selected : undefined}
    >
      {columns.map(c => (
        <td key={c.key} className={`${c.align ? `al-${c.align}` : ''} ${c.className ?? ''}`}>
          {c.cell(row)}
        </td>
      ))}
    </tr>
  );
}

// Rows only re-render when their data or selection changes, not on every keystroke in the filters.
const Row = memo(RowImpl) as typeof RowImpl;

function SkeletonRow({cols}: {cols: number}) {
  return (
    <tr className="skeleton-row" aria-hidden="true">
      {Array.from({length: cols}, (_, i) => (
        <td key={i}>
          <span className="skeleton" style={{width: `${40 + ((i * 37) % 50)}%`}} />
        </td>
      ))}
    </tr>
  );
}
