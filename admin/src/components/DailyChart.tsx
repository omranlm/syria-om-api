import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {DailyStat} from '../api/types';
import {usePrefs} from '../i18n/prefs';
import {addDays, todayIn} from '../i18n/time';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** One value per calendar day of the window, zero on days without trips, so gaps show as gaps. */
function fillDays(daily: DailyStat[], days: number, metric: 'sessions' | 'km', timeZone: string) {
  const byDay = new Map(daily.map(d => [d.day.slice(0, 10), d]));
  const out: {day: string; value: number}[] = [];
  const today = todayIn(timeZone);
  for (let i = days - 1; i >= 0; i--) {
    const key = addDays(today, -i);
    const row = byDay.get(key);
    out.push({day: key, value: row ? (metric === 'km' ? row.distance_m / 1000 : row.sessions) : 0});
  }
  return out;
}

/** Bars per day with a hover read-out. Time runs left to right in both languages, like the app's charts. */
export function DailyChart({daily, days, metric}: {daily: DailyStat[]; days: number; metric: 'sessions' | 'km'}) {
  const {fmt, t, timeZone} = usePrefs();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => fillDays(daily, days, metric, timeZone), [daily, days, metric, timeZone]);

  const height = 220;
  const pad = {top: 16, right: 8, bottom: 26, left: 36};
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map(d => d.value));
  // A rounded top for the scale: 1, 2, 5 × 10^n.
  const step = 10 ** Math.floor(Math.log10(max));
  const top = [1, 2, 5, 10].map(m => m * step).find(v => v >= max) ?? max;
  const slot = innerW / data.length;
  const barW = Math.max(2, Math.min(28, slot * 0.68));
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 96)));
  const unit = metric === 'km' ? t('km') : '';
  const value = (v: number) => (metric === 'km' ? fmt.num(Math.round(v * 10) / 10) : fmt.num(v));

  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart" ref={ref} dir="ltr">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={metric === 'km' ? t('distancePerDay') : t('perDay')}>
          {[0, 0.5, 1].map(f => (
            <g key={f}>
              <line className="grid" x1={pad.left} x2={width - pad.right} y1={y(top * f)} y2={y(top * f)} />
              <text className="axis" x={pad.left - 8} y={y(top * f) + 4} textAnchor="end">
                {value(top * f)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.left + i * slot + (slot - barW) / 2;
            const barH = Math.max(d.value > 0 ? 3 : 0, innerH - (y(d.value) - pad.top));
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect className="hit" x={pad.left + i * slot} y={pad.top} width={slot} height={innerH} />
                <rect
                  className={`bar${hover === i ? ' on' : ''}`}
                  x={x}
                  y={pad.top + innerH - barH}
                  width={barW}
                  height={barH}
                  rx={Math.min(4, barW / 2)}
                />
                {i % labelEvery === 0 && (
                  <text className="axis" x={x + barW / 2} y={height - 8} textAnchor="middle">
                    {fmt.day(d.day)}
                  </text>
                )}
              </g>
            );
          })}
          {/* The road under the bars, from the identity. */}
          <line className="baseline" x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} />
        </svg>
      )}
      {h && (
        <div
          className="chart-tip"
          style={{
            left: Math.min(width - 130, Math.max(0, pad.left + (hover ?? 0) * slot + slot / 2 - 65)),
            top: Math.max(0, y(h.value) - 54),
          }}
        >
          <b>
            {value(h.value)} {unit}
          </b>
          <span>{fmt.day(h.day, true)}</span>
        </div>
      )}
    </div>
  );
}
