import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Hero } from '@/components/landing/hero';
import { Features } from '@/components/landing/features';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Networks } from '@/components/landing/networks';
import { Pricing } from '@/components/landing/pricing';
import { LandingHeader } from '@/components/landing/header';
import { LandingFooter } from '@/components/landing/footer';
import { isClerkConfigured } from '@/lib/clerk-config';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  if (isClerkConfigured()) {
    try {
      const { userId } = await auth();
      if (userId) redirect('/dashboard');
    } catch {
      /* no session → render landing */
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      <LandingHeader />
      <main>
        <Hero />
        <Networks />
        <Features />
        <HowItWorks />
        <Pricing />
      </main>
      <LandingFooter />
    </div>
  );
}
