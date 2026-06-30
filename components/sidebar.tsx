'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
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
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { ActiveCampaignChip } from './active-campaign-chip';

const clerkPK = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const isClerkConfiguredClient =
  /^pk_(test|live)_[A-Za-z0-9_-]{10,}$/.test(clerkPK) && !clerkPK.includes('REPLACE_ME');

type Item = {
  href: string;
  label: string;
  Icon: React.ElementType;
  soon?: boolean;
};

const items: Item[] = [
  { href: '/dashboard', label: 'Inicio', Icon: IconHome },
  { href: '/chat', label: 'Chats', Icon: IconChat },
  { href: '/whatsapp', label: 'WhatsApp', Icon: IconPhone },
  { href: '/knowledge', label: 'Memoria', Icon: IconBrain },
  { href: '/campaigns', label: 'Campañas', Icon: IconFolder },
  { href: '/ads', label: 'Google Ads', Icon: IconTarget },
  { href: '/posts', label: 'Contenido', Icon: IconFile },
  { href: '/plan', label: 'Calendario', Icon: IconCalendar },
  { href: '/analytics', label: 'Analítica', Icon: IconBarChart, soon: true },
  { href: '/audience', label: 'Audiencias', Icon: IconUsers, soon: true },
  { href: '/automations', label: 'Automatizaciones', Icon: IconBolt, soon: true },
  { href: '/integrations', label: 'Integraciones', Icon: IconPlug },
];

const networks = [
  { name: 'WhatsApp', dot: '#2ba87a', enabled: true },
  { name: 'Instagram', dot: '#d6336c', enabled: false },
  { name: 'X (Twitter)', dot: '#221821', enabled: true },
  { name: 'LinkedIn', dot: '#0a66c2', enabled: true },
  { name: 'Facebook', dot: '#1877f2', enabled: false },
  { name: 'TikTok', dot: '#d6336c', enabled: false },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="glass flex h-full w-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2.5 px-2 pt-2">
        <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white shadow-lg shadow-[var(--color-primary)]/20">
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
        <div className="text-[1.6rem] font-semibold leading-none tracking-tight brand-gradient">goossip</div>
      </div>

      <Link
        href="/chat"
        onClick={onNavigate}
        className="btn-brand flex items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-95"
      >
        <span className="flex items-center gap-2">
          <IconPlus className="h-4 w-4" /> Nuevo chat
        </span>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20 text-xs">
          <IconPlus className="h-3 w-3" />
        </span>
      </Link>

      <ActiveCampaignChip onNavigate={onNavigate} />

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
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

      <div className="flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-3">
        <div className="px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          Redes conectadas
        </div>
        {networks.map((n) => (
          <div
            key={n.name}
            className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-[var(--color-accent)]/60"
          >
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: n.enabled ? n.dot : 'transparent', border: n.enabled ? 'none' : `1px solid ${n.dot}` }}
              />
              {n.name}
            </span>
            {n.enabled ? (
              <span className="dot-pulse" style={{ color: '#2ba87a' }}>
                <span className="block h-1.5 w-1.5 rounded-full bg-current" />
              </span>
            ) : (
              <span className="block h-1.5 w-1.5 rounded-full bg-[var(--color-muted)]" />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
        {isClerkConfiguredClient ? (
          <UserButton />
        ) : (
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-[var(--color-primary)]">
            G
          </div>
        )}
        <span className="rounded-md bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-primary)]">
          Pro
        </span>
      </div>
    </div>
  );
}
