'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconPlus,
  IconHome,
  IconChat,
  IconBrain,
  IconFolder,
  IconFile,
  IconCalendar,
  IconBarChart,
  IconUsers,
  IconBolt,
  IconPlug,
  IconPhone,
  IconTarget,
  IconArrowUpRight,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { ActiveCampaignChip } from './active-campaign-chip';
import { SidebarProfile } from './sidebar-profile';

type Item = {
  href: string;
  label: string;
  Icon: React.ElementType;
  soon?: boolean;
};

const items: Item[] = [
  { href: '/dashboard', label: 'Inicio', Icon: IconHome },
  { href: '/chat', label: 'Chats', Icon: IconChat },
  { href: '/whatsapp', label: 'WhatsApp', Icon: IconPhone, soon: true },
  { href: '/knowledge', label: 'Memoria', Icon: IconBrain },
  { href: '/campaigns', label: 'Campañas', Icon: IconFolder },
  { href: '/ads', label: 'Google Ads', Icon: IconTarget },
  { href: '/leads', label: 'Prospectos', Icon: IconUsers },
  { href: '/competencia', label: 'Competencia', Icon: IconBarChart },
  { href: '/posts', label: 'Contenido', Icon: IconFile },
  { href: '/plan', label: 'Calendario', Icon: IconCalendar },
  { href: '/analytics', label: 'Analítica', Icon: IconBarChart, soon: true },
  { href: '/audience', label: 'Audiencias', Icon: IconUsers, soon: true },
  { href: '/automations', label: 'Automatizaciones', Icon: IconBolt },
  { href: '/integrations', label: 'Integraciones', Icon: IconPlug },
];

// Cada red lleva a su panel/flujo. Las "connectable" reflejan estado real
// (status API); las demás van a su card de integraciones marcada "próximo".
type Network = {
  key: 'twitter' | 'linkedin' | 'googleads' | 'whatsapp' | 'instagram' | 'facebook' | 'tiktok';
  name: string;
  dot: string;
  href: string;
  connectable: boolean;
};

const networks: Network[] = [
  { key: 'whatsapp', name: 'WhatsApp', dot: '#25d366', href: '/integrations#int-whatsapp', connectable: false },
  { key: 'instagram', name: 'Instagram', dot: '#d6336c', href: '/integrations#int-instagram', connectable: false },
  { key: 'twitter', name: 'X (Twitter)', dot: '#e7e9ea', href: '/integrations#int-twitter', connectable: true },
  { key: 'linkedin', name: 'LinkedIn', dot: '#0a66c2', href: '/integrations#int-linkedin', connectable: true },
  { key: 'googleads', name: 'Google Ads', dot: '#4285f4', href: '/ads', connectable: true },
  { key: 'facebook', name: 'Facebook', dot: '#1877f2', href: '/integrations#int-facebook', connectable: false },
  { key: 'tiktok', name: 'TikTok', dot: '#69c9d0', href: '/integrations#int-tiktok', connectable: false },
];

type Status = Partial<Record<Network['key'], boolean>>;

function useNetworkStatus() {
  const [status, setStatus] = React.useState<Status | null>(null);
  React.useEffect(() => {
    let alive = true;
    fetch('/api/integrations/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => alive && setStatus(d ?? {}))
      .catch(() => alive && setStatus({}));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

function NetworkRow({
  n,
  connected,
  loading,
  onNavigate,
}: {
  n: Network;
  connected: boolean;
  loading: boolean;
  onNavigate?: () => void;
}) {
  const title = n.connectable
    ? connected
      ? `${n.name} · conectado — abrir configuración`
      : `${n.name} — conectar`
    : `${n.name} — próximamente`;

  return (
    <Link
      href={n.href}
      onClick={onNavigate}
      title={title}
      className="group flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-[var(--color-accent)]/70"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full transition-transform group-hover:scale-110"
          style={{
            background: connected ? n.dot : 'transparent',
            border: connected ? 'none' : `1.5px solid ${n.dot}`,
            opacity: connected ? 1 : 0.55,
          }}
        />
        <span className="truncate text-[var(--color-foreground)]/85 group-hover:text-[var(--color-foreground)]">
          {n.name}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        {!n.connectable ? (
          <span className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            pronto
          </span>
        ) : loading ? (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-muted-foreground)]/40" />
        ) : connected ? (
          <span className="dot-pulse" style={{ color: 'var(--color-success)' }}>
            <span className="block h-1.5 w-1.5 rounded-full bg-current" />
          </span>
        ) : (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-[var(--color-primary)] opacity-0 transition-opacity group-hover:opacity-100">
            Conectar
            <IconArrowUpRight className="h-2.5 w-2.5" />
          </span>
        )}
      </span>
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const status = useNetworkStatus();
  const loading = status === null;

  return (
    <div className="glass flex h-full w-full flex-col p-3">
      {/* Header con respiro: logo + tagline */}
      <div className="flex items-center gap-3 px-2 pb-4 pt-4">
        <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white shadow-lg shadow-[var(--color-primary)]/25">
          <svg viewBox="0 0 24 24" fill="none" className="relative z-10 h-5 w-5">
            <path
              d="M4 11a8 8 0 1 1 3.1 6.3L4 18l1-3.1A7.96 7.96 0 0 1 4 11z"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="11" r="2" fill="currentColor" />
          </svg>
          <span className="absolute inset-0 bg-gradient-to-br from-white/25 to-transparent" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[1.55rem] font-semibold tracking-tight brand-gradient">goossip</span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
            Tu copiloto social
          </span>
        </div>
      </div>

      {/* Acciones primarias con aire entre ellas */}
      <div className="flex flex-col gap-2.5 pb-4">
        <Link
          href="/chat"
          onClick={onNavigate}
          className="btn-brand flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold hover:opacity-95"
        >
          <span className="flex items-center gap-2">
            <IconPlus className="h-4 w-4" /> Nuevo chat
          </span>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20 text-xs">
            <IconPlus className="h-3 w-3" />
          </span>
        </Link>

        <ActiveCampaignChip onNavigate={onNavigate} />
      </div>

      {/* Navegación */}
      <nav className="-mx-1 flex flex-1 flex-col gap-0.5 overflow-y-auto px-1">
        {items.map(({ href, label, Icon, soon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                active
                  ? 'bg-[var(--color-accent)] text-[var(--color-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/60 hover:text-[var(--color-foreground)]',
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[var(--color-brand-1)] to-[var(--color-primary)]" />
              )}
              <Icon className={cn('h-4 w-4 transition-colors', active && 'text-[var(--color-primary)]')} />
              <span className="flex-1">{label}</span>
              {soon && (
                <span className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Redes conectadas — clickeables */}
      <div className="mt-3 flex flex-col gap-0.5 border-t border-[var(--color-border)] pt-3">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Redes conectadas
          </span>
          <Link
            href="/integrations"
            onClick={onNavigate}
            className="text-[10px] font-medium text-[var(--color-primary)] hover:underline"
          >
            Gestionar
          </Link>
        </div>
        {networks.map((n) => (
          <NetworkRow
            key={n.key}
            n={n}
            connected={Boolean(status?.[n.key])}
            loading={loading}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {/* Perfil + workspace */}
      <div className="mt-3 border-t border-[var(--color-border)] pt-3">
        <SidebarProfile />
      </div>
    </div>
  );
}
