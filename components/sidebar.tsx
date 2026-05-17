'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import {
  Plus,
  Home,
  MessageSquare,
  Brain,
  FolderKanban,
  FileText,
  CalendarDays,
  BarChart3,
  Users,
  Zap,
  Plug,
  Phone,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Item = {
  href: string;
  label: string;
  Icon: React.ElementType;
  soon?: boolean;
};

const items: Item[] = [
  { href: '/dashboard', label: 'Inicio', Icon: Home },
  { href: '/chat', label: 'Chats', Icon: MessageSquare },
  { href: '/whatsapp', label: 'WhatsApp', Icon: Phone },
  { href: '/knowledge', label: 'Memoria', Icon: Brain },
  { href: '/projects', label: 'Proyectos', Icon: FolderKanban, soon: true },
  { href: '/posts', label: 'Contenido', Icon: FileText },
  { href: '/plan', label: 'Calendario', Icon: CalendarDays },
  { href: '/analytics', label: 'Analítica', Icon: BarChart3, soon: true },
  { href: '/audience', label: 'Audiencias', Icon: Users, soon: true },
  { href: '/automations', label: 'Automatizaciones', Icon: Zap, soon: true },
  { href: '/integrations', label: 'Integraciones', Icon: Plug, soon: true },
];

const networks = [
  { name: 'WhatsApp', dot: '#34d399', enabled: true },
  { name: 'Instagram', dot: '#e879f9', enabled: false },
  { name: 'X (Twitter)', dot: '#a3a3a3', enabled: true },
  { name: 'LinkedIn', dot: '#60a5fa', enabled: true },
  { name: 'Facebook', dot: '#3b82f6', enabled: false },
  { name: 'TikTok', dot: '#f472b6', enabled: false },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 border-r border-[var(--color-border)] bg-[var(--color-card)]/60 p-4 backdrop-blur">
      <div className="flex items-center gap-2 px-2 pt-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-500 text-sm font-bold">
          oo
        </div>
        <div className="text-2xl font-semibold tracking-tight brand-gradient">goossip</div>
      </div>

      <Link
        href="/chat"
        className="btn-brand flex items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg shadow-fuchsia-500/20 hover:opacity-95"
      >
        <span className="flex items-center gap-2">
          <Plus className="h-4 w-4" /> Nuevo chat
        </span>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-xs">
          <Plus className="h-3 w-3" />
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5">
        {items.map(({ href, label, Icon, soon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-[var(--color-accent)] text-[var(--color-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/60 hover:text-[var(--color-foreground)]',
              )}
            >
              <Icon className="h-4 w-4" />
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
        <div className="px-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Redes conectadas
        </div>
        {networks.map((n) => (
          <div
            key={n.name}
            className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs"
          >
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: n.enabled ? n.dot : 'transparent', border: n.enabled ? 'none' : `1px solid ${n.dot}` }}
              />
              {n.name}
            </span>
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                n.enabled ? 'bg-emerald-400' : 'bg-[var(--color-muted)]',
              )}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
        <UserButton />
        <span className="rounded-md bg-gradient-to-r from-fuchsia-500/20 to-pink-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-fuchsia-300">
          Pro
        </span>
      </div>
    </aside>
  );
}
