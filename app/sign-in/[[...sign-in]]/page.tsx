import { SignIn } from '@clerk/nextjs';

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-6">
      <SignIn appearance={{ variables: { colorPrimary: '#fff' } }} />
    </main>
  );
}
