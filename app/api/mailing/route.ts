import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/users';
import {
  listCampaigns,
  listTemplates,
  createCampaign,
  createTemplate,
  listTags,
  statusCounts,
  mailingOverview,
} from '@/lib/mailing';
import { isResendConfigured, resendFrom } from '@/lib/resend';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const [campaigns, templates, tags, statuses, overview] = await Promise.all([
      listCampaigns(user.id),
      listTemplates(user.id),
      listTags(user.id),
      statusCounts(user.id),
      mailingOverview(user.id),
    ]);
    return NextResponse.json({
      campaigns,
      templates,
      tags,
      statuses,
      overview,
      brandName: user.brandName ?? null,
      mailer: { configured: isResendConfigured(), from: isResendConfigured() ? resendFrom() : null },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.kind === 'template') {
      const template = await createTemplate(user.id, {
        name: String(body.name ?? '').trim(),
        subject: String(body.subject ?? ''),
        body: String(body.body ?? ''),
      });
      return NextResponse.json({ template });
    }
    const campaign = await createCampaign(user.id, {
      name: String(body.name ?? '').trim(),
      subject: String(body.subject ?? ''),
      body: String(body.body ?? ''),
      segment: body.segment ?? { type: 'all' },
    });
    return NextResponse.json({ campaign });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
