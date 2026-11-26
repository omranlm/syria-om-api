import {useMemo, useState} from 'react';
import {PageHeader, Segmented} from '../components/Bits';
import {Combobox, type ComboOption} from '../components/Combobox';
import {Icon} from '../components/Icon';
import {useNow} from '../hooks/useDebounced';
import {usePrefs} from '../i18n/prefs';
import {allTimeZones, browserTimeZone, formatOffset, offsetMinutes} from '../i18n/time';

// Old IANA names some browsers still list, with the names people search for today.
const ALIASES: Record<string, string> = {
  'Asia/Katmandu': 'Kathmandu',
  'Asia/Calcutta': 'Kolkata',
  'Europe/Kiev': 'Kyiv',
  'Asia/Saigon': 'Ho Chi Minh',
  'Asia/Rangoon': 'Yangon',
  'America/Godthab': 'Nuuk',
  'Atlantic/Faeroe': 'Faroe',
};

interface Zone {
  id: string;
  region: string;
  offset: number;
  label: string;
}

/** All zones with their current offset, grouped by region (Africa, America, Asia…), sorted by offset in each. */
function useZones(): Map<string, Zone[]> {
  return useMemo(() => {
    const now = new Date();
    const groups = new Map<string, Zone[]>();
    for (const id of allTimeZones()) {
      const region = id.includes('/') ? id.split('/')[0] : 'UTC';
      const offset = offsetMinutes(id, now);
      const zone = {id, region, offset, label: `(${formatOffset(offset)}) ${id.replace(/_/g, ' ')}`};
      groups.set(region, [...(groups.get(region) ?? []), zone]);
    }
    for (const list of groups.values()) list.sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id));
    return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, []);
}

export default function Settings() {
  const {t, lang, toggleLang, theme, toggleTheme, timeZone, timeZoneSetting, setTimeZone, fmt} = usePrefs();
  const zones = useZones();
  const options = useMemo<ComboOption[]>(
    () =>
      [...zones].flatMap(([region, list]) =>
        list.map(z => ({
          value: z.id,
          label: z.label,
          group: region,
          keywords: `${ALIASES[z.id] ?? ''} ${formatOffset(z.offset).replace('−', '-')}`,
        })),
      ),
    [zones],
  );
  const now = useNow(1000);
  const browser = browserTimeZone();
  const [saved, setSaved] = useState(false);

  const choose = (tz: string) => {
    setTimeZone(tz);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="page">
      <PageHeader title={t('settingsTitle')} text={t('settingsText')} />

      <div className="settings">
        <section className="card setting">
          <header className="setting-head">
            <span className="kpi-icon">
              <Icon name="clock" />
            </span>
            <div>
              <h2>{t('tzTitle')}</h2>
              <p className="muted">{t('tzText')}</p>
            </div>
          </header>

          <div className="tz-now">
            <span className="muted">{t('tzNow')}</span>
            <b>{fmt.dateTime(new Date(now).toISOString())}</b>
            <code dir="ltr">
              {timeZone} · {formatOffset(offsetMinutes(timeZone))}
            </code>
          </div>

          <label className="radio-row">
            <input type="radio" name="tz-mode" checked={!timeZoneSetting} onChange={() => choose('')} />
            <span>
              <b>{t('tzAuto')}</b>
              <small className="muted" dir="ltr">
                {browser} · {formatOffset(offsetMinutes(browser))}
              </small>
            </span>
          </label>
          <label className="radio-row">
            <input
              type="radio"
              name="tz-mode"
              checked={!!timeZoneSetting}
              onChange={() => choose(timeZoneSetting || browser)}
            />
            <span>
              <b>{t('tzPick')}</b>
              <small className="muted">{t('tzPickText')}</small>
            </span>
          </label>

          <Combobox
            options={options}
            value={timeZoneSetting || browser}
            onChange={choose}
            label={t('tzTitle')}
            placeholder={t('tzSearch')}
            emptyText={t('tzNoMatch')}
            disabled={!timeZoneSetting}
            dir="ltr"
          />
          <p className={`saved-note${saved ? ' on' : ''}`} role="status">
            <Icon name="leaf" size={16} /> {t('savedHere')}
          </p>
        </section>

        <section className="card setting">
          <header className="setting-head">
            <span className="kpi-icon">
              <Icon name="globe" />
            </span>
            <div>
              <h2>{t('langTitle')}</h2>
              <p className="muted">{t('langText')}</p>
            </div>
          </header>
          <Segmented
            label={t('langTitle')}
            value={lang}
            onChange={l => l !== lang && toggleLang()}
            options={[
              {value: 'ar', label: 'العربية'},
              {value: 'en', label: 'English'},
            ]}
          />
        </section>

        <section className="card setting">
          <header className="setting-head">
            <span className="kpi-icon">
              <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
            </span>
            <div>
              <h2>{t('theme')}</h2>
              <p className="muted">{t('themeText')}</p>
            </div>
          </header>
          <Segmented
            label={t('theme')}
            value={theme}
            onChange={th => th !== theme && toggleTheme()}
            options={[
              {value: 'light', label: t('light')},
              {value: 'dark', label: t('dark')},
            ]}
          />
        </section>
      </div>
    </div>
  );
}
