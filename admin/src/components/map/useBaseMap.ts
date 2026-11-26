import L from 'leaflet';
import {useEffect, useState, type RefObject} from 'react';
import {usePrefs} from '../../i18n/prefs';

const SYRIA = L.latLngBounds([32.3, 35.6], [37.4, 42.4]);

/** A Leaflet map with OpenStreetMap tiles on the element, created once and kept the right size. */
export function useBaseMap(ref: RefObject<HTMLDivElement | null>) {
  const [map, setMap] = useState<L.Map | null>(null);
  const {theme} = usePrefs();

  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, {zoomControl: true, attributionControl: true}).fitBounds(SYRIA);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    // The panel can change size (sidebar, window, split layout): keep the tiles filling it.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(ref.current);
    setMap(m);
    return () => {
      ro.disconnect();
      m.remove();
      setMap(null);
    };
  }, [ref]);

  useEffect(() => {
    ref.current?.classList.toggle('dark-tiles', theme === 'dark');
  }, [ref, theme, map]);

  return map;
}
