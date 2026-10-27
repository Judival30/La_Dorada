import { AppShell } from '@/components/ld/app-shell';
import { requireUser } from '@/server/auth/guard';

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('BUYER');
  return (
    <AppShell role="BUYER" user={{ name: user.name, email: user.email }}>
      {children}
    </AppShell>
  );
}
