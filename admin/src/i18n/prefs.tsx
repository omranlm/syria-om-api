import {createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode} from 'react';
import {strings, type Lang, type StringKey} from './strings';
import {browserTimeZone, isValidTimeZone} from './time';

type Theme = 'light' | 'dark';

interface Prefs {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  t: (key: StringKey) => string;
  toggleLang: () => void;
  theme: Theme;
  toggleTheme: () => void;
  /** The zone every date is shown in: the saved one, or this browser's. */
  timeZone: string;
  /** The saved zone, '' when following the browser. */
  timeZoneSetting: string;
  setTimeZone: (tz: string) => void;
  fmt: Formatters;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Per-viewer convenience only.
  }
};

/**
 * Number, distance, duration and date formatting for one language and time zone. Dates use the locale's own
 * date and time styles; digits stay Latin, as in the app.
 */
export interface Formatters {
  num: (n: number | string | null | undefined) => string;
  km: (m: number | null | undefined, digits?: number) => string;
  duration: (s: number | string | null | undefined) => string;
  /** An instant as a date in the selected zone. */
  date: (d: string | null | undefined) => string;
  /** An instant as date and time in the selected zone. */
  dateTime: (d: string | null | undefined) => string;
  /** An instant as a time of day in the selected zone. */
  time: (d: string | null | undefined) => string;
  /** A calendar day (yyyy-mm-dd, no time) such as a chart bar; never shifted by the zone. */
  day: (day: string, withYear?: boolean) => string;
  relative: (d: string | null | undefined) => string;
}

export const localeOf = (lang: Lang) => (lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-GB');

function formatters(lang: Lang, timeZone: string): Formatters {
  const locale = localeOf(lang);
  const s = strings[lang];
  const num = new Intl.NumberFormat(locale);
  const dateFmt = new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeZone});
  const dtFmt = new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short', timeZone});
  const timeFmt = new Intl.DateTimeFormat(locale, {timeStyle: 'medium', timeZone});
  const dayFmt = new Intl.DateTimeFormat(locale, {day: 'numeric', month: 'short', timeZone: 'UTC'});
  const dayYearFmt = new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeZone: 'UTC'});
  const rel = new Intl.RelativeTimeFormat(locale, {numeric: 'auto'});
  return {
    num: n => (n === null || n === undefined || n === '' ? '–' : num.format(Number(n))),
    km: (m, digits = 1) =>
      m === null || m === undefined
        ? '–'
        : `${new Intl.NumberFormat(locale, {maximumFractionDigits: digits, minimumFractionDigits: digits}).format(m / 1000)} ${s.km}`,
    duration: v => {
      if (v === null || v === undefined || v === '') return '–';
      const total = Number(v);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      return h ? `${num.format(h)} ${s.h} ${m} ${s.m}` : `${m} ${s.m}`;
    },
    date: d => (d ? dateFmt.format(new Date(d)) : '–'),
    dateTime: d => (d ? dtFmt.format(new Date(d)) : '–'),
    time: d => (d ? timeFmt.format(new Date(d)) : '–'),
    day: (day, withYear = false) => (withYear ? dayYearFmt : dayFmt).format(new Date(`${day.slice(0, 10)}T00:00:00Z`)),
    relative: d => {
      if (!d) return '–';
      const diff = (new Date(d).getTime() - Date.now()) / 1000;
      const abs = Math.abs(diff);
      if (abs < 60) return rel.format(Math.round(diff), 'second');
      if (abs < 3600) return rel.format(Math.round(diff / 60), 'minute');
      if (abs < 86400) return rel.format(Math.round(diff / 3600), 'hour');
      if (abs < 86400 * 30) return rel.format(Math.round(diff / 86400), 'day');
      return dateFmt.format(new Date(d));
    },
  };
}

const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({children}: {children: ReactNode}) {
  const [lang, setLang] = useState<Lang>(() => (read('om-admin-lang') === 'en' ? 'en' : 'ar'));
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = read('om-admin-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [timeZoneSetting, setTz] = useState(() => {
    const saved = read('om-admin-tz') ?? '';
    return saved && isValidTimeZone(saved) ? saved : '';
  });
  const timeZone = timeZoneSetting || browserTimeZone();
  const setTimeZone = useCallback((tz: string) => {
    write('om-admin-tz', tz);
    setTz(tz);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleLang = useCallback(() => {
    setLang(l => {
      const next = l === 'ar' ? 'en' : 'ar';
      write('om-admin-lang', next);
      return next;
    });
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme(th => {
      const next = th === 'dark' ? 'light' : 'dark';
      write('om-admin-theme', next);
      return next;
    });
  }, []);

  const value = useMemo<Prefs>(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      t: key => strings[lang][key],
      toggleLang,
      theme,
      toggleTheme,
      timeZone,
      timeZoneSetting,
      setTimeZone,
      fmt: formatters(lang, timeZone),
    }),
    [lang, theme, toggleLang, toggleTheme, timeZone, timeZoneSetting, setTimeZone],
  );
  return <PrefsContext value={value}>{children}</PrefsContext>;
}

export function usePrefs(): Prefs {
  const ctx = use(PrefsContext);
  if (!ctx) throw new Error('usePrefs outside PrefsProvider');
  return ctx;
}
