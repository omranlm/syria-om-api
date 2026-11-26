import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {useEffect, useRef} from 'react';
import type {LivePosition} from '../../api/types';
import {useBaseMap} from './useBaseMap';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]!);

function icon(p: LivePosition, focused: boolean) {
  // The brand's roundabout; a heading tick when the phone reports a bearing.
  const heading =
    p.bearingDeg !== null ? `<span class="live-heading" style="transform:rotate(${Math.round(p.bearingDeg)}deg)"></span>` : '';
  return L.divIcon({
    className: '',
    html: `<span class="live-marker${focused ? ' focused' : ''}">${heading}<span class="map-pin live"></span></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/** Everyone sharing their location: markers move in place on each refresh instead of being recreated. */
export default function LiveMap({people, focus}: {people: LivePosition[]; focus: string | null}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useBaseMap(el);
  const markers = useRef(new Map<string, L.Marker>());
  const fitted = useRef(false);

  useEffect(() => {
    if (!map) return;
    const seen = new Set<string>();
    for (const p of people) {
      seen.add(p.userId);
      const label = esc(p.userPhone ?? p.userDisplayName ?? p.userId.slice(0, 8));
      const speed = p.speedMps !== null ? ` · ${Math.round(p.speedMps * 3.6)} km/h` : '';
      let m = markers.current.get(p.userId);
      if (!m) {
        m = L.marker([p.lat, p.lon]).addTo(map);
        markers.current.set(p.userId, m);
      } else {
        m.setLatLng([p.lat, p.lon]);
      }
      m.setIcon(icon(p, focus === p.userId));
      m.bindTooltip(`<bdi dir="ltr">${label}</bdi>${speed}`, {direction: 'top', offset: [0, -12]});
    }
    for (const [id, m] of markers.current) {
      if (!seen.has(id)) {
        m.remove();
        markers.current.delete(id);
      }
    }
    // Frame everyone once; afterwards the admin's own panning is kept.
    if (!fitted.current && people.length) {
      map.fitBounds(L.latLngBounds(people.map(p => [p.lat, p.lon])).pad(0.3), {maxZoom: 15});
      fitted.current = true;
    }
  }, [map, people, focus]);

  useEffect(() => {
    if (!map || !focus) return;
    const m = markers.current.get(focus);
    if (m) map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 15), {duration: 0.8});
  }, [map, focus]);

  return <div ref={el} className="leaflet-box" />;
}
