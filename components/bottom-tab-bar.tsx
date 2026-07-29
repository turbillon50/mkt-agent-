'use client';

import { usePathname, useRouter } from 'next/navigation';
import { IconHome, IconChat, IconFile, IconUsers, IconMenu } from '@/components/icons';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard', label: 'Inicio', Icon: IconHome },
  { href: '/chat', label: 'Chat', Icon: IconChat },
  { href: '/posts', label: 'Contenido', Icon: IconFile },
  { href: '/leads', label: 'Prospectos', Icon: IconUsers },
];

export function BottomTabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav
      className="tabbar-safe fixed inset-x-0 bottom-0 z-40 lg:hidden"
      aria-label="Navegación principal"
    >
      <div className="mx-3 mb-2 flex items-center justify-between gap-1 rounded-[26px] border border-white/40 bg-white/70 px-2 py-2 shadow-[0_8px_30px_rgba(107,37,69,0.14)] backdrop-blur-xl">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + '/');
          return (
            <button
              key={href}
              onClick={() => router.push(href)}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 transition-colors',
                active
                  ? 'bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white shadow-sm'
                  : 'text-[var(--color-muted-foreground)]'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </button>
          );
        })}
        <button
          onClick={onMore}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[var(--color-muted-foreground)]"
        >
          <IconMenu className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-none">Más</span>
        </button>
      </div>
    </nav>
  );
}

