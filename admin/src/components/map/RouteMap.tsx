import type {Feature, FeatureCollection, Position} from 'geojson';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {useEffect, useMemo, useRef} from 'react';
import type {TrackPoint} from '../../api/types';
import {usePrefs} from '../../i18n/prefs';
import {bandOf, isBreak, SPEED_BANDS, speedsKmh} from './speed';
import {useBaseMap} from './useBaseMap';

const dot = (cls: string) => L.divIcon({className: '', html: `<span class="map-pin ${cls}"></span>`, iconSize: [18, 18]});

/** Screen distance between two direction arrows. */
const ARROW_SPACING_PX = 70;

/** The lines of a route feature as Leaflet coordinates (the route is a MultiLineString, segments LineStrings). */
function linesOf(f: Feature | undefined): L.LatLng[][] {
  const g = f?.geometry;
  const toLatLngs = (line: Position[]) => line.map(([lon, lat]) => L.latLng(lat, lon));
  if (g?.type === 'LineString') return [toLatLngs(g.coordinates)];
  if (g?.type === 'MultiLineString') return g.coordinates.map(toLatLngs);
  return [];
}

function arrowIcon(angleDeg: number) {
  // An arrowhead pointing along +x, turned to the travel direction (screen angles: clockwise, y down).
  return L.divIcon({
    className: '',
    html: `<svg class="route-arrow" viewBox="0 0 20 20" width="20" height="20" style="transform:rotate(${angleDeg.toFixed(1)}deg)"><circle cx="10" cy="10" r="8.5"/><path d="M5.5 5l9.5 5-9.5 5 2.5-5z"/></svg>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/**
 * Arrows every ARROW_SPACING_PX along the lines, in the direction the points were recorded. Placed in screen
 * space, so the spacing stays even at every zoom; rebuilt on zoom.
 */
function placeArrows(map: L.Map, lines: L.LatLng[][], layer: L.LayerGroup) {
  layer.clearLayers();
  for (const line of lines) {
    const pts = line.map(ll => map.latLngToLayerPoint(ll));
    let untilNext = ARROW_SPACING_PX / 2;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = a.distanceTo(b);
      if (len === 0) continue;
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      let along = untilNext;
      while (along <= len) {
        const p = L.point(a.x + ((b.x - a.x) * along) / len, a.y + ((b.y - a.y) * along) / len);
        L.marker(map.layerPointToLatLng(p), {icon: arrowIcon(angle), interactive: false, keyboard: false}).addTo(layer);
        along += ARROW_SPACING_PX;
      }
      untilNext = along - len;
    }
  }
}

/** The speed-coloured route: one polyline per run of points in the same speed band, broken at pauses. */
function drawSpeed(points: TrackPoint[], kmh: number[], group: L.FeatureGroup) {
  let run: L.LatLng[] = [];
  let band = -1;
  const flush = () => {
    if (run.length > 1) L.polyline(run, {color: SPEED_BANDS[band].color, weight: 5, opacity: 0.95, interactive: false}).addTo(group);
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (isBreak(a, b)) {
      flush();
      run = [];
      band = -1;
      continue;
    }
    // A stretch takes the band of its average speed.
    const next = bandOf((kmh[i - 1] + kmh[i]) / 2);
    if (next !== band) {
      flush();
      run = [L.latLng(a.lat, a.lon)];
      band = next;
    }
    run.push(L.latLng(b.lat, b.lon));
  }
  flush();
}

/**
 * A trip on the map over a road casing: coloured by speed when the points are loaded (teal until then), segments
 * dashed, start and end marked, arrows for the direction of travel, and the speed under the pointer.
 */
export default function RouteMap({data, points}: {data: FeatureCollection; points?: TrackPoint[]}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useBaseMap(el);
  const {t, fmt} = usePrefs();
  const kmh = useMemo(() => (points ? speedsKmh(points) : []), [points]);
  const bySpeed = !!points && points.length > 1;

  // Route, casing, start/end and arrows: rebuilt when the trip changes, not when the points arrive.
  useEffect(() => {
    if (!map) return;
    // The casing lives in its own pane under the overlay pane, so the line drawn later stays on top of it.
    if (!map.getPane('casing')) map.createPane('casing').style.zIndex = '390';
    const group = L.featureGroup().addTo(map);
    for (const f of data.features) {
      const route = f.properties?.kind === 'route';
      // Road casing under the route, like the brand's road band.
      if (route) L.geoJSON(f, {pane: 'casing', style: {color: '#21242A', weight: 9, opacity: 0.25}}).addTo(group);
      else L.geoJSON(f, {style: {color: '#404E5E', weight: 2, dashArray: '5 6', opacity: 0.9}}).addTo(group);
    }

    const main = data.features.find(f => f.properties?.kind === 'route');
    // Without a server route yet, the segments (in recording order) give the direction.
    const lines = main ? linesOf(main) : data.features.flatMap(f => linesOf(f));
    const flat = lines.flat();
    if (flat.length) {
      L.marker(flat[0], {icon: dot('start')}).addTo(group);
      L.marker(flat[flat.length - 1], {icon: dot('end')}).addTo(group);
    }
    if (data.features.length) map.fitBounds(group.getBounds().pad(0.15), {maxZoom: 17, animate: false});
    const arrows = L.layerGroup().addTo(map);
    const redraw = () => placeArrows(map, lines, arrows);
    redraw();
    map.on('zoomend', redraw);
    return () => {
      map.off('zoomend', redraw);
      arrows.remove();
      group.remove();
    };
  }, [map, data]);

  // The line itself: by speed once the points are here, plain teal before.
  useEffect(() => {
    if (!map) return;
    const line = L.featureGroup().addTo(map);
    if (bySpeed) drawSpeed(points!, kmh, line);
    else
      for (const f of data.features)
        if (f.properties?.kind === 'route') L.geoJSON(f, {style: {color: '#0C7C70', weight: 5, opacity: 0.95}}).addTo(line);
    return () => {
      line.remove();
    };
  }, [map, data, points, kmh, bySpeed]);

  // Speed and time of the recorded point nearest to the pointer (within 24 px).
  useEffect(() => {
    if (!map || !bySpeed) return;
    const tip = L.tooltip({direction: 'top', offset: [0, -8], className: 'speed-tip'});
    const probe = L.circleMarker([0, 0], {radius: 6, color: '#fff', weight: 2, fillColor: '#21242A', fillOpacity: 1, interactive: false});
    let frame = 0;
    const onMove = (e: L.LeafletMouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let best = -1;
        let bestD = 24 * 24;
        for (let i = 0; i < points!.length; i++) {
          const p = map.latLngToContainerPoint([points![i].lat, points![i].lon]);
          const d = (p.x - e.containerPoint.x) ** 2 + (p.y - e.containerPoint.y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best < 0) {
          probe.remove();
          tip.remove();
          return;
        }
        const p = points![best];
        const ll = L.latLng(p.lat, p.lon);
        probe.setLatLng(ll).setStyle({fillColor: SPEED_BANDS[bandOf(kmh[best])].color}).addTo(map);
        tip
          .setLatLng(ll)
          .setContent(`<b>${Math.round(kmh[best])} ${t('kmh')}</b><span>${fmt.time(p.recordedAt)}</span>`)
          .addTo(map);
      });
    };
    const onOut = () => {
      cancelAnimationFrame(frame);
      probe.remove();
      tip.remove();
    };
    map.on('mousemove', onMove);
    map.on('mouseout', onOut);
    return () => {
      map.off('mousemove', onMove);
      map.off('mouseout', onOut);
      onOut();
    };
  }, [map, points, kmh, bySpeed, t, fmt]);

  return (
    <>
      <div ref={el} className="leaflet-box" />
      {bySpeed && (
        <div className="speed-legend" aria-label={t('speedLegend')}>
          <b>{t('speedLegend')}</b>
          <span className="bands" dir="ltr">
            {SPEED_BANDS.map(b => (
              <span key={b.label}>
                <i style={{background: b.color}} />
                {b.label}
              </span>
            ))}
          </span>
        </div>
      )}
    </>
  );
}
