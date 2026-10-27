import { AppShell } from '@/components/ld/app-shell';
import { requireUser } from '@/server/auth/guard';

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('SELLER');
  return (
    <AppShell role="SELLER" user={{ name: user.name, email: user.email }}>
      {children}
    </AppShell>
  );
}
