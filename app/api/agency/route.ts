import { NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import { channelStatus } from '@/lib/projects';
import { allProjects, allTenants, globalPendingQueue, usageThisMonth } from '@/lib/sales';
import { activeRuleCount } from '@/src/rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Nivel agencia: por encima de los tenants. Solo `users.is_admin`. */
export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [tenants, projects, usage, queue] = await Promise.all([
    allTenants(),
    allProjects(),
    usageThisMonth(),
    globalPendingQueue(),
  ]);

  return NextResponse.json({
    tenants: tenants.map((t) => ({
      id: t.id,
      email: t.email,
      name: [t.firstName, t.lastName].filter(Boolean).join(' ') || t.username || null,
      isAdmin: t.isAdmin,
      createdAt: t.createdAt,
      projects: projects
        .filter((p) => p.userId === t.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          kind: p.kind,
          status: p.status,
          channels: channelStatus(p),
          rules: activeRuleCount(p),
          usage: usage.get(p.id) ?? { leads: 0, messages: 0, actions: 0 },
        })),
    })),
    pendientes: queue.map((q) => ({
      id: q.action.id,
      kind: q.action.kind,
      reason: q.action.reason,
      createdBy: q.action.createdBy,
      createdAt: q.action.createdAt,
      project: q.projectName,
      tenant: q.tenantEmail,
      lead: q.leadName,
    })),
  });
}
