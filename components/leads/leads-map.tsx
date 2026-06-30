'use client';

import * as React from 'react';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent } from '@/components/ui/card';
import { IconUsers } from '@/components/icons';

type Lead = {
  id: string;
  fullName: string | null;
  company: string | null;
  address: string | null;
  phone: string | null;
  status: string;
  lat: string | null;
  lng: string | null;
  sourceUrl: string;
};

const STATUS_COLOR: Record<string, string> = {
  new: '#d6336c',
  contacted: '#f59e0b',
  qualified: '#22c55e',
  discarded: '#9b96a3',
};
const STATUS_LABEL: Record<string, string> = {
  new: 'nuevo',
  contacted: 'contactado',
  qualified: 'calificado',
  discarded: 'descartado',
};

function pinIcon(L: any, color: string) {
  return L.divIcon({
    className: '',
    html: `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 0C5.8 0 0 5.8 0 13c0 9.2 13 21 13 21s13-11.8 13-21C26 5.8 20.2 0 13 0z" fill="${color}"/>
      <circle cx="13" cy="13" r="5" fill="#fff"/></svg>`,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -32],
  });
}

export function LeadsMap() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<any>(null);
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/leads', { cache: 'no-store' });
        const data = await res.json();
        setLeads(data.leads ?? []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const geo = React.useMemo(
    () => leads.filter((l) => l.lat && l.lng && !Number.isNaN(Number(l.lat)) && !Number.isNaN(Number(l.lng))),
    [leads],
  );

  React.useEffect(() => {
    if (loading || geo.length === 0 || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default ?? (await import('leaflet'));
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, { scrollWheelZoom: false }).setView([23.6, -102.5], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      // limpia marcadores previos
      mapRef.current.eachLayer((layer: any) => {
        if (layer instanceof L.Marker) mapRef.current.removeLayer(layer);
      });

      const points: [number, number][] = [];
      for (const l of geo) {
        const lat = Number(l.lat);
        const lng = Number(l.lng);
        points.push([lat, lng]);
        const color = STATUS_COLOR[l.status] ?? '#d6336c';
        const popup = `<div style="font-size:13px;min-width:160px">
            <strong>${escapeHtml(l.fullName ?? l.company ?? 'Prospecto')}</strong><br/>
            <span style="color:#6b7280">${escapeHtml(STATUS_LABEL[l.status] ?? l.status)}</span>
            ${l.address ? `<br/>${escapeHtml(l.address)}` : ''}
            ${l.phone ? `<br/>📞 ${escapeHtml(l.phone)}` : ''}
            <br/><a href="${escapeAttr(l.sourceUrl)}" target="_blank" rel="noreferrer" style="color:#d6336c">Ver →</a>
          </div>`;
        L.marker([lat, lng], { icon: pinIcon(L, color) }).addTo(mapRef.current).bindPopup(popup);
      }

      if (points.length === 1) {
        mapRef.current.setView(points[0], 13);
      } else if (points.length > 1) {
        mapRef.current.fitBounds(points, { padding: [40, 40] });
      }
      setTimeout(() => mapRef.current?.invalidateSize(), 100);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, geo]);

  React.useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <Card className="card-glow">
        <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">Cargando mapa…</CardContent>
      </Card>
    );
  }

  if (geo.length === 0) {
    return (
      <Card className="card-glow">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <IconUsers className="h-8 w-8 text-[var(--color-muted-foreground)]" />
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Aún no hay prospectos ubicados en el mapa.
          </p>
          <p className="max-w-md text-xs text-[var(--color-muted-foreground)]">
            Los prospectos que vienen de la búsqueda por negocios (Google Maps) traen dirección y se
            ubican aquí automáticamente.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
        <span>
          {geo.length} de {leads.length} prospectos ubicados
        </span>
        {Object.entries(STATUS_LABEL).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[k] }} />
            {label}
          </span>
        ))}
      </div>
      <div
        ref={containerRef}
        className="h-[60vh] min-h-[360px] w-full overflow-hidden rounded-xl border border-[var(--color-border)]"
        style={{ zIndex: 0 }}
      />
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
