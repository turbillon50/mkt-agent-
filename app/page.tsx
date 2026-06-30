import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Hero } from '@/components/landing/hero';
import { Networks } from '@/components/landing/networks';
import { Problem } from '@/components/landing/problem';
import { Features } from '@/components/landing/features';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Pricing } from '@/components/landing/pricing';
import { Testimonials } from '@/components/landing/testimonials';
import { FAQ } from '@/components/landing/faq';
import { FinalCTA } from '@/components/landing/cta';
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
        <Problem />
        <Features />
        <HowItWorks />
        <Pricing />
        <Testimonials />
        <FAQ />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
